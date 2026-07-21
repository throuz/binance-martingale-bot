const getQuantity = (stopLossTimes, initialQuantity) =>
  initialQuantity * 2 ** stopLossTimes;

const getOppositeSide = (side) => {
  if (side === "BUY") return "SELL";
  if (side === "SELL") return "BUY";
  throw new Error(`Invalid order side: ${side}`);
};

const formatToStep = (value, step, rounding) => {
  const numericStep = Number(step);
  const precision = (step.toString().split(".")[1] ?? "")
    .replace(/0+$/, "").length;
  return (rounding(Number(value) / numericStep) * numericStep).toFixed(precision);
};

const normalizeQuantity = (quantity, stepSize = "0.001") =>
  formatToStep(quantity, stepSize, Math.floor);

const normalizeQuantityUp = (quantity, stepSize = "0.001") =>
  formatToStep(quantity, stepSize, Math.ceil);

const normalizePrice = (price, tickSize = "0.1") =>
  formatToStep(price, tickSize, Math.round);

const getTPSLPrices = (side, stopLossTimes, markPrice, config) => {
  const { LEVERAGE, FEE_RATE, TP_SL_RATE } = config;
  const orderCostRate = LEVERAGE * FEE_RATE * 2;
  const tpslRate = TP_SL_RATE + orderCostRate * (stopLossTimes + 1);
  const higherClosingPrice = normalizePrice(
    markPrice * (1 + tpslRate / LEVERAGE),
    config.TICK_SIZE
  );
  const lowerClosingPrice = normalizePrice(
    markPrice * (1 - tpslRate / LEVERAGE),
    config.TICK_SIZE
  );

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

const getAvailableQuantity = (
  availableBalance,
  markPrice,
  leverage,
  stepSize = "0.001"
) => {
  const availableFunds = availableBalance * leverage;
  return Number(normalizeQuantity(availableFunds / markPrice, stepSize));
};

const getMinimumQuantity = (
  minQuantity,
  minNotional,
  markPrice,
  stepSize = "0.001"
) =>
  normalizeQuantityUp(
    Math.max(Number(minQuantity), Number(minNotional) / Number(markPrice)),
    stepSize
  );

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
  normalizeQuantity,
  normalizeQuantityUp,
  normalizePrice,
  getTPSLPrices,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getMinimumQuantity,
  getNextStopLossTimes
};
