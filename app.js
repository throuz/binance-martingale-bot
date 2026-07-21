import env from "./src/env.js";
import tradeConfig from "./src/trade-config.js";
import { binanceRequest } from "./src/api-clients.js";
import { sendTelegramNotify, log, handleAPIError } from "./src/common.js";
import {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSide,
  getAvailableQuantity
} from "./src/helpers.js";

const { WEBSOCKET_BASEURL } = env;
const { QUOTE_ASSET, SYMBOL } = tradeConfig;

const LISTEN_KEY_KEEPALIVE_INTERVAL_MS = 3540000; // 59 minutes
// Native WebSocket auto-replies to ping frames at the transport layer and
// doesn't expose them to application code, so this watchdog resets on any
// inbound message instead of specifically on pings. During a truly idle
// account (no ACCOUNT_UPDATE/ORDER_TRADE_UPDATE/ALGO_UPDATE for 5+ minutes)
// this will reconnect unnecessarily - a deliberate tradeoff for staying
// dependency-free instead of pulling in `ws` for raw ping-frame visibility.
const SOCKET_WATCHDOG_TIMEOUT_MS = 301000; // ~5 minutes without any message
const MAX_PROTECTIVE_ORDER_RETRIES = 5;
const PROTECTIVE_ORDER_RETRY_DELAY_MS = 500;
// STOP_MARKET/TAKE_PROFIT_MARKET fills still arrive as ORDER_TRADE_UPDATE once
// triggered; ALGO_UPDATE only covers the pending-conditional-order lifecycle.
const USER_DATA_STREAM_EVENTS = "ORDER_TRADE_UPDATE/ACCOUNT_UPDATE/ALGO_UPDATE";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let stopLossTimes = 0;

const placeEntryOrder = (side, quantity) =>
  binanceRequest(
    "POST",
    "/fapi/v1/order",
    {
      symbol: SYMBOL,
      type: "MARKET",
      side,
      positionSide: "BOTH",
      quantity,
      reduceOnly: "false"
    },
    { signed: true }
  );

// Conditional orders (STOP_MARKET/TAKE_PROFIT_MARKET) must go through the Algo
// Order API since Binance migrated them off /fapi/v1/order on 2025-12-09
// (error -4120 otherwise). There is no batch endpoint for algo orders, so TP
// and SL are placed one at a time, each with their own bounded retry so a
// transient failure on one doesn't cause the other to be resubmitted.
const placeAlgoOrderWithRetry = async (order, retryCount = 0) => {
  try {
    await binanceRequest(
      "POST",
      "/fapi/v1/algoOrder",
      { algoType: "CONDITIONAL", ...order },
      { signed: true }
    );
  } catch (error) {
    if (retryCount >= MAX_PROTECTIVE_ORDER_RETRIES) {
      log(`Failed to place ${order.type} order, position may be unprotected!`);
      await sendTelegramNotify(
        `Failed to place ${order.type} order after retries, position may be unprotected!`
      );
      process.exit(1);
      return;
    }
    await wait(PROTECTIVE_ORDER_RETRY_DELAY_MS);
    await placeAlgoOrderWithRetry(order, retryCount + 1);
  }
};

const placeProtectiveOrders = async (
  oppositeSide,
  takeProfitPrice,
  stopLossPrice
) => {
  const commonFields = {
    symbol: SYMBOL,
    positionSide: "BOTH",
    side: oppositeSide,
    workingType: "MARK_PRICE",
    closePosition: "true",
    timeInForce: "GTC"
  };
  await placeAlgoOrderWithRetry({
    ...commonFields,
    type: "TAKE_PROFIT_MARKET",
    triggerPrice: takeProfitPrice
  });
  await placeAlgoOrderWithRetry({
    ...commonFields,
    type: "STOP_MARKET",
    triggerPrice: stopLossPrice
  });
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

    await placeEntryOrder(side, quantity);
    await placeProtectiveOrders(oppositeSide, takeProfitPrice, stopLossPrice);

    log(`New orders! ${side} ${quantity}`);
    await sendTelegramNotify(`New orders! ${side} ${quantity}`);
  } catch (error) {
    await handleAPIError(error);
  }
};

