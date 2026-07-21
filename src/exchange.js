import { createHmac } from "node:crypto";
import { getAvailableQuantity, getSideFromLongShortRatio } from "./strategy.js";

const REQUEST_TIMEOUT_MS = 10000;

class HttpError extends Error {
  constructor(message, { status, body, method, path }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

const createExchange = (env, tradeConfig) => {
  const sign = (queryString) =>
    createHmac("sha256", env.SECRET_KEY).update(queryString).digest("hex");

  const request = async (
    method,
    path,
    params = {},
    { signed = false } = {}
  ) => {
    const searchParams = new URLSearchParams(params);
    if (signed) {
      searchParams.set("timestamp", Date.now().toString());
      searchParams.set("signature", sign(searchParams.toString()));
    }
    const query = searchParams.toString();
    const url = `${env.REST_BASEURL}${path}${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      method,
      headers: { "X-MBX-APIKEY": env.API_KEY },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new HttpError(`Binance API ${response.status} on ${method} ${path}`, {
        status: response.status,
        body,
        method,
        path
      });
    }
    return body;
  };

  const getMarkPrice = async () => {
    const { markPrice } = await request("GET", "/fapi/v1/premiumIndex", {
      symbol: tradeConfig.SYMBOL
    });
    return markPrice;
  };

  return {
    request,
    getMarkPrice,
    getSide: async () => {
      const [{ longShortRatio }] = await request(
        "GET",
        "/futures/data/topLongShortPositionRatio",
        { symbol: tradeConfig.SYMBOL, period: "5m", limit: "1" }
      );
      return getSideFromLongShortRatio(longShortRatio);
    },
    getAvailableQuantity: async () => {
      const balances = await request(
        "GET",
        "/fapi/v1/balance",
        {},
        { signed: true }
      );
      const balanceEntry = balances.find(
        ({ asset }) => asset === tradeConfig.QUOTE_ASSET
      );
      const markPrice = await getMarkPrice();
      return getAvailableQuantity(
        balanceEntry.withdrawAvailable,
        markPrice,
        tradeConfig.LEVERAGE
      );
    },
    placeEntryOrder: (side, quantity) =>
      request(
        "POST",
        "/fapi/v1/order",
        {
          symbol: tradeConfig.SYMBOL,
          type: "MARKET",
          side,
          positionSide: "BOTH",
          quantity,
          reduceOnly: "false"
        },
        { signed: true }
      ),
    placeAlgoOrder: (order) =>
      request(
        "POST",
        "/fapi/v1/algoOrder",
        { algoType: "CONDITIONAL", ...order },
        { signed: true }
      ),
    createListenKey: () =>
      request("POST", "/fapi/v1/listenKey", {}, { signed: false }),
    keepAliveListenKey: () =>
      request("PUT", "/fapi/v1/listenKey", {}, { signed: false })
  };
};

// Keep the Telegram token out of thrown URLs and logs.
const sendTelegramMessage = async (env, text) => {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new HttpError(`Telegram sendMessage ${response.status}`, {
      status: response.status,
      body,
      method: "POST",
      path: "/sendMessage"
    });
  }
};

export { createExchange, sendTelegramMessage, HttpError };
