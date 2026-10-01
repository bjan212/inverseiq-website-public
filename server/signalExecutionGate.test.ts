import { describe, expect, it } from "vitest";
import { isAutoTraderExecutionEligible } from "./lib/signalEngine";

const qualifiedLong = {
  direction: "LONG" as const,
  technicalDirection: "LONG" as const,
  microstructureDirection: "LONG" as const,
  directionsAgree: true,
  technicalScore: 74,
  microstructureScore: 68,
  entryQualityLabel: "A",
  marketStructureTrend: "uptrend",
  riskReward: 2,
};

describe("auto-trader signal execution gate", () => {
  it("accepts a directionally aligned, high-quality signal", () => {
    expect(isAutoTraderExecutionEligible(qualifiedLong)).toBe(true);
  });

  it("rejects counter-trend and ranging signals even when the raw score is high", () => {
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, marketStructureTrend: "downtrend" })).toBe(false);
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, marketStructureTrend: "ranging" })).toBe(false);
  });

  it("rejects fallback-grade or conflicting signals", () => {
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, entryQualityLabel: "C" })).toBe(false);
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, directionsAgree: false, microstructureDirection: "SHORT" })).toBe(false);
  });

  it("rejects signals with weak score or insufficient reward-to-risk", () => {
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, technicalScore: 64 })).toBe(false);
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, microstructureScore: 59 })).toBe(false);
    expect(isAutoTraderExecutionEligible({ ...qualifiedLong, riskReward: 1.79 })).toBe(false);
  });
});

