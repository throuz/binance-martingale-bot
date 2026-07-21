import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuantity,
  getOppositeSide,
  getTPSLPrices,
  getSideFromLongShortRatio,
  getAvailableQuantity,
  getNextStopLossTimes
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
    takeProfitPrice: "100160",
    stopLossPrice: "99840"
  });
  assert.deepEqual(getTPSLPrices("SELL", 0, 100000, config), {
    takeProfitPrice: "99840",
    stopLossPrice: "100160"
  });
});

test("long-short ratio selects an order side", () => {
  assert.equal(getSideFromLongShortRatio("1.01"), "BUY");
  assert.equal(getSideFromLongShortRatio("1"), "SELL");
});

test("available quantity is rounded down to three decimals", () => {
  assert.equal(getAvailableQuantity(10, 60000, 125), 0.02);
});

test("stop-loss count resets when the next order is unaffordable", () => {
  assert.equal(getNextStopLossTimes(1, 0.004, 0.001), 2);
  assert.equal(getNextStopLossTimes(2, 0.004, 0.001), 0);
});
