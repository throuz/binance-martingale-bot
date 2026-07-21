import tradeConfig from "./trade-config.js";
import { binanceRequest } from "./api-clients.js";

const {
  QUOTE_ASSET,
  SYMBOL,
  LEVERAGE,
  FEE_RATE,
  TP_SL_RATE,
  INITIAL_QUANTITY
} = tradeConfig;

const getQuantity = (stopLossTimes) => INITIAL_QUANTITY * 2 ** stopLossTimes;

const getAvailableBalance = async () => {
  const balances = await binanceRequest(
    "GET",
    "/fapi/v1/balance",
    {},
    { signed: true }
  );
  const balanceEntry = balances.find(({ asset }) => asset === QUOTE_ASSET);
  return balanceEntry.withdrawAvailable;
};

const getMarkPrice = async () => {
  const { markPrice } = await binanceRequest("GET", "/fapi/v1/premiumIndex", {
    symbol: SYMBOL
  });
  return markPrice;
};

const getOppositeSide = (side) => {
  if (side === "BUY") {
    return "SELL";
  }
  if (side === "SELL") {
    return "BUY";
  }
};

const getTPSLPrices = async (side, stopLossTimes) => {
  let takeProfitPrice;
  let stopLossPrice;
  const markPrice = await getMarkPrice();
  const orderCostRate = LEVERAGE * FEE_RATE * 2; // 3%
  const tpslRate = TP_SL_RATE + orderCostRate * (stopLossTimes + 1);
  const higherClosingPrice = (
    Math.round(markPrice * (1 + tpslRate / LEVERAGE) * 10) / 10
  ).toString();
  const lowerClosingPrice = (
    Math.round(markPrice * (1 - tpslRate / LEVERAGE) * 10) / 10
  ).toString();
  if (side === "BUY") {
    takeProfitPrice = higherClosingPrice;
    stopLossPrice = lowerClosingPrice;
  } else {
    takeProfitPrice = lowerClosingPrice;
    stopLossPrice = higherClosingPrice;
  }
  return { takeProfitPrice, stopLossPrice };
};

const getSide = async () => {
  const [{ longShortRatio }] = await binanceRequest(
    "GET",
    "/futures/data/topLongShortPositionRatio",
    { symbol: SYMBOL, period: "5m", limit: "1" }
  );
  return longShortRatio > 1 ? "BUY" : "SELL";
};

const getAvailableQuantity = async () => {
  const availableBalance = await getAvailableBalance();
  const markPrice = await getMarkPrice();
  const availableFunds = availableBalance * LEVERAGE;
  return Math.trunc((availableFunds / markPrice) * 1000) / 1000;
};

export {
  getQuantity,
  getAvailableBalance,
  getMarkPrice,
  getOppositeSide,
  getTPSLPrices,
  getSide,
  getAvailableQuantity
};
