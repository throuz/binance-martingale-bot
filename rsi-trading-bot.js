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
    log(`RSI: ${currentRSI}`);
    const previousRSI = response.data[1].value;
    if (currentRSI < 30 && previousRSI > 30) {
      return "BUY";
    } else if (currentRSI > 70 && previousRSI < 70) {
      return "SELL";
    } else {
      return "NONE";
    }
  } catch (error) {
    await handleAPIError(error);
  }
};

const newOrder = async (side) => {
  try {
    const availableQuantity = await getAvailableQuantity();
    const quantity = Math.trunc((availableQuantity / 2) * 1000) / 1000;
    const totalParams = {
      symbol: SYMBOL,
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

const closePosition = async (side, positionAmount) => {
  try {
    const quantity = Math.abs(positionAmount);
    const totalParams = {
      symbol: SYMBOL,
      type: "MARKET",
      side,
      quantity,
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

const trade = async () => {
  const signal = await getSignal();
  if (signal === "BUY") {
    const positionAmount = await getPositionAmount();
    if (positionAmount < 0) {
      await closePosition("BUY", positionAmount);
      await newOrder("BUY");
    } else {
      await newOrder("BUY");
    }
  }
  if (signal === "SELL") {
    const positionAmount = await getPositionAmount();
    if (positionAmount > 0) {
      await closePosition("SELL", positionAmount);
      await newOrder("SELL");
    } else {
      await newOrder("SELL");
    }
  }
};

trade();
setInterval(trade, 60000);
