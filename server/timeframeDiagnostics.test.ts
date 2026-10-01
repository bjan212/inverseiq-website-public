import { describe, expect, it } from "vitest";
import { summarizeTimeframeCloses } from "../shared/timeframeDiagnostics";

describe("timeframe diagnostics", () => {
  it("measures directional churn and move-size coverage deterministically", () => {
    const summary = summarizeTimeframeCloses([100, 101, 100, 102, 101]);
    expect(summary.candles).toBe(5);
    expect(summary.returns).toBe(4);
    expect(summary.directionFlipPct).toBe(100);
    expect(summary.moveAbove20BpsPct).toBe(100);
  });

  it("ignores invalid prices and handles insufficient series safely", () => {
    expect(summarizeTimeframeCloses([0, Number.NaN, 100])).toMatchObject({
      candles: 1,
      returns: 0,
      lagOneReturnCorrelation: null,
    });
  });
});
