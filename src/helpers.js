import crypto from "node:crypto";
import querystring from "node:querystring";
import env from "./env.js";
import tradeConfig from "./trade-config.js";
import { binanceFuturesAPI, taAPI } from "./axios-instances.js";
import { handleAPIError, log } from "./common.js";

const { SECRET_KEY } = env;
const {
  BASE_ASSET,
  QUOTE_ASSET,
  SYMBOL,
  LEVERAGE,
  FEE_RATE,
  TP_SL_RATE,
  INITIAL_QUANTITY
} = tradeConfig;

const getQuantity = (stopLossTimes) => INITIAL_QUANTITY * 2 ** stopLossTimes;

const getSignature = (queryString) =>
  crypto.createHmac("sha256", SECRET_KEY).update(queryString).digest("hex");

const getAvailableBalance = async () => {
  try {
    const totalParams = { timestamp: Date.now() };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/fapi/v1/balance?${queryString}&signature=${signature}`
    );
    const availableBalance = response.data.find(
      ({ asset }) => asset === QUOTE_ASSET
    ).withdrawAvailable;
    return availableBalance;
  } catch (error) {
    await handleAPIError(error);
  }
};

const getMarkPrice = async () => {
  try {
    const totalParams = { symbol: SYMBOL };
    const queryString = querystring.stringify(totalParams);

    const response = await binanceFuturesAPI.get(
      `/fapi/v1/premiumIndex?${queryString}`
    );
    return response.data.markPrice;
  } catch (error) {
    await handleAPIError(error);
  }
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
  try {
    const totalParams = { symbol: SYMBOL, period: "5m", limit: "1" };
    const queryString = querystring.stringify(totalParams);

    const response = await binanceFuturesAPI.get(
      `/futures/data/topLongShortPositionRatio?${queryString}`
    );
    return response.data[0].longShortRatio > 1 ? "BUY" : "SELL";
  } catch (error) {
    await handleAPIError(error);
  }
};

const getAvailableQuantity = async () => {
  const availableBalance = await getAvailableBalance();
  const markPrice = await getMarkPrice();
  const availableFunds = availableBalance * LEVERAGE;
  return Math.trunc((availableFunds / markPrice) * 1000) / 1000;
};

const getPositionAmount = async () => {
  try {
    const totalParams = { symbol: SYMBOL, timestamp: Date.now() };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/fapi/v2/positionRisk?${queryString}&signature=${signature}`
    );
    return response.data[0].positionAmt;
  } catch (error) {
    await handleAPIError(error);
  }
};

const getMaxNotionalValue = async () => {
  try {
    const totalParams = {
      symbol: SYMBOL,
      leverage: LEVERAGE,
      timestamp: Date.now()
    };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.post(
      `/fapi/v1/leverage?${queryString}&signature=${signature}`
    );
    return response.data.maxNotionalValue;
  } catch (error) {
    await handleAPIError(error);
  }
};

const getMaxAllowableQuantity = async () => {
  const maxNotionalValue = await getMaxNotionalValue();
  const markPrice = await getMarkPrice();
  const minTradeAmount = markPrice / 1000;
  return Math.trunc(maxNotionalValue / minTradeAmount) / 1000;
};

const getAllowableQuantity = async () => {
  try {
    const totalParams = { symbol: SYMBOL, timestamp: Date.now() };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/fapi/v2/positionRisk?${queryString}&signature=${signature}`
    );
    const { maxNotionalValue, positionAmt } = response.data[0];
    const markPrice = await getMarkPrice();
    const maxAllowableQuantity =
      Math.trunc((maxNotionalValue / markPrice) * 1000) / 1000;
    return maxAllowableQuantity - Math.abs(positionAmt);
  } catch (error) {
    await handleAPIError(error);
  }
};

const getSignal = async () => {
  try {
    const totalParams = {
      exchange: "binance",
      symbol: `${BASE_ASSET}/${QUOTE_ASSET}`,
      interval: "1m"
    };
    const queryString = querystring.stringify(totalParams);

    const response = await taAPI.get(`/rsi?${queryString}`);
    const RSI = response.data.value;
    log(`RSI: ${RSI}`);
    if (RSI < 30) {
      return "BUY";
    }
    if (RSI > 70) {
      return "SELL";
    }
    return "NONE";
  } catch (error) {
    await handleAPIError(error);
  }
};

const getOrderQuantity = async () => {
  const availableQuantity = await getAvailableQuantity();
  const allowableQuantity = await getAllowableQuantity();
  return Math.min(availableQuantity, allowableQuantity) === 0 ? 0 : 0.001;
};

const getPositionDirection = (positionAmount) => {
  if (positionAmount === 0) {
    return "NONE";
  }
  if (positionAmount > 0) {
    return "BUY";
  }
  if (positionAmount < 0) {
    return "SELL";
  }
};

export {
  getQuantity,
  getSignature,
  getAvailableBalance,
  getMarkPrice,
  getOppositeSide,
  getTPSLPrices,
  getSide,
  getAvailableQuantity,
  getPositionAmount,
  getMaxNotionalValue,
  getMaxAllowableQuantity,
  getAllowableQuantity,
  getSignal,
  getOrderQuantity,
  getPositionDirection
};
