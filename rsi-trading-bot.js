import querystring from "node:querystring";
import { binanceFuturesAPI, taAPI } from "./src/axios-instances.js";
import { handleAPIError, sendLineNotify, log } from "./src/common.js";
import {
  getSignature,
  getAvailableQuantity,
  getPositionAmount
} from "./src/helpers.js";
import tradeConfig from "./src/trade-config.js";

const { BASE_ASSET, QUOTE_ASSET, SYMBOL } = tradeConfig;

const getSignal = async () => {
  try {
    const totalParams = {
      exchange: "binance",
      // symbol: `${BASE_ASSET}/${QUOTE_ASSET}`,
      symbol: "BTC/USDT",
      interval: "1m",
      backtracks: 2
    };
    const queryString = querystring.stringify(totalParams);

    const response = await taAPI.get(`/rsi?${queryString}`);
    const currentRSI = response.data[0].value;
    const previousRSI = response.data[1].value;
    log(`currentRSI: ${currentRSI}, previousRSI: ${previousRSI}`);
    if (previousRSI > 30 && currentRSI < 30) {
      return "BUY";
    } else if (previousRSI < 70 && currentRSI > 70) {
      return "SELL";
    } else {
      return "NONE";
    }
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

const getQuantity = async () => {
  const availableQuantity = await getAvailableQuantity();
  return Math.trunc((availableQuantity / 2) * 1000) / 1000;
};

const trade = async () => {
  const signal = await getSignal();
  if (signal === "BUY") {
    const positionAmount = await getPositionAmount();
    if (positionAmount < 0) {
      await closePosition("BUY", -positionAmount);
      const quantity = await getQuantity();
      await newOrder("BUY", quantity);
    } else {
      const quantity = await getQuantity();
      if (quantity > 0) {
        await newOrder("BUY", quantity);
      }
    }
  }
  if (signal === "SELL") {
    const positionAmount = await getPositionAmount();
    if (positionAmount > 0) {
      await closePosition("SELL", positionAmount);
      const quantity = await getQuantity();
      await newOrder("SELL", quantity);
    } else {
      const quantity = await getQuantity();
      if (quantity > 0) {
        await newOrder("SELL", quantity);
      }
    }
  }
};

trade();
setInterval(trade, 60000);
