import { describe, expect, it } from "vitest";
import { selectAiStatsForDisplay } from "../client/src/lib/aiStatsDisplay";

describe("AI Statistics live display selection", () => {
  it("uses a present normalized backend response rather than zero-value fallback metrics", () => {
    const displayed = selectAiStatsForDisplay({
      totalPatterns: 3,
      totalTraders: 0,
      totalTrades: 7,
      lastUpdated: "2026-09-01T16:53:27.653Z",
      averageConfidence: 88,
      patternSources: { publicOnly: 0, traderOnly: 0, combined: 3 },
      confidenceBySource: { publicPatterns: 0, traderPatterns: 0, combinedPatterns: 88 },
      qualityDistribution: { highConfidence: 7, mediumConfidence: 0, lowConfidence: 0 },
      insights: ["7 verified outcomes recorded."],
    });

    expect(displayed.totalPatterns).toBe(3);
    expect(displayed.totalTrades).toBe(7);
    expect(displayed.averageConfidence).toBe(88);
    expect(displayed.qualityDistribution.highConfidence).toBe(7);
  });
});
