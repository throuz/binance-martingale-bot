import test from "node:test";
import assert from "node:assert/strict";
import { createBot } from "../src/bot.js";

const tradeConfig = {
  SYMBOL: "BTCUSDT",
  QUOTE_ASSET: "USDT",
  LEVERAGE: 125,
  FEE_RATE: 0.0004,
  TP_SL_RATE: 0.1,
  INITIAL_QUANTITY: 0.001
};

const createDependencies = () => {
  const calls = [];
  const exchange = {
    getLongShortRatio: async () => "1.1",
    getMarkPrice: async () => "100000",
    getAvailableBalance: async () => "100",
    placeEntryOrder: async (side, quantity) =>
      calls.push(["entry", side, quantity]),
    placeAlgoOrder: async (order) => calls.push(["algo", order])
  };
  const notifier = {
    notify: async (message) => calls.push(["notify", message])
  };
  return { calls, exchange, notifier };
};

test("start places one entry followed by take-profit and stop-loss orders", async () => {
  const { calls, exchange, notifier } = createDependencies();
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });

  await bot.start();

  assert.deepEqual(calls[0], ["entry", "BUY", "0.001"]);
  assert.equal(calls[1][0], "algo");
  assert.equal(calls[1][1].type, "TAKE_PROFIT_MARKET");
  assert.equal(calls[2][1].type, "STOP_MARKET");
  assert.deepEqual(calls[3], ["notify", "New orders! BUY 0.001"]);
});

test("a stop loss advances the martingale quantity", async () => {
  const { calls, exchange, notifier } = createDependencies();
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });

  await bot.handleEvent({
    e: "ORDER_TRADE_UPDATE",
    o: { ot: "STOP_MARKET", x: "TRADE", X: "FILLED" }
  });

  assert.ok(calls.some((call) => call[0] === "entry" && call[2] === "0.002"));
});
