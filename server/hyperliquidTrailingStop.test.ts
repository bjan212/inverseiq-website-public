import { describe, expect, it } from "vitest";
import { buildVerifiedTrailingStopUpdate } from "./lib/hyperliquidTrailingStop";

describe("Hyperliquid trailing-stop action safety", () => {
  it("builds only a reduce-only SL modify action for a tighter long stop", () => {
    const action = buildVerifiedTrailingStopUpdate({ oid: 42, assetIndex: 1, closingIsBuy: false, size: 2, currentStopLoss: 90, nextStopLoss: 100, direction: "LONG" });
    expect(action).toMatchObject({ type: "modify", oid: 42, order: { a: 1, b: false, r: true, t: { trigger: { isMarket: true, triggerPx: "100", tpsl: "sl" } } } });
  });
  it("rejects long-stop loosening and short-stop loosening", () => {
    expect(() => buildVerifiedTrailingStopUpdate({ oid: 1, assetIndex: 0, closingIsBuy: false, size: 1, currentStopLoss: 100, nextStopLoss: 99, direction: "LONG" })).toThrow(/may not loosen/);
    expect(() => buildVerifiedTrailingStopUpdate({ oid: 1, assetIndex: 0, closingIsBuy: true, size: 1, currentStopLoss: 100, nextStopLoss: 101, direction: "SHORT" })).toThrow(/may not loosen/);
  });
});
