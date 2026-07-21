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
    { signed = false, baseUrl = env.REST_BASEURL } = {}
  ) => {
    const searchParams = new URLSearchParams(params);
    if (signed) {
      searchParams.set("timestamp", Date.now().toString());
      searchParams.set("signature", sign(searchParams.toString()));
    }
    const query = searchParams.toString();
    const url = `${baseUrl}${path}${query ? `?${query}` : ""}`;
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
    getSymbolRules: async () => {
      const { symbols } = await request("GET", "/fapi/v1/exchangeInfo");
      const symbol = symbols.find(({ symbol }) => symbol === tradeConfig.SYMBOL);
      if (!symbol) throw new Error(`Unknown symbol: ${tradeConfig.SYMBOL}`);
      const filter = (type) =>
        symbol.filters.find(({ filterType }) => filterType === type);
      const quantityFilter = filter("MARKET_LOT_SIZE") ?? filter("LOT_SIZE");
      const priceFilter = filter("PRICE_FILTER");
      const notionalFilter = filter("MIN_NOTIONAL");
      if (!quantityFilter || !priceFilter) {
        throw new Error(`Incomplete exchange filters for ${tradeConfig.SYMBOL}`);
      }
      return {
        quoteAsset: symbol.quoteAsset,
        stepSize: quantityFilter.stepSize,
        minQuantity: quantityFilter.minQty,
        minNotional: notionalFilter?.notional ?? "0",
        tickSize: priceFilter.tickSize
      };
    },
    getMaximumLeverage: async () => {
      const brackets = await request(
        "GET",
        "/fapi/v1/leverageBracket",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      );
      const symbolBrackets = Array.isArray(brackets) ? brackets[0] : brackets;
      const leverages = symbolBrackets?.brackets?.map(({ initialLeverage }) =>
        Number(initialLeverage)
      );
      const maximumLeverage = leverages?.length ? Math.max(...leverages) : NaN;
      if (!Number.isFinite(maximumLeverage) || maximumLeverage < 1) {
        throw new Error(`Invalid leverage brackets for ${tradeConfig.SYMBOL}`);
      }
      return maximumLeverage;
    },
    getCommissionRate: () =>
      request(
        "GET",
        "/fapi/v1/commissionRate",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      ),
    getPositionMode: () =>
      request("GET", "/fapi/v1/positionSide/dual", {}, { signed: true }),
    setOneWayMode: () =>
      request(
        "POST",
        "/fapi/v1/positionSide/dual",
        { dualSidePosition: "false" },
        { signed: true }
      ),
    setLeverage: (leverage) =>
      request(
        "POST",
        "/fapi/v1/leverage",
        { symbol: tradeConfig.SYMBOL, leverage },
        { signed: true }
      ),
    setMarginType: () =>
      request(
        "POST",
        "/fapi/v1/marginType",
        { symbol: tradeConfig.SYMBOL, marginType: tradeConfig.MARGIN_TYPE },
        { signed: true }
      ),
    getPosition: async () => {
      const positions = await request(
        "GET",
        "/fapi/v3/positionRisk",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      );
      return (
        positions.find(({ positionAmt }) => Number(positionAmt) !== 0) ??
        positions.find(({ positionSide }) => positionSide === "BOTH") ??
        null
      );
    },
    getOpenOrders: () =>
      request(
        "GET",
        "/fapi/v1/openOrders",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      ),
    getOpenAlgoOrders: () =>
      request(
        "GET",
        "/fapi/v1/openAlgoOrders",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      ),
    cancelAllOrders: () =>
      request(
        "DELETE",
        "/fapi/v1/allOpenOrders",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      ),
    cancelAllAlgoOrders: () =>
      request(
        "DELETE",
        "/fapi/v1/algoOpenOrders",
        { symbol: tradeConfig.SYMBOL },
        { signed: true }
      ),
    getLongShortRatio: async () => {
      const response = await request(
        "GET",
        "/futures/data/topLongShortPositionRatio",
        { symbol: tradeConfig.SYMBOL, period: "5m", limit: "1" },
        { baseUrl: env.MARKET_DATA_BASEURL ?? env.REST_BASEURL }
      );
      const longShortRatio = response?.[0]?.longShortRatio;
      if (!Number.isFinite(Number(longShortRatio))) {
        throw new Error("Binance did not return a valid top-trader ratio");
      }
      return longShortRatio;
    },
    getAvailableBalance: async (quoteAsset) => {
      const balances = await request(
        "GET",
        "/fapi/v3/balance",
        {},
        { signed: true }
      );
      const balanceEntry = balances.find(
        ({ asset }) => asset === quoteAsset
      );
      if (!balanceEntry) {
        throw new Error(
          `Balance response does not include ${quoteAsset}`
        );
      }
      const availableBalance =
        balanceEntry.availableBalance ??
        balanceEntry.maxWithdrawAmount ??
        balanceEntry.withdrawAvailable;
      if (availableBalance === undefined) {
        throw new Error("Balance response does not include an available balance");
      }
      return availableBalance;
    },
    placeEntryOrder: (side, quantity, clientOrderId) =>
      request(
        "POST",
        "/fapi/v1/order",
        {
          symbol: tradeConfig.SYMBOL,
          type: "MARKET",
          side,
          positionSide: "BOTH",
          quantity,
          reduceOnly: "false",
          newOrderRespType: "RESULT",
          newClientOrderId: clientOrderId
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
    getAlgoOrder: (clientAlgoId) =>
      request(
        "GET",
        "/fapi/v1/algoOrder",
        { symbol: tradeConfig.SYMBOL, clientAlgoId },
        { signed: true }
      ),
    closePosition: (side, quantity, clientOrderId) =>
      request(
        "POST",
        "/fapi/v1/order",
        {
          symbol: tradeConfig.SYMBOL,
          type: "MARKET",
          side,
          positionSide: "BOTH",
          quantity,
          reduceOnly: "true",
          newOrderRespType: "RESULT",
          newClientOrderId: clientOrderId
        },
        { signed: true }
      ),
    createListenKey: () =>
      request("POST", "/fapi/v1/listenKey", {}, { signed: false }),
    keepAliveListenKey: () =>
      request("PUT", "/fapi/v1/listenKey", {}, { signed: false })
  };
};

export { createExchange };
