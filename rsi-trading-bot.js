import querystring from "node:querystring";
import { binanceFuturesAPI, taAPI } from "./src/axios-instances.js";
import { handleAPIError, sendLineNotify, log } from "./src/common.js";
import {
  getSignature,
  getAvailableQuantity,
  getPositionAmount,
  getMaxAllowableQuantity
} from "./src/helpers.js";

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

const newOrder = async (side) => {
  try {
    const availableQuantity = await getAvailableQuantity();
    const maxAllowableQuantity = await getMaxAllowableQuantity();
    const quantity =
      availableQuantity > maxAllowableQuantity
        ? maxAllowableQuantity
        : availableQuantity;
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

const closePosition = async (side, positionAmount) => {
  try {
    const quantity = Math.abs(positionAmount);
    const totalParams = {
      symbol: "BTCUSDT",
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
  const RSI = await getRSI();
  log(`RSI: ${RSI}`);
  if (RSI > 70) {
    const positionAmount = await getPositionAmount();
    if (+positionAmount === 0) {
      await newOrder("SELL");
    } else if (positionAmount < 0) {
      await closePosition("BUY", positionAmount);
      await newOrder("SELL");
    }
  }
  if (RSI < 30) {
    const positionAmount = await getPositionAmount();
    if (+positionAmount === 0) {
      await newOrder("BUY");
    } else if (positionAmount > 0) {
      await closePosition("SELL", positionAmount);
      await newOrder("BUY");
    }
  }
};

trade();
setInterval(trade, 20000);
