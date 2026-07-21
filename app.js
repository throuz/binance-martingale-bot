import querystring from "node:querystring";
import WebSocket from "ws";
import env from "./src/env.js";
import tradeConfig from "./src/trade-config.js";
import { binanceFuturesAPI } from "./src/axios-instances.js";
import { sendLineNotify, log, handleAPIError } from "./src/common.js";
import {
  getQuantity,
  getSignature,
  getOppositeSide,
  getTPSLPrices,
  getSide,
  getAvailableQuantity
} from "./src/helpers.js";

const { WEBSOCKET_BASEURL } = env;
const { QUOTE_ASSET, SYMBOL } = tradeConfig;

const LISTEN_KEY_KEEPALIVE_INTERVAL_MS = 3540000; // 59 minutes
const SOCKET_WATCHDOG_TIMEOUT_MS = 301000; // ~5 minutes without a ping
const TIME_IN_FORCE_ERROR_CODE = -4129;
const MAX_TIME_IN_FORCE_RETRIES = 5;
const TIME_IN_FORCE_RETRY_DELAY_MS = 500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let stopLossTimes = 0;

const handleTimeInForceError = async (orders, retryCount = 0) => {
  try {
    const totalParams = {
      batchOrders: JSON.stringify(orders),
      timestamp: Date.now()
    };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.post(
      `/fapi/v1/batchOrders?${queryString}&signature=${signature}`
    );
    if (
      response.data.some((element) => element.code === TIME_IN_FORCE_ERROR_CODE)
    ) {
      if (retryCount >= MAX_TIME_IN_FORCE_RETRIES) {
        log("Failed to place TP/SL orders, position may be unprotected!");
        await sendLineNotify(
          "Failed to place TP/SL orders after retries, position may be unprotected!"
        );
        process.exit(1);
      }
      await wait(TIME_IN_FORCE_RETRY_DELAY_MS);
      await handleTimeInForceError(orders, retryCount + 1);
    }
  } catch (error) {
    await handleAPIError(error);
  }
};

const newOrders = async () => {
  try {
    const side = await getSide();
    const oppositeSide = getOppositeSide(side);
    const quantity = getQuantity(stopLossTimes).toString();
    const { takeProfitPrice, stopLossPrice } = await getTPSLPrices(
      side,
      stopLossTimes
    );
    const commonOrderFields = { symbol: SYMBOL, positionSide: "BOTH" };
    const marketOrder = {
      ...commonOrderFields,
      type: "MARKET",
      side,
      quantity,
      reduceOnly: "false"
    };
    const takeProfitOrder = {
      ...commonOrderFields,
      side: oppositeSide,
      type: "TAKE_PROFIT_MARKET",
      timeInForce: "GTE_GTC",
      stopPrice: takeProfitPrice,
      workingType: "MARK_PRICE",
      closePosition: "true"
    };
    const stopLossOrder = {
      ...commonOrderFields,
      side: oppositeSide,
      type: "STOP_MARKET",
      timeInForce: "GTE_GTC",
      stopPrice: stopLossPrice,
      workingType: "MARK_PRICE",
      closePosition: "true"
    };
    const totalParams = {
      batchOrders: JSON.stringify([
        marketOrder,
        takeProfitOrder,
        stopLossOrder
      ]),
      timestamp: Date.now()
    };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.post(
      `/fapi/v1/batchOrders?${queryString}&signature=${signature}`
    );
    if (
      response.data.some((element) => element.code === TIME_IN_FORCE_ERROR_CODE)
    ) {
      await handleTimeInForceError([takeProfitOrder, stopLossOrder]);
    }
    log(`New orders! ${side} ${quantity}`);
    await sendLineNotify(`New orders! ${side} ${quantity}`);
  } catch (error) {
    await handleAPIError(error);
  }
};

const extendListenKeyValidity = async () => {
  try {
    await binanceFuturesAPI.put("/fapi/v1/listenKey");
  } catch (error) {
    await handleAPIError(error);
  }
};

let closeConnectTimeoutID;

const setCloseConnect = (ws) => {
  if (closeConnectTimeoutID) {
    clearTimeout(closeConnectTimeoutID);
  }
  closeConnectTimeoutID = setTimeout(() => {
    ws.close();
    closeConnectTimeoutID = undefined;
  }, SOCKET_WATCHDOG_TIMEOUT_MS);
};

let currentWebSocket;

const connectWebSocket = (listenKey) => {
  const ws = new WebSocket(`${WEBSOCKET_BASEURL}/ws/${listenKey}`);
  currentWebSocket = ws;

  ws.on("open", () => {
    log("Socket open!");
    setCloseConnect(ws);
  });

  ws.on("ping", () => {
    setCloseConnect(ws);
    ws.pong();
  });

  ws.on("message", async (event) => {
    const eventObj = JSON.parse(event);

    if (eventObj.e === "ACCOUNT_UPDATE") {
      const balanceEntry = eventObj.a.B.find(({ a }) => a === QUOTE_ASSET);
      if (balanceEntry) {
        log(`Wallet balance: ${balanceEntry.wb} ${QUOTE_ASSET}`);
        await sendLineNotify(
          `Wallet balance: ${balanceEntry.wb} ${QUOTE_ASSET}`
        );
      }
    }

    if (
      eventObj.e === "ORDER_TRADE_UPDATE" &&
      eventObj.o.ot === "TAKE_PROFIT_MARKET" &&
      eventObj.o.x === "TRADE" &&
      eventObj.o.X === "FILLED"
    ) {
      log("Take profit!");
      await sendLineNotify("Take profit!");
      if (stopLossTimes !== 0) {
        stopLossTimes = 0;
      }
      await newOrders();
    }

    if (
      eventObj.e === "ORDER_TRADE_UPDATE" &&
      eventObj.o.ot === "STOP_MARKET" &&
      eventObj.o.x === "TRADE" &&
      eventObj.o.X === "FILLED"
    ) {
      log("Stop loss!");
      await sendLineNotify("Stop loss!");
      stopLossTimes += 1;
      const quantity = getQuantity(stopLossTimes);
      const availableQuantity = await getAvailableQuantity();
      if (quantity > availableQuantity) {
        stopLossTimes = 0;
      }
      await newOrders();
    }
  });

  ws.on("close", () => {
    log("Socket close!");
    connectWebSocket(listenKey);
  });

  ws.on("error", (error) => {
    log("Socket error!");
    console.error(error);
    ws.close();
  });
};

const startUserDataStream = async () => {
  try {
    const response = await binanceFuturesAPI.post("/fapi/v1/listenKey");
    setInterval(extendListenKeyValidity, LISTEN_KEY_KEEPALIVE_INTERVAL_MS);
    connectWebSocket(response.data.listenKey);
    await newOrders();
  } catch (error) {
    await handleAPIError(error);
  }
};

const handleFatalError = async (error) => {
  console.error("Fatal unexpected error:", error);
  await sendLineNotify("Fatal unexpected error, process exited!");
  process.exit(1);
};

process.on("unhandledRejection", handleFatalError);
process.on("uncaughtException", handleFatalError);

const shutdown = (signal) => {
  log(`Received ${signal}, shutting down!`);
  // Drop the close listener first so a manual close doesn't trigger the
  // auto-reconnect logic in connectWebSocket's "close" handler.
  currentWebSocket?.removeAllListeners("close");
  currentWebSocket?.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startUserDataStream();
