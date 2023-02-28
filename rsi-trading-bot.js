import querystring from "node:querystring";
import { binanceFuturesAPI, taAPI } from "./src/axios-instances.js";
import { handleAPIError, sendLineNotify, log } from "./src/common.js";
import {
  getSignature,
  getAvailableQuantity,
  getPositionAmount,
  getAllowableQuantity,
  getOppositeSide
} from "./src/helpers.js";
import tradeConfig from "./src/trade-config.js";

const { BASE_ASSET, QUOTE_ASSET, SYMBOL } = tradeConfig;

let previousRSI;

const getSignal = async () => {
  try {
    const totalParams = {
      exchange: "binance",
      // symbol: `${BASE_ASSET}/${QUOTE_ASSET}`,
      symbol: "BTC/USDT",
      interval: "1m"
    };
    const queryString = querystring.stringify(totalParams);

    const response = await taAPI.get(`/rsi?${queryString}`);
    const currentRSI = response.data.value;
    log(`currentRSI: ${currentRSI}`);
    let signal = "NONE";
    if (previousRSI > 20 && currentRSI < 20) {
      signal = "BUY";
    }
    if (previousRSI < 80 && currentRSI > 80) {
      signal = "SELL";
    }
    previousRSI = currentRSI;
    return signal;
  } catch (error) {
    await handleAPIError(error);
  }
};

const newOrder = async (side, quantity) => {
  try {
    const totalParams = {
      symbol: SYMBOL,
      type: "MARKET",
      side,
      positionSide: "BOTH",
      quantity,
      reduceOnly: false,
      timestamp: Date.now()
    };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    await binanceFuturesAPI.post(
      `/fapi/v1/order?${queryString}&signature=${signature}`
    );
    log(`New orders! ${side} ${quantity}`);
    await sendLineNotify(`New orders! ${side} ${quantity}`);
  } catch (error) {
    await handleAPIError(error);
  }
};

const closePosition = async (side, quantity) => {
  try {
    const totalParams = {
      symbol: SYMBOL,
      type: "MARKET",
      side,
      quantity,
      positionSide: "BOTH",
      reduceOnly: true,
      newOrderRespType: "RESULT",
      timestamp: Date.now()
    };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    await binanceFuturesAPI.post(
      `/fapi/v1/order?${queryString}&signature=${signature}`
    );
    log("Close position!");
    await sendLineNotify("Close position!");
  } catch (error) {
    await handleAPIError(error);
  }
};

const getOrderQuantity = async () => {
  const availableQuantity = await getAvailableQuantity();
  const allowableQuantity = await getAllowableQuantity();
  const targetQuantity = Math.min(availableQuantity, allowableQuantity);
  return Math.trunc((targetQuantity / 2) * 1000) / 1000;
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

const check = async () => {
  const signal = await getSignal();
  if (signal !== "NONE") {
    const positionAmount = await getPositionAmount();
    const positionDirection = getPositionDirection(Number(positionAmount));
    const oppositeSide = getOppositeSide(signal);

    if (positionDirection === "NONE") {
      const orderQuantity = await getOrderQuantity();
      await newOrder(signal, orderQuantity);
    }

    if (positionDirection === signal) {
      const orderQuantity = await getOrderQuantity();
      if (orderQuantity > 0) {
        await newOrder(signal, orderQuantity);
      }
    }

    if (positionDirection === oppositeSide) {
      await closePosition(signal, Math.abs(positionAmount));
      const orderQuantity = await getOrderQuantity();
      await newOrder(signal, orderQuantity);
    }
  }
  setTimeout(check, 60000);
};

check();
