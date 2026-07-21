import test from "node:test";
import assert from "node:assert/strict";
import { createExchange } from "../src/exchange.js";

const env = {
  API_KEY: "test-api-key",
  SECRET_KEY: "test-secret-key",
  REST_BASEURL: "https://example.test"
};
const tradeConfig = {
  SYMBOL: "BTCUSDT",
  MARGIN_TYPE: "ISOLATED"
};

test("signed exchange requests include authentication and a signature", async (t) => {
  let capturedRequest;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    capturedRequest = { url, options };
    return new Response(JSON.stringify({ orderId: 1 }), { status: 200 });
  });

  const exchange = createExchange(env, tradeConfig);
  await exchange.placeEntryOrder("BUY", "0.001");

  const url = new URL(capturedRequest.url);
  assert.equal(url.origin, env.REST_BASEURL);
  assert.equal(url.pathname, "/fapi/v1/order");
  assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
  assert.ok(url.searchParams.get("timestamp"));
  assert.match(url.searchParams.get("signature"), /^[a-f0-9]{64}$/);
  assert.equal(capturedRequest.options.headers["X-MBX-APIKEY"], env.API_KEY);
});

test("available balance selects the configured quote asset", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(new URL(url).pathname, "/fapi/v3/balance");
    return new Response(
      JSON.stringify([{ asset: "USDT", availableBalance: "10" }]),
      { status: 200 }
    );
  });

  const exchange = createExchange(env, tradeConfig);
  assert.equal(await exchange.getAvailableBalance("USDT"), "10");
});

test("symbol rules use Binance market quantity and price filters", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        symbols: [
          {
            symbol: "BTCUSDT",
            quoteAsset: "USDT",
            filters: [
              {
                filterType: "MARKET_LOT_SIZE",
                minQty: "0.001",
                stepSize: "0.001"
              },
              { filterType: "MIN_NOTIONAL", notional: "5" },
              { filterType: "PRICE_FILTER", tickSize: "0.10" }
            ]
          }
        ]
      }),
      { status: 200 }
    )
  );

  const exchange = createExchange(env, tradeConfig);
  assert.deepEqual(await exchange.getSymbolRules(), {
    quoteAsset: "USDT",
    minQuantity: "0.001",
    minNotional: "5",
    stepSize: "0.001",
    tickSize: "0.10"
  });
});

test("maximum leverage is read from the symbol leverage brackets", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify([
        {
          symbol: "BTCUSDT",
          brackets: [
            { initialLeverage: 125 },
            { initialLeverage: 100 }
          ]
        }
      ]),
      { status: 200 }
    )
  );

  const exchange = createExchange(env, tradeConfig);
  assert.equal(await exchange.getMaximumLeverage(), 125);
});
