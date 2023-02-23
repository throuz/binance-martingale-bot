import querystring from "node:querystring";
import { binanceFuturesAPI, taAPI } from "./src/axios-instances.js";
import { handleAPIError, sendLineNotify, log } from "./src/common.js";
import {
  getSignature,
  getAvailableQuantity,
  getOtherSide
} from "./src/helpers.js";

let side = "";

const getRSI = async () => {
  try {
    const totalParams = {
      exchange: "binance",
      symbol: "BTC/USDT",
      interval: "1m"
    };
    const queryString = querystring.stringify(totalParams);

    const response = await taAPI.get(`/rsi?${queryString}`);
    return response.data.value;
  } catch (error) {
    await handleAPIError(error);
  }
};

const newOrder = async () => {
  try {
    const availableQuantity = await getAvailableQuantity();
    const quantity = Math.round((availableQuantity / 2) * 1000) / 1000;
    const totalParams = {
      symbol: "BTCUSDT",
      type: "MARKET",
      side,
      positionSide: "BOTH",
      quantity,
      reduceOnly: false,
      placeType: "order-form",
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

const closePosition = async (positionAmount) => {
  try {
    const otherSide = getOtherSide(side);
    const totalParams = {
      symbol: "BTCUSDT",
      type: "MARKET",
      side: otherSide,
      quantity: positionAmount,
      positionSide: "BOTH",
      leverage: 125,
      isolated: false,
      reduceOnly: true,
      newOrderRespType: "RESULT",
      placeType: "position",
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

const getPositionAmount = async () => {
  try {
    const totalParams = { symbol: "BTCUSDT", timestamp: Date.now() };
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

const trade = async () => {
  const RSI = await getRSI();
  log(`RSI: ${RSI}`);
  if (RSI > 70) {
    if (side === "SELL") {
      await newOrder();
    } else {
      const positionAmount = await getPositionAmount();
      if (positionAmount > 0) {
        await closePosition(positionAmount);
      }
      side = "SELL";
      await newOrder();
    }
  }
  if (RSI < 30) {
    if (side === "BUY") {
      await newOrder();
    } else {
      const positionAmount = await getPositionAmount();
      if (positionAmount > 0) {
        await closePosition(positionAmount);
      }
      side = "BUY";
      await newOrder();
    }
  }
};

trade();
setInterval(trade, 20000);
