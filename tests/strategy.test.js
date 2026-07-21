import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSide,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getMinimumQuantity,
  getNextStopLossTimes,
  normalizeQuantity,
  normalizePrice
} from "../src/strategy.js";

const config = { LEVERAGE: 125, FEE_RATE: 0.0004, TP_SL_RATE: 0.1 };

test("martingale quantity doubles after every stop loss", () => {
  assert.equal(getQuantity(0, 0.001), 0.001);
  assert.equal(getQuantity(3, 0.001), 0.008);
});

test("opposite side is returned and invalid sides are rejected", () => {
  assert.equal(getOppositeSide("BUY"), "SELL");
  assert.equal(getOppositeSide("SELL"), "BUY");
  assert.throws(() => getOppositeSide("HOLD"), /Invalid order side/);
});

test("BUY and SELL use mirrored take-profit and stop-loss prices", () => {
  assert.deepEqual(getTPSLPrices("BUY", 0, 100000, config), {
    takeProfitPrice: "100160.0",
    stopLossPrice: "99840.0"
  });
  assert.deepEqual(getTPSLPrices("SELL", 0, 100000, config), {
    takeProfitPrice: "99840.0",
    stopLossPrice: "100160.0"
  });
});

test("long-short ratio selects an order side", () => {
  assert.equal(getSideFromLongShortRatio("1.01"), "BUY");
  assert.equal(getSideFromLongShortRatio("1"), "SELL");
});

test("direction mode selects a fixed or ratio-based side", () => {
  assert.equal(getSide("LONG"), "BUY");
  assert.equal(getSide("SHORT"), "SELL");
  assert.equal(getSide("TOP_TRADER_RATIO", { longShortRatio: "1.01" }), "BUY");
  assert.throws(() => getSide("UNKNOWN"), /Invalid direction mode/);
});

test("available quantity is rounded down to three decimals", () => {
  assert.equal(getAvailableQuantity(10, 60000, 125), 0.02);
});

test("quantity and price follow exchange step sizes", () => {
  assert.equal(normalizeQuantity(1.239, "0.01"), "1.23");
  assert.equal(normalizePrice(100.24, "0.5"), "100.0");
});

test("minimum quantity satisfies quantity and notional filters", () => {
  assert.equal(getMinimumQuantity("0.001", "5", "100000", "0.001"), "0.001");
  assert.equal(getMinimumQuantity("0.01", "5", "20", "0.01"), "0.25");
});

test("stop-loss count resets when the next order is unaffordable", () => {
  assert.equal(getNextStopLossTimes(1, 0.004, 0.001), 2);
  assert.equal(getNextStopLossTimes(2, 0.004, 0.001), 0);
});
