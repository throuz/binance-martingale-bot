import querystring from "node:querystring";
import WebSocket from "ws";
import env from "./env.js";
import { binanceFuturesAPI } from "./axios-instances.js";
import { sendLineNotify, log } from "./common.js";
import { QUOTE_CURRENCY, SYMBOL } from "./trade-config.js";
import {
  getQuantity,
  getSignature,
  getOtherSide,
  getTPSLPrices,
  getSide,
  getAvailableQuantity
} from "./helpers.js";

let stopLossTimes = 0;

const handleTimeInForceError = async (orders) => {
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
    if (response.data.some((element) => element.code === -4129)) {
      await handleTimeInForceError(orders);
    }
  } catch (error) {
    console.error(error);
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

const newOrders = async () => {
  try {
    const side = await getSide();
    const otherSide = getOtherSide(side);
    const quantity = getQuantity(stopLossTimes).toString();
    const { takeProfitPrice, stopLossPrice } = await getTPSLPrices(
      side,
      stopLossTimes
    );
    const marketOrder = {
      symbol: SYMBOL,
      type: "MARKET",
      side,
      positionSide: "BOTH",
      quantity,
      reduceOnly: "false"
    };
    const takeProfitOrder = {
      symbol: SYMBOL,
      side: otherSide,
      positionSide: "BOTH",
      type: "TAKE_PROFIT_MARKET",
      timeInForce: "GTE_GTC",
      stopPrice: takeProfitPrice,
      workingType: "MARK_PRICE",
      closePosition: "true"
    };
    const stopLossOrder = {
      symbol: SYMBOL,
      side: otherSide,
      positionSide: "BOTH",
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
    if (response.data.some((element) => element.code === -4129)) {
      await handleTimeInForceError([takeProfitOrder, stopLossOrder]);
    }
    log(`New orders! ${side} ${quantity}`);
    await sendLineNotify(`New orders! ${side} ${quantity}`);
  } catch (error) {
    console.error(error);
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

const extendListenKeyValidity = async () => {
  try {
    await binanceFuturesAPI.put("/fapi/v1/listenKey");
  } catch (error) {
    console.error(error);
    await sendLineNotify("API error, process exited!");
    process.exit();
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
  }, 301000);
};

const connectWebSocket = (listenKey) => {
  const ws = new WebSocket(`${env.WEBSOCKET_BASEURL}/ws/${listenKey}`);

  ws.on("open", () => {
    log("Socket open!");
    setCloseConnect(ws);
  });

  ws.on("ping", () => {
    setCloseConnect(ws);
    ws.pong();
  });

  ws.on("message", async (event) => {
    try {
      const eventObj = JSON.parse(event);

      if (eventObj.e === "ACCOUNT_UPDATE") {
        const walletBalance = eventObj.a.B.find(
          ({ a }) => a === QUOTE_CURRENCY
        ).wb;
        log(`Wallet balance: ${walletBalance} BUSD`);
        await sendLineNotify(`Wallet balance: ${walletBalance} BUSD`);
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
    } catch (error) {
      console.error(error);
      await sendLineNotify("API error, process exited!");
      process.exit();
    }
  });

  ws.on("close", () => {
    log("Socket close!");
    connectWebSocket(listenKey);
  });

  ws.on("error", () => {
    log("Socket error!");
    ws.close();
  });
};

const startUserDataStream = async () => {
  try {
    const response = await binanceFuturesAPI.post("/fapi/v1/listenKey");
    setInterval(extendListenKeyValidity, 3540000);
    connectWebSocket(response.data.listenKey);
    await newOrders();
  } catch (error) {
    console.error(error);
    await sendLineNotify("API error, process exited!");
    process.exit();
  }
};

startUserDataStream();