const extendListenKeyValidity = async () => {
  try {
    await binanceRequest("PUT", "/fapi/v1/listenKey", {}, { signed: false });
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
let isShuttingDown = false;

const connectWebSocket = (listenKey) => {
  // Legacy `${WEBSOCKET_BASEURL}/ws/<listenKey>` URLs were decommissioned
  // 2026-04-23; user data streams now live under /private/ws with an
  // explicit `events` list.
  const ws = new WebSocket(
    `${WEBSOCKET_BASEURL}/private/ws?listenKey=${listenKey}&events=${USER_DATA_STREAM_EVENTS}`
  );
  currentWebSocket = ws;

  ws.addEventListener("open", () => {
    log("Socket open!");
    setCloseConnect(ws);
  });

  ws.addEventListener("message", async (event) => {
    setCloseConnect(ws);

    const eventObj = JSON.parse(event.data);

    if (eventObj.e === "ACCOUNT_UPDATE") {
      const balanceEntry = eventObj.a.B.find(({ a }) => a === QUOTE_ASSET);
      if (balanceEntry) {
        log(`Wallet balance: ${balanceEntry.wb} ${QUOTE_ASSET}`);
        await sendTelegramNotify(
          `Wallet balance: ${balanceEntry.wb} ${QUOTE_ASSET}`
        );
      }
    }

    // Informational only: the pending-conditional-order lifecycle. Actual
    // fills are still detected below via ORDER_TRADE_UPDATE, since the exact
    // ALGO_UPDATE field names aren't fully documented publicly yet.
    if (eventObj.e === "ALGO_UPDATE") {
      const algoOrder = eventObj.o ?? {};
      const status = algoOrder.algoStatus ?? algoOrder.status;
      const orderType = algoOrder.orderType ?? algoOrder.type;
      log(`Algo order update: ${orderType ?? "?"} ${status ?? "?"}`);
      if (status === "CANCELED") {
        await sendTelegramNotify(
          `Algo order (${orderType ?? "unknown"}) was canceled, please check your position!`
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
      await sendTelegramNotify("Take profit!");
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
      await sendTelegramNotify("Stop loss!");
      stopLossTimes += 1;
      const quantity = getQuantity(stopLossTimes);
      const availableQuantity = await getAvailableQuantity();
      if (quantity > availableQuantity) {
        stopLossTimes = 0;
      }
      await newOrders();
    }
  });

  ws.addEventListener("close", () => {
    log("Socket close!");
    if (!isShuttingDown) {
      connectWebSocket(listenKey);
    }
  });

  ws.addEventListener("error", (event) => {
    log("Socket error!");
    console.error(event.message ?? event);
    ws.close();
  });
};

const startUserDataStream = async () => {
  try {
    const { listenKey } = await binanceRequest(
      "POST",
      "/fapi/v1/listenKey",
      {},
      { signed: false }
    );
    setInterval(extendListenKeyValidity, LISTEN_KEY_KEEPALIVE_INTERVAL_MS);
    connectWebSocket(listenKey);
    await newOrders();
  } catch (error) {
    await handleAPIError(error);
  }
};

const handleFatalError = async (error) => {
  console.error("Fatal unexpected error:", error);
  await sendTelegramNotify("Fatal unexpected error, process exited!");
  process.exit(1);
};

process.on("unhandledRejection", handleFatalError);
process.on("uncaughtException", handleFatalError);

const shutdown = (signal) => {
  log(`Received ${signal}, shutting down!`);
  // Native WebSocket has no removeAllListeners, so a flag suppresses the
  // auto-reconnect logic in connectWebSocket's "close" handler instead.
  isShuttingDown = true;
  currentWebSocket?.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startUserDataStream();
