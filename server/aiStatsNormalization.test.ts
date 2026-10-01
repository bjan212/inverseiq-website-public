import { describe, expect, it } from "vitest";
import { normalizeAiStats } from "./aiStatsNormalization";

describe("normalizeAiStats", () => {
  it("maps the flat compatibility backend statistics into the dashboard contract", () => {
    const normalized = normalizeAiStats({
      success: true,
      totalPatterns: 3,
      totalTraders: 0,
      totalTrades: 7,
      wins: 3,
      losses: 4,
      avgConfidence: 88,
      lastUpdated: "2026-09-01T16:53:27.653Z",
      publicOnlyPatterns: 0,
      traderOnlyPatterns: 0,
      combinedPatterns: 3,
      publicPatternsConfidence: 0,
      traderPatternsConfidence: 0,
      combinedPatternsConfidence: 88,
      highConfidenceCount: 7,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      insights: ["7 verified outcomes recorded."],
    });

    expect(normalized).toMatchObject({
      totalPatterns: 3,
      totalTrades: 7,
      averageConfidence: 88,
      patternSources: { publicOnly: 0, traderOnly: 0, combined: 3 },
      confidenceBySource: { publicPatterns: 0, traderPatterns: 0, combinedPatterns: 88 },
      qualityDistribution: { highConfidence: 7, mediumConfidence: 0, lowConfidence: 0 },
    });
  });

  it("returns null for an invalid backend response", () => {
    expect(normalizeAiStats(null)).toBeNull();
  });
});
