const getQuantity = (stopLossTimes, initialQuantity) =>
  initialQuantity * 2 ** stopLossTimes;

const getOppositeSide = (side) => {
  if (side === "BUY") return "SELL";
  if (side === "SELL") return "BUY";
  throw new Error(`Invalid order side: ${side}`);
};

const getTPSLPrices = (side, stopLossTimes, markPrice, config) => {
  const { LEVERAGE, FEE_RATE, TP_SL_RATE } = config;
  const orderCostRate = LEVERAGE * FEE_RATE * 2;
  const tpslRate = TP_SL_RATE + orderCostRate * (stopLossTimes + 1);
  const higherClosingPrice = (
    Math.round(markPrice * (1 + tpslRate / LEVERAGE) * 10) / 10
  ).toString();
  const lowerClosingPrice = (
    Math.round(markPrice * (1 - tpslRate / LEVERAGE) * 10) / 10
  ).toString();

  if (side === "BUY") {
    return {
      takeProfitPrice: higherClosingPrice,
      stopLossPrice: lowerClosingPrice
    };
  }
  if (side === "SELL") {
    return {
      takeProfitPrice: lowerClosingPrice,
      stopLossPrice: higherClosingPrice
    };
  }
  throw new Error(`Invalid order side: ${side}`);
};

const getSideFromLongShortRatio = (longShortRatio) =>
  Number(longShortRatio) > 1 ? "BUY" : "SELL";

const getAvailableQuantity = (availableBalance, markPrice, leverage) => {
  const availableFunds = availableBalance * leverage;
  return Math.trunc((availableFunds / markPrice) * 1000) / 1000;
};

const getNextStopLossTimes = (
  currentStopLossTimes,
  availableQuantity,
  initialQuantity
) => {
  const nextStopLossTimes = currentStopLossTimes + 1;
  const nextQuantity = getQuantity(nextStopLossTimes, initialQuantity);
  return nextQuantity > availableQuantity ? 0 : nextStopLossTimes;
};

export {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getNextStopLossTimes
};
