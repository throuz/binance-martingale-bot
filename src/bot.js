import {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getNextStopLossTimes
} from "./strategy.js";

const MAX_PROTECTIVE_ORDER_RETRIES = 5;
const PROTECTIVE_ORDER_RETRY_DELAY_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createBot = ({ exchange, notifier, log, tradeConfig }) => {
  let stopLossTimes = 0;

  const placeAlgoOrderWithRetry = async (order, retryCount = 0) => {
    try {
      await exchange.placeAlgoOrder(order);
    } catch (error) {
      if (retryCount >= MAX_PROTECTIVE_ORDER_RETRIES) {
        const message = `Failed to place ${order.type} order after retries, position may be unprotected!`;
        log(message);
        await notifier.notify(message);
        throw error;
      }
      await wait(PROTECTIVE_ORDER_RETRY_DELAY_MS);
      await placeAlgoOrderWithRetry(order, retryCount + 1);
    }
  };

  const placeProtectiveOrders = async (
    oppositeSide,
    takeProfitPrice,
    stopLossPrice
  ) => {
    const commonFields = {
      symbol: tradeConfig.SYMBOL,
      positionSide: "BOTH",
      side: oppositeSide,
      workingType: "MARK_PRICE",
      closePosition: "true",
      timeInForce: "GTC"
    };
    await placeAlgoOrderWithRetry({
      ...commonFields,
      type: "TAKE_PROFIT_MARKET",
      triggerPrice: takeProfitPrice
    });
    await placeAlgoOrderWithRetry({
      ...commonFields,
      type: "STOP_MARKET",
      triggerPrice: stopLossPrice
    });
  };

  const placeNewOrders = async () => {
    const longShortRatio = await exchange.getLongShortRatio();
    const side = getSideFromLongShortRatio(longShortRatio);
    const oppositeSide = getOppositeSide(side);
    const quantity = getQuantity(
      stopLossTimes,
      tradeConfig.INITIAL_QUANTITY
    ).toString();
    const markPrice = await exchange.getMarkPrice();
    const { takeProfitPrice, stopLossPrice } = getTPSLPrices(
      side,
      stopLossTimes,
      markPrice,
      tradeConfig
    );

    await exchange.placeEntryOrder(side, quantity);
    await placeProtectiveOrders(oppositeSide, takeProfitPrice, stopLossPrice);
    log(`New orders! ${side} ${quantity}`);
    await notifier.notify(`New orders! ${side} ${quantity}`);
  };

  const handleAccountUpdate = async (event) => {
    const balanceEntry = event.a.B.find(
      ({ a }) => a === tradeConfig.QUOTE_ASSET
    );
    if (balanceEntry) {
      const message = `Wallet balance: ${balanceEntry.wb} ${tradeConfig.QUOTE_ASSET}`;
      log(message);
      await notifier.notify(message);
    }
  };

  const handleAlgoUpdate = async (event) => {
    const algoOrder = event.o ?? {};
    const status = algoOrder.algoStatus ?? algoOrder.status;
    const orderType = algoOrder.orderType ?? algoOrder.type;
    log(`Algo order update: ${orderType ?? "?"} ${status ?? "?"}`);
    if (status === "CANCELED") {
      await notifier.notify(
        `Algo order (${orderType ?? "unknown"}) was canceled, please check your position!`
      );
    }
  };

  const isFilledOrder = (event, orderType) =>
    event.e === "ORDER_TRADE_UPDATE" &&
    event.o.ot === orderType &&
    event.o.x === "TRADE" &&
    event.o.X === "FILLED";

  const handleEvent = async (event) => {
    if (event.e === "ACCOUNT_UPDATE") await handleAccountUpdate(event);
    if (event.e === "ALGO_UPDATE") await handleAlgoUpdate(event);

    if (isFilledOrder(event, "TAKE_PROFIT_MARKET")) {
      log("Take profit!");
      await notifier.notify("Take profit!");
      stopLossTimes = 0;
      await placeNewOrders();
    }

    if (isFilledOrder(event, "STOP_MARKET")) {
      log("Stop loss!");
      await notifier.notify("Stop loss!");
      const [availableBalance, markPrice] = await Promise.all([
        exchange.getAvailableBalance(),
        exchange.getMarkPrice()
      ]);
      const availableQuantity = getAvailableQuantity(
        availableBalance,
        markPrice,
        tradeConfig.LEVERAGE
      );
      stopLossTimes = getNextStopLossTimes(
        stopLossTimes,
        availableQuantity,
        tradeConfig.INITIAL_QUANTITY
      );
      await placeNewOrders();
    }
  };

  return { start: placeNewOrders, handleEvent };
};

export { createBot };
