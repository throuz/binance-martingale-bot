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
  QUOTE_ASSET: "USDT",
  LEVERAGE: 125
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
    assert.equal(new URL(url).pathname, "/fapi/v1/balance");
    return new Response(
      JSON.stringify([{ asset: "USDT", withdrawAvailable: "10" }]),
      { status: 200 }
    );
  });

  const exchange = createExchange(env, tradeConfig);
  assert.equal(await exchange.getAvailableBalance(), "10");
});
