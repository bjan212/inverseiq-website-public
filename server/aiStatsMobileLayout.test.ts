import { describe, expect, it } from "vitest";
import {
  AI_STATS_MOBILE_AXIS,
  AI_STATS_MOBILE_CHART_LAYOUT,
  AI_STATS_MOBILE_CHART_MARGIN,
} from "../client/src/lib/aiStatsChartLayout";

describe("AI Stats mobile chart layout", () => {
  it("defines bounded, responsive containers for both chart types", () => {
    expect(AI_STATS_MOBILE_CHART_LAYOUT.confidenceContainer).toContain("h-[240px]");
    expect(AI_STATS_MOBILE_CHART_LAYOUT.confidenceContainer).toContain("sm:h-[320px]");
    expect(AI_STATS_MOBILE_CHART_LAYOUT.outcomesContainer).toContain("h-[220px]");
    expect(AI_STATS_MOBILE_CHART_LAYOUT.outcomesContainer).toContain("sm:h-[280px]");
    expect(AI_STATS_MOBILE_CHART_LAYOUT.confidenceContainer).toContain("min-w-0");
  });

  it("uses compact mobile-safe chart spacing", () => {
    expect(AI_STATS_MOBILE_CHART_LAYOUT.controlRow).toContain("flex-wrap");
    expect(AI_STATS_MOBILE_CHART_MARGIN).toEqual({ top: 10, right: 4, left: -12, bottom: 0 });
    expect(AI_STATS_MOBILE_AXIS.tick.fontSize).toBe(10);
    expect(AI_STATS_MOBILE_AXIS.minTickGap).toBe(18);
    expect(AI_STATS_MOBILE_AXIS.confidenceYAxisWidth).toBe(34);
    expect(AI_STATS_MOBILE_AXIS.outcomesYAxisWidth).toBe(26);
  });
});
