import querystring from "node:querystring";
import { binanceFuturesAPI } from "./src/axios-instances.js";
import { handleAPIError, sendLineNotify, log } from "./src/common.js";
import {
  getSignature,
  getPositionAmount,
  getOppositeSide,
  getSignal,
  getOrderQuantity,
  getPositionDirection
} from "./src/helpers.js";
import tradeConfig from "./src/trade-config.js";

const { SYMBOL } = tradeConfig;

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
      } else {
        log("Insufficient quantity, unable to place an order!");
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
