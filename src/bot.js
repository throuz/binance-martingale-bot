import { randomUUID } from "node:crypto";
import {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getNextStopLossTimes,
  normalizeQuantity
} from "./strategy.js";

const MAX_ORDER_RETRIES = 5;
const ORDER_RETRY_DELAY_MS = 500;
const POSITION_SYNC_ATTEMPTS = 20;
const POSITION_SYNC_DELAY_MS = 500;
const RECONCILE_INTERVAL_MS = 60000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createClientId = (purpose) =>
  `martingale-${purpose}-${randomUUID().slice(0, 8)}`;

const createBot = ({
  exchange,
  notifier,
  log,
  tradeConfig,
  maxOrderRetries = MAX_ORDER_RETRIES,
  orderRetryDelayMs = ORDER_RETRY_DELAY_MS
}) => {
  let stopLossTimes = 0;
  let reconcileInterval;
  let operationQueue = Promise.resolve();
  let runtimeConfig = tradeConfig;
  let symbolRules;

  const serialize = (operation) => {
    const result = operationQueue.then(operation);
    operationQueue = result.catch(() => undefined);
    return result;
  };

  const isOpenPosition = (position) =>
    Boolean(position && Number(position.positionAmt) !== 0);

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

  const loadMarketMetadata = async () => {
    if (symbolRules) return;
    const [rules, commission] = await Promise.all([
      exchange.getSymbolRules(),
      exchange.getCommissionRate()
    ]);
    symbolRules = rules;
    runtimeConfig = {
      ...tradeConfig,
      FEE_RATE: Number(commission.takerCommissionRate ?? tradeConfig.FEE_RATE),
      TICK_SIZE: rules.tickSize
    };
  };

  const placeAlgoOrderSafely = async (order, retryCount = 0) => {
    try {
      return await exchange.placeAlgoOrder(order);
    } catch (error) {
      // A timed-out placement may still have succeeded. Query its stable ID
      // before retrying so a network failure cannot create duplicates.
      try {
        const existing = await exchange.getAlgoOrder(order.clientAlgoId);
        if (existing) return existing;
      } catch {
        // Not found or temporarily unavailable; use the bounded retry below.
      }
      if (error.name === "HttpError" && error.status < 500) throw error;
      if (retryCount >= maxOrderRetries) throw error;
      await wait(orderRetryDelayMs);
      return placeAlgoOrderSafely(order, retryCount + 1);
    }
  };

  const placeMissingProtectiveOrders = async (position, openAlgoOrders = []) => {
    const quantity = Math.abs(Number(position.positionAmt));
    const side = Number(position.positionAmt) > 0 ? "BUY" : "SELL";
    const oppositeSide = getOppositeSide(side);
    stopLossTimes = inferStopLossTimes(quantity);
    const referencePrice = Number(position.entryPrice) || (await exchange.getMarkPrice());
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
    const isValidProtection = (order) => {
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
      (openAlgoOrders.length !== 2 || !openAlgoOrders.every(isValidProtection))
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
    const message = "Emergency position close completed.";
    log(message);
    await notifier.notify(message);
  };

  const placeNewOrders = async () => {
    const [longShortRatio, markPrice, availableBalance] = await Promise.all([
      exchange.getLongShortRatio(),
      exchange.getMarkPrice(),
      exchange.getAvailableBalance()
    ]);
    const side = getSideFromLongShortRatio(longShortRatio);
    const quantity = getQuantity(
      stopLossTimes,
      runtimeConfig.INITIAL_QUANTITY
    );
    const normalizedQuantity = normalizeQuantity(quantity, symbolRules.stepSize);
    if (Number(normalizedQuantity) < Number(symbolRules.minQuantity)) {
      throw new Error("Configured quantity is below Binance minimum quantity");
    }
    const availableQuantity = getAvailableQuantity(
      availableBalance,
      markPrice,
      runtimeConfig.LEVERAGE,
      symbolRules.stepSize
    );
    if (Number(normalizedQuantity) > availableQuantity) {
      stopLossTimes = 0;
      throw new Error("Insufficient available balance for the initial quantity");
    }

    await exchange.placeEntryOrder(
      side,
      normalizedQuantity,
      createClientId("entry")
    );
    const position = await syncPosition(true);
    try {
      await placeMissingProtectiveOrders(position);
    } catch (error) {
      await emergencyClose(error);
      throw error;
    }
    log(`New protected position! ${side} ${normalizedQuantity}`);
    await notifier.notify(`New protected position! ${side} ${normalizedQuantity}`);
  };

  const cleanFlatAccount = async () => {
    const [orders, algoOrders] = await Promise.all([
      exchange.getOpenOrders(),
      exchange.getOpenAlgoOrders()
    ]);
    if (orders.length > 0) await exchange.cancelAllOrders();
    if (algoOrders.length > 0) await exchange.cancelAllAlgoOrders();
  };

  const configureAccount = async (position) => {
    const { dualSidePosition } = await exchange.getPositionMode();
    const isHedgeMode =
      dualSidePosition === true || dualSidePosition === "true";
    if (isHedgeMode && isOpenPosition(position)) {
      throw new Error("Cannot switch an open Hedge Mode position to One-way Mode");
    }
    if (isHedgeMode) await exchange.setOneWayMode();
    await exchange.setLeverage();
    if (!isOpenPosition(position)) {
      try {
        await exchange.setMarginType();
      } catch (error) {
        // Binance -4046 means the requested margin type is already active.
        if (error.body?.code !== -4046) throw error;
      }
    }
  };

  const reconcile = async () => {
    await loadMarketMetadata();
    const position = await exchange.getPosition();
    if (isOpenPosition(position)) {
      await configureAccount(position);
      if (position.positionSide !== "BOTH") {
        throw new Error("Existing position is not in One-way Mode");
      }
      const algoOrders = await exchange.getOpenAlgoOrders();
      await placeMissingProtectiveOrders(position, algoOrders);
      log("Position and protective orders synchronized.");
      return;
    }
    await cleanFlatAccount();
    await configureAccount(position);
    await placeNewOrders();
  };

  const start = () =>
    serialize(async () => {
      await reconcile();
      reconcileInterval = setInterval(() => {
        serialize(reconcile).catch(async (error) => {
          log(`Periodic reconciliation failed: ${error.message}`);
          await notifier.notify(`Periodic reconciliation failed: ${error.message}`);
        });
      }, RECONCILE_INTERVAL_MS);
    });

  const handleFilledOrder = async (isStopLoss) => {
    await exchange.cancelAllAlgoOrders();
    await syncPosition(false);
    if (isStopLoss) {
      const [availableBalance, markPrice] = await Promise.all([
        exchange.getAvailableBalance(),
        exchange.getMarkPrice()
      ]);
      stopLossTimes = getNextStopLossTimes(
        stopLossTimes,
        getAvailableQuantity(
          availableBalance,
          markPrice,
          runtimeConfig.LEVERAGE,
          symbolRules.stepSize
        ),
        runtimeConfig.INITIAL_QUANTITY
      );
    } else {
      stopLossTimes = 0;
    }
    await configureAccount(null);
    await placeNewOrders();
  };

  const handleEvent = (event) =>
    serialize(async () => {
      if (event.e === "ACCOUNT_UPDATE") {
        const balance = event.a.B.find(({ a }) => a === tradeConfig.QUOTE_ASSET);
        if (balance) log(`Wallet balance: ${balance.wb} ${tradeConfig.QUOTE_ASSET}`);
      }
      if (event.e === "ALGO_UPDATE") {
        const order = event.o ?? {};
        const status = order.algoStatus ?? order.status;
        if (["CANCELED", "REJECTED", "EXPIRED"].includes(status)) {
          await notifier.notify(`Protective order ${status}; reconciling now.`);
          await reconcile();
        }
        return;
      }
      if (event.e !== "ORDER_TRADE_UPDATE") return;
      const filled = event.o.x === "TRADE" && event.o.X === "FILLED";
      if (!filled) return;
      if (event.o.ot === "TAKE_PROFIT_MARKET") {
        await notifier.notify("Take profit!");
        await handleFilledOrder(false);
      }
      if (event.o.ot === "STOP_MARKET") {
        await notifier.notify("Stop loss!");
        await handleFilledOrder(true);
      }
    });

  const stop = () => clearInterval(reconcileInterval);

  return { start, stop, reconcile: () => serialize(reconcile), handleEvent };
};

export { createBot };
