import { isOpenPosition } from "./trader.js";

const createReconciler = ({ exchange, trader }) => {
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
    if (
      isOpenPosition(position) &&
      position.marginType &&
      position.marginType.toUpperCase() !== trader.getRuntimeConfig().MARGIN_TYPE
    ) {
      throw new Error(
        `Existing position uses ${position.marginType.toUpperCase()} margin; ` +
          `close it before switching to ${trader.getRuntimeConfig().MARGIN_TYPE}`
      );
    }
    await exchange.setLeverage(trader.getRuntimeConfig().LEVERAGE);
    if (!isOpenPosition(position)) {
      try {
        await exchange.setMarginType();
      } catch (error) {
        if (error.body?.code !== -4046) throw error;
      }
    }
  };

  const reconcile = async (stopLossTimes) => {
    await trader.loadMarketMetadata();
    const position = await exchange.getPosition();
    if (isOpenPosition(position)) {
      await configureAccount(position);
      if (position.positionSide !== "BOTH") {
        throw new Error("Existing position is not in One-way Mode");
      }
      const algoOrders = await exchange.getOpenAlgoOrders();
      const inferredStopLossTimes = await trader.ensureProtection(
        position,
        algoOrders
      );
      return { stopLossTimes: inferredStopLossTimes, adopted: true };
    }

    if (trader.hasManagedProtection()) {
      stopLossTimes = await trader.resolveClosedPosition(stopLossTimes);
    }
    await cleanFlatAccount();
    await configureAccount(position);
    const openedStopLossTimes = await trader.openPosition(stopLossTimes);
    return { stopLossTimes: openedStopLossTimes, adopted: false };
  };

  return { reconcile };
};

export { createReconciler };
