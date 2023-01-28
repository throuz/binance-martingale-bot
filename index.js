const axios = require("axios");
const crypto = require("crypto");
const querystring = require("node:querystring");
const websocket = require("ws");

const API_KEY = "Your api key";
const SECRET_KEY = "Your secret key";

const BASE_CURRENCY = "BTC";
const QUOTE_CURRENCY = "BUSD";
const SYMBOL = BASE_CURRENCY + QUOTE_CURRENCY;
const LEVERAGE = 50;
const FEE = 0.03;
const TAKE_PROFIT_PERCENTAGE = 20 / 100;
const STOP_LOSS_PERCENTAGE = 20 / 100;

let quantity = 0.001;

const binanceFuturesAPI = axios.create({
  baseURL: "https://fapi.binance.com",
  timeout: 10000,
  headers: { "X-MBX-APIKEY": API_KEY }
});

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
      ({ asset }) => asset === QUOTE_CURRENCY
    ).withdrawAvailable;
    return availableBalance;
  } catch (error) {
    console.error(error);
  }
};

const getMarkPrice = async () => {
  try {
    const totalParams = { symbol: SYMBOL };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/fapi/v1/premiumIndex?${queryString}&signature=${signature}`
    );
    return response.data.markPrice;
  } catch (error) {
    console.error(error);
  }
};

const getOtherSide = (side) => {
  if (side === "BUY") {
    return "SELL";
  }
  if (side === "SELL") {
    return "BUY";
  }
};

const handleTimeInForceError = async (totalParams) => {
  try {
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.post(
      `/fapi/v1/batchOrders?${queryString}&signature=${signature}`
    );
    if (response.data.some((element) => element.code === -4129)) {
      await handleTimeInForceError(totalParams);
    }
  } catch (error) {
    console.error(error);
  }
};

const newOrders = async (side) => {
  try {
    const otherSide = getOtherSide(side);
    const markPrice = await getMarkPrice();
    const orderParams = {
      symbol: SYMBOL,
      type: "MARKET",
      side,
      positionSide: "BOTH",
      quantity: quantity.toString(),
      reduceOnly: "false"
    };
    const takeProfitRate =
      side === "BUY" ? TAKE_PROFIT_PERCENTAGE : -TAKE_PROFIT_PERCENTAGE;
    const takeProfitParams = {
      symbol: SYMBOL,
      side: otherSide,
      positionSide: "BOTH",
      type: "TAKE_PROFIT_MARKET",
      timeInForce: "GTE_GTC",
      stopPrice: (
        Math.round(markPrice * (1 + takeProfitRate / LEVERAGE) * 10) / 10
      ).toString(),
      workingType: "MARK_PRICE",
      closePosition: "true"
    };
    const stopLossRate =
      side === "BUY" ? -STOP_LOSS_PERCENTAGE : STOP_LOSS_PERCENTAGE;
    const stopLossParams = {
      symbol: SYMBOL,
      side: otherSide,
      positionSide: "BOTH",
      type: "STOP_MARKET",
      timeInForce: "GTE_GTC",
      stopPrice: (
        Math.round(markPrice * (1 + stopLossRate / LEVERAGE) * 10) / 10
      ).toString(),
      workingType: "MARK_PRICE",
      closePosition: "true"
    };
    const totalParams = {
      batchOrders: JSON.stringify([
        orderParams,
        takeProfitParams,
        stopLossParams
      ]),
      timestamp: Date.now()
    };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.post(
      `/fapi/v1/batchOrders?${queryString}&signature=${signature}`
    );
    if (response.data.some((element) => element.code === -4129)) {
      await handleTimeInForceError({
        batchOrders: JSON.stringify([takeProfitParams, stopLossParams]),
        timestamp: Date.now()
      });
    }
    console.log(
      `New orders! ${side} ${quantity.toString()} at ${markPrice} (${new Date().toLocaleString()})`
    );
  } catch (error) {
    console.error(error);
  }
};

const extendListenKeyValidity = async () => {
  try {
    await binanceFuturesAPI.put("/fapi/v1/listenKey");
    console.log(
      `Extend listenKey validity for 60 minutes! (${new Date().toLocaleString()})`
    );
  } catch (error) {
    console.error(error);
  }
};

const getSide = async () => {
  try {
    const totalParams = { symbol: SYMBOL, period: "5m", limit: 1 };
    const queryString = querystring.stringify(totalParams);
    const signature = getSignature(queryString);

    const response = await binanceFuturesAPI.get(
      `/futures/data/takerlongshortRatio?${queryString}&signature=${signature}`
    );
    return response.data[0].buySellRatio > 0 ? "BUY" : "SELL";
  } catch (error) {
    console.error(error);
  }
};

const startUserDataStream = async () => {
  try {
    const response = await binanceFuturesAPI.post("/fapi/v1/listenKey");

    setInterval(extendListenKeyValidity, 3540000);

    const connect = () => {
      const ws = new websocket(
        `wss://fstream.binance.com/ws/${response.data.listenKey}`
      );

      ws.on("open", () => {
        console.log(`Websocket open! (${new Date().toLocaleString()})`);
      });

      ws.on("ping", () => {
        console.log(`Websocket ping! (${new Date().toLocaleString()})`);
        ws.pong();
      });

      ws.on("message", async (event) => {
        const eventObj = JSON.parse(event);

        if (eventObj.e === "ACCOUNT_UPDATE") {
          const walletBalance = eventObj.a.B.find(
            ({ a }) => a === QUOTE_CURRENCY
          ).wb;
          console.log(
            `Wallet balance: ${walletBalance} (${new Date().toLocaleString()})`
          );
        }

        if (
          eventObj.e === "ORDER_TRADE_UPDATE" &&
          eventObj.o.ot === "TAKE_PROFIT_MARKET" &&
          eventObj.o.x === "TRADE" &&
          eventObj.o.X === "FILLED"
        ) {
          console.log(`Take profit! (${new Date().toLocaleString()})`);
          if (quantity !== 0.001) {
            quantity = 0.001;
          }
          await newOrders(await getSide());
        }

        if (
          eventObj.e === "ORDER_TRADE_UPDATE" &&
          eventObj.o.ot === "STOP_MARKET" &&
          eventObj.o.x === "TRADE" &&
          eventObj.o.X === "FILLED"
        ) {
          console.log(`Stop loss! (${new Date().toLocaleString()})`);
          const availableBalance = await getAvailableBalance();
          const markPrice = await getMarkPrice();
          const maxQuantity =
            Math.trunc(
              (availableBalance * LEVERAGE * (1 - FEE)) / (markPrice / 1000)
            ) / 1000;
          if (quantity * 2 < maxQuantity) {
            quantity *= 2;
          } else {
            quantity = 0.001;
          }
          await newOrders(await getSide());
        }
      });

      ws.on("close", (event) => {
        console.log(`Websocket close! (${new Date().toLocaleString()})`);
        console.log(event);
        connect();
      });

      ws.on("error", (event) => {
        console.log(`Websocket error! (${new Date().toLocaleString()})`);
        console.log(event);
        ws.close();
      });
    };

    connect();

    await newOrders(await getSide());
  } catch (error) {
    console.error(error);
  }
};

startUserDataStream();
