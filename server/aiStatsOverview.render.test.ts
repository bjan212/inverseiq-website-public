import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AIStatsOverview } from "../client/src/components/AIStatsOverview";
import type { DetailedAIStats } from "../client/src/lib/aiStatsDisplay";

const deliveredOutcomeStats: DetailedAIStats = {
  totalPatterns: 3,
  totalTraders: 0,
  totalTrades: 7,
  lastUpdated: "2026-09-01T16:53:27.653Z",
  averageConfidence: 88,
  patternSources: { publicOnly: 0, traderOnly: 0, combined: 3 },
  confidenceBySource: { publicPatterns: 0, traderPatterns: 0, combinedPatterns: 88 },
  qualityDistribution: { highConfidence: 7, mediumConfidence: 0, lowConfidence: 0 },
  insights: ["7 verified outcomes recorded."],
};

describe("AIStatsOverview", () => {
  it("renders the recovered backend's normalized outcome metrics", () => {
    const markup = renderToStaticMarkup(createElement(AIStatsOverview, { stats: deliveredOutcomeStats }));

    expect(markup).toContain('aria-label="Total Patterns: 3"');
    expect(markup).toContain('aria-label="Total Trades Analyzed: 7"');
    expect(markup).toContain('aria-label="Avg Confidence: 88.0%"');
  });

  it("has a reproducible mobile-first, responsive overview layout", () => {
    const markup = renderToStaticMarkup(createElement(AIStatsOverview, { stats: deliveredOutcomeStats }));

    expect(markup).toContain("grid-cols-1");
    expect(markup).toContain("md:grid-cols-2");
    expect(markup).toContain("lg:grid-cols-4");
  });
});
