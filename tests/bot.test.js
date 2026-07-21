import test from "node:test";
import assert from "node:assert/strict";
import { createBot } from "../src/bot.js";

const tradeConfig = {
  SYMBOL: "BTCUSDT",
  DIRECTION_MODE: "TOP_TRADER_RATIO",
  MARGIN_TYPE: "ISOLATED",
  TP_SL_RATE: 0.1
};

const createDependencies = () => {
  const calls = [];
  const state = { position: null, algoOrders: [], orders: [] };
  const exchange = {
    getSymbolRules: async () => ({
      quoteAsset: "USDT",
      stepSize: "0.001",
      minQuantity: "0.001",
      minNotional: "5",
      tickSize: "0.1"
    }),
    getMaximumLeverage: async () => 125,
    getCommissionRate: async () => ({ takerCommissionRate: "0.0004" }),
    getPosition: async () => state.position,
    getPositionMode: async () => ({ dualSidePosition: false }),
    setOneWayMode: async () => calls.push(["one-way"]),
    setLeverage: async (leverage) => calls.push(["leverage", leverage]),
    setMarginType: async () => calls.push(["margin"]),
    getOpenOrders: async () => state.orders,
    getOpenAlgoOrders: async () => state.algoOrders,
    cancelAllOrders: async () => {
      state.orders = [];
      calls.push(["cancel-orders"]);
    },
    cancelAllAlgoOrders: async () => {
      state.algoOrders = [];
      calls.push(["cancel-algo"]);
    },
    getLongShortRatio: async () => "1.1",
    getMarkPrice: async () => "100000",
    getAvailableBalance: async (asset) => {
      assert.equal(asset, "USDT");
      return "100";
    },
    placeEntryOrder: async (side, quantity) => {
      calls.push(["entry", side, quantity]);
      state.position = {
        symbol: "BTCUSDT",
        positionSide: "BOTH",
        positionAmt: side === "BUY" ? quantity : `-${quantity}`,
        entryPrice: "100000"
      };
    },
    placeAlgoOrder: async (order) => {
      state.algoOrders.push(order);
      calls.push(["algo", order]);
    },
    getAlgoOrder: async () => null,
    closePosition: async () => {
      state.position = null;
      calls.push(["close"]);
    }
  };
  const notifier = {
    notify: async (message) => calls.push(["notify", message])
  };
  return { calls, state, exchange, notifier };
};

test("start configures a flat account and opens one protected position", async (t) => {
  const { calls, exchange, notifier } = createDependencies();
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });
  t.after(bot.stop);

  await bot.start();

  assert.ok(calls.some(([type]) => type === "leverage"));
  assert.ok(calls.some(([type]) => type === "margin"));
  assert.ok(calls.some((call) => call[0] === "entry" && call[2] === "0.001"));
  assert.deepEqual(
    calls.filter(([type]) => type === "algo").map(([, order]) => order.type),
    ["TAKE_PROFIT_MARKET", "STOP_MARKET"]
  );
});

test("LONG mode always opens a long without querying the ratio", async (t) => {
  const { calls, exchange, notifier } = createDependencies();
  exchange.getLongShortRatio = async () => {
    throw new Error("ratio should not be queried");
  };
  const bot = createBot({
    exchange,
    notifier,
    log: () => {},
    tradeConfig: { ...tradeConfig, DIRECTION_MODE: "LONG" }
  });
  t.after(bot.stop);

  await bot.start();

  assert.ok(calls.some((call) => call[0] === "entry" && call[1] === "BUY"));
});

test("SHORT mode always opens a short without querying the ratio", async (t) => {
  const { calls, exchange, notifier } = createDependencies();
  exchange.getLongShortRatio = async () => {
    throw new Error("ratio should not be queried");
  };
  const bot = createBot({
    exchange,
    notifier,
    log: () => {},
    tradeConfig: { ...tradeConfig, DIRECTION_MODE: "SHORT" }
  });
  t.after(bot.stop);

  await bot.start();

  assert.ok(calls.some((call) => call[0] === "entry" && call[1] === "SELL"));
});

test("restart adopts an existing position instead of opening another", async (t) => {
  const { calls, state, exchange, notifier } = createDependencies();
  state.position = {
    positionSide: "BOTH",
    positionAmt: "0.002",
    entryPrice: "100000",
    marginType: "isolated"
  };
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });
  t.after(bot.stop);

  await bot.start();

  assert.equal(calls.some(([type]) => type === "entry"), false);
  assert.equal(calls.filter(([type]) => type === "algo").length, 2);
});

test("an existing Cross Margin position is not adopted", async () => {
  const { state, exchange, notifier } = createDependencies();
  state.position = {
    positionSide: "BOTH",
    positionAmt: "0.001",
    entryPrice: "100000",
    marginType: "cross"
  };
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });

  await assert.rejects(bot.reconcile(), /close it before switching to ISOLATED/);
});

test("a stop loss advances the martingale quantity", async (t) => {
  const { calls, state, exchange, notifier } = createDependencies();
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });
  t.after(bot.stop);
  await bot.start();
  calls.length = 0;
  state.position = null;

  await bot.handleEvent({
    e: "ORDER_TRADE_UPDATE",
    o: { ot: "STOP_MARKET", x: "TRADE", X: "FILLED" }
  });

  assert.ok(calls.some((call) => call[0] === "entry" && call[2] === "0.002"));
});

test("an unaffordable martingale step resets to the initial quantity", async (t) => {
  const { calls, state, exchange, notifier } = createDependencies();
  const bot = createBot({ exchange, notifier, log: () => {}, tradeConfig });
  t.after(bot.stop);
  await bot.start();
  calls.length = 0;
  state.position = null;
  exchange.getAvailableBalance = async () => "1";

  await bot.handleEvent({
    e: "ORDER_TRADE_UPDATE",
    o: { ot: "STOP_MARKET", x: "TRADE", X: "FILLED" }
  });

  assert.ok(calls.some((call) => call[0] === "entry" && call[2] === "0.001"));
});

test("protection failure closes the position", async () => {
  const { calls, exchange, notifier } = createDependencies();
  exchange.placeAlgoOrder = async () => {
    throw new Error("rejected");
  };
  exchange.getAlgoOrder = async () => {
    throw new Error("not found");
  };
  const bot = createBot({
    exchange,
    notifier,
    log: () => {},
    tradeConfig,
    maxOrderRetries: 0,
    orderRetryDelayMs: 0
  });

  await assert.rejects(bot.reconcile(), /rejected/);
  assert.equal(calls.some(([type]) => type === "close"), true);
});
