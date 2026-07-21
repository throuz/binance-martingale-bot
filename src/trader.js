import { randomUUID } from "node:crypto";
import {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getMinimumQuantity,
  getNextStopLossTimes,
  normalizeQuantity
} from "./strategy.js";

const MAX_ORDER_RETRIES = 5;
const ORDER_RETRY_DELAY_MS = 500;
const POSITION_SYNC_ATTEMPTS = 20;
const POSITION_SYNC_DELAY_MS = 500;
const FALLBACK_TAKER_FEE_RATE = 0.0005;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createClientId = (purpose) =>
  `martingale-${purpose}-${randomUUID().slice(0, 8)}`;

const isOpenPosition = (position) =>
  Boolean(position && Number(position.positionAmt) !== 0);

const createTrader = ({
  exchange,
  notifier,
  log,
  tradeConfig,
  maxOrderRetries = MAX_ORDER_RETRIES,
  orderRetryDelayMs = ORDER_RETRY_DELAY_MS
}) => {
  let runtimeConfig = tradeConfig;
  let symbolRules;

  const loadMarketMetadata = async () => {
    if (symbolRules) return;
    const [rules, maximumLeverage, markPrice, commission] = await Promise.all([
      exchange.getSymbolRules(),
      exchange.getMaximumLeverage(),
      exchange.getMarkPrice(),
      exchange.getCommissionRate().catch(() => null)
    ]);
    symbolRules = rules;
    runtimeConfig = {
      ...tradeConfig,
      QUOTE_ASSET: rules.quoteAsset,
      LEVERAGE: maximumLeverage,
      FEE_RATE: Number(
        commission?.takerCommissionRate ?? FALLBACK_TAKER_FEE_RATE
      ),
      INITIAL_QUANTITY: Number(
        getMinimumQuantity(
          rules.minQuantity,
          rules.minNotional,
          markPrice,
          rules.stepSize
        )
      ),
      TICK_SIZE: rules.tickSize
    };
    log(
      `Loaded ${tradeConfig.SYMBOL}: ${runtimeConfig.INITIAL_QUANTITY} minimum quantity, ` +
        `${runtimeConfig.LEVERAGE}x leverage, ${runtimeConfig.QUOTE_ASSET} collateral.`
    );
  };

  const getRuntimeConfig = () => runtimeConfig;

  const syncPosition = async (shouldBeOpen) => {
    for (let attempt = 0; attempt < POSITION_SYNC_ATTEMPTS; attempt += 1) {
      const position = await exchange.getPosition();
      if (isOpenPosition(position) === shouldBeOpen) return position;
      await wait(POSITION_SYNC_DELAY_MS);
    }
    throw new Error(
      `Position did not become ${shouldBeOpen ? "open" : "flat"} in time`
    );
  };

  const inferStopLossTimes = (quantity) => {
    const ratio = Math.abs(quantity) / runtimeConfig.INITIAL_QUANTITY;
    const inferred = Math.max(0, Math.round(Math.log2(ratio)));
    return Math.abs(2 ** inferred - ratio) < 1e-8 ? inferred : 0;
  };

  const placeAlgoOrderSafely = async (order, retryCount = 0) => {
    try {
      return await exchange.placeAlgoOrder(order);
    } catch (error) {
      try {
        const existing = await exchange.getAlgoOrder(order.clientAlgoId);
        if (existing) return existing;
      } catch {
        // The query did not confirm placement; continue with the checks below.
      }
      if (error.name === "HttpError" && error.status < 500) throw error;
      if (retryCount >= maxOrderRetries) throw error;
      await wait(orderRetryDelayMs);
      return placeAlgoOrderSafely(order, retryCount + 1);
    }
  };

  const ensureProtection = async (position, openAlgoOrders = []) => {
    const quantity = Math.abs(Number(position.positionAmt));
    const side = Number(position.positionAmt) > 0 ? "BUY" : "SELL";
    const oppositeSide = getOppositeSide(side);
    const stopLossTimes = inferStopLossTimes(quantity);
    const referencePrice =
      Number(position.entryPrice) || (await exchange.getMarkPrice());
    const { takeProfitPrice, stopLossPrice } = getTPSLPrices(
      side,
      stopLossTimes,
      referencePrice,
      runtimeConfig
    );
    const expectedPrices = new Map([
      ["TAKE_PROFIT_MARKET", takeProfitPrice],
      ["STOP_MARKET", stopLossPrice]
    ]);
    const isValid = (order) => {
      const type = order.orderType ?? order.type;
      const triggerPrice = order.triggerPrice ?? order.stopPrice;
      const closesPosition =
        order.closePosition === true || order.closePosition === "true";
      return (
        expectedPrices.has(type) &&
        order.side === oppositeSide &&
        closesPosition &&
        Number(triggerPrice) === Number(expectedPrices.get(type))
      );
    };

    if (
      openAlgoOrders.length > 0 &&
      (openAlgoOrders.length !== 2 || !openAlgoOrders.every(isValid))
    ) {
      await exchange.cancelAllAlgoOrders();
      openAlgoOrders = [];
    }
    const existingTypes = new Set(
      openAlgoOrders.map((order) => order.orderType ?? order.type)
    );
    const commonFields = {
      symbol: tradeConfig.SYMBOL,
      positionSide: "BOTH",
      side: oppositeSide,
      workingType: "MARK_PRICE",
      closePosition: "true",
      timeInForce: "GTC"
    };

    if (!existingTypes.has("TAKE_PROFIT_MARKET")) {
      await placeAlgoOrderSafely({
        ...commonFields,
        type: "TAKE_PROFIT_MARKET",
        triggerPrice: takeProfitPrice,
        clientAlgoId: createClientId("tp")
      });
    }
    if (!existingTypes.has("STOP_MARKET")) {
      await placeAlgoOrderSafely({
        ...commonFields,
        type: "STOP_MARKET",
        triggerPrice: stopLossPrice,
        clientAlgoId: createClientId("sl")
      });
    }
    return stopLossTimes;
  };

  const emergencyClose = async (cause) => {
    const warning = `Protection failed; attempting emergency close: ${cause.message}`;
    log(warning);
    await notifier.notify(warning);
    await exchange.cancelAllAlgoOrders().catch(() => undefined);
    const position = await exchange.getPosition();
    if (isOpenPosition(position)) {
      const side = Number(position.positionAmt) > 0 ? "SELL" : "BUY";
      await exchange.closePosition(
        side,
        Math.abs(Number(position.positionAmt)).toString(),
        createClientId("emergency")
      );
    }
    log("Emergency position close completed.");
    await notifier.notify("Emergency position close completed.");
  };

  const openPosition = async (requestedStopLossTimes) => {
    await loadMarketMetadata();
    const [longShortRatio, markPrice, availableBalance] = await Promise.all([
      exchange.getLongShortRatio(),
      exchange.getMarkPrice(),
      exchange.getAvailableBalance(runtimeConfig.QUOTE_ASSET)
    ]);
    const availableQuantity = getAvailableQuantity(
      availableBalance,
      markPrice,
      runtimeConfig.LEVERAGE,
      symbolRules.stepSize
    );
    let stopLossTimes = requestedStopLossTimes;
    let quantity = normalizeQuantity(
      getQuantity(stopLossTimes, runtimeConfig.INITIAL_QUANTITY),
      symbolRules.stepSize
    );
    if (Number(quantity) > availableQuantity && stopLossTimes > 0) {
      stopLossTimes = 0;
      quantity = normalizeQuantity(
        runtimeConfig.INITIAL_QUANTITY,
        symbolRules.stepSize
      );
    }
    if (Number(quantity) < Number(symbolRules.minQuantity)) {
      throw new Error("Configured quantity is below Binance minimum quantity");
    }
    if (Number(quantity) > availableQuantity) {
      throw new Error("Insufficient available balance for the initial quantity");
    }

    const side = getSideFromLongShortRatio(longShortRatio);
    await exchange.placeEntryOrder(side, quantity, createClientId("entry"));
    const position = await syncPosition(true);
    try {
      await ensureProtection(position);
    } catch (error) {
      await emergencyClose(error);
      throw error;
    }
    log(`New protected position! ${side} ${quantity}`);
    await notifier.notify(`New protected position! ${side} ${quantity}`);
    return stopLossTimes;
  };

  const settleFilledPosition = async (isStopLoss, currentStopLossTimes) => {
    await exchange.cancelAllAlgoOrders();
    await syncPosition(false);
    if (!isStopLoss) return 0;
    const [availableBalance, markPrice] = await Promise.all([
      exchange.getAvailableBalance(runtimeConfig.QUOTE_ASSET),
      exchange.getMarkPrice()
    ]);
    return getNextStopLossTimes(
      currentStopLossTimes,
      getAvailableQuantity(
        availableBalance,
        markPrice,
        runtimeConfig.LEVERAGE,
        symbolRules.stepSize
      ),
      runtimeConfig.INITIAL_QUANTITY
    );
  };

  return {
    loadMarketMetadata,
    getRuntimeConfig,
    inferStopLossTimes,
    ensureProtection,
    openPosition,
    settleFilledPosition
  };
};

export { createTrader, isOpenPosition };
