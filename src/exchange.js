import { createHmac } from "node:crypto";
import { HttpError } from "./http-error.js";

const REQUEST_TIMEOUT_MS = 10000;

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
    getMarkPrice,
    getLongShortRatio: async () => {
      const [{ longShortRatio }] = await request(
        "GET",
        "/futures/data/topLongShortPositionRatio",
        { symbol: tradeConfig.SYMBOL, period: "5m", limit: "1" }
      );
      return longShortRatio;
    },
    getAvailableBalance: async () => {
      const balances = await request(
        "GET",
        "/fapi/v1/balance",
        {},
        { signed: true }
      );
      const balanceEntry = balances.find(
        ({ asset }) => asset === tradeConfig.QUOTE_ASSET
      );
      if (!balanceEntry) {
        throw new Error(
          `Balance response does not include ${tradeConfig.QUOTE_ASSET}`
        );
      }
      return balanceEntry.withdrawAvailable;
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

export { createExchange };
