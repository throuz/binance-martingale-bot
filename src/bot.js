import { createTrader } from "./trader.js";
import { createReconciler } from "./reconciler.js";

const RECONCILE_INTERVAL_MS = 60000;

const createBot = ({
  exchange,
  notifier,
  log,
  tradeConfig,
  maxOrderRetries,
  orderRetryDelayMs
}) => {
  let stopLossTimes = 0;
  let reconcileInterval;
  let operationQueue = Promise.resolve();
  const trader = createTrader({
    exchange,
    notifier,
    log,
    tradeConfig,
    maxOrderRetries,
    orderRetryDelayMs
  });
  const reconciler = createReconciler({ exchange, trader });

  const serialize = (operation) => {
    const result = operationQueue.then(operation);
    operationQueue = result.catch(() => undefined);
    return result;
  };

  const reconcile = async () => {
    const result = await reconciler.reconcile(stopLossTimes);
    stopLossTimes = result.stopLossTimes;
    if (result.adopted) log("Position and protective orders synchronized.");
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
    stopLossTimes = await trader.settleFilledPosition(
      isStopLoss,
      stopLossTimes
    );
    await reconcile();
  };

  const handleEvent = (event) =>
    serialize(async () => {
      if (event.e === "ACCOUNT_UPDATE") {
        const balance = event.a.B.find(({ a }) => a === tradeConfig.QUOTE_ASSET);
        if (balance) log(`Wallet balance: ${balance.wb} ${tradeConfig.QUOTE_ASSET}`);
        return;
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
