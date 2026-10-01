import { describe, expect, it } from "vitest";
import { rankSignalsByEvidence, selectSignalForStrategy } from "./lib/strategyPreference";

describe("selectSignalForStrategy", () => {
  const candidates = [
    { symbol: "BTCUSDT", patternType: "MACD + EMA Confluence", isExecutionEligible: true },
    { symbol: "ETHUSDT", patternType: "Momentum RSI", isExecutionEligible: true },
    { symbol: "SOLUSDT", patternType: "Momentum RSI", isExecutionEligible: false },
  ];

  it("preserves the server's existing eligible leader for AI Best Pick", () => {
    const selection = selectSignalForStrategy(candidates, "ai_best_pick");

    expect(selection.signal.symbol).toBe("BTCUSDT");
    expect(selection.applied).toBe(true);
    expect(selection.label).toBe("AI Best Pick (5-Layer Confluence)");
  });

  it("prefers the highest final evidence-confidence candidate over raw input order", () => {
    const selection = selectSignalForStrategy([
      { symbol: "RAWLEADER", patternType: "MACD + EMA Confluence", isExecutionEligible: true, confidence: 82 },
      { symbol: "EXECUTABLE", patternType: "5-Layer Confluence", isExecutionEligible: true, confidence: 90 },
      { symbol: "INELIGIBLE", patternType: "5-Layer Confluence", isExecutionEligible: false, confidence: 99 },
    ], "ai_best_pick");

    expect(selection.signal.symbol).toBe("EXECUTABLE");
    expect(selection.signal.confidence).toBe(90);
  });

  it("returns the highest evidence score when every candidate is below execution eligibility", () => {
    const selection = selectSignalForStrategy([
      { symbol: "RAWLEADER", patternType: "MACD + EMA Confluence", isExecutionEligible: false, confidence: 66 },
      { symbol: "BETTEREVIDENCE", patternType: "5-Layer Confluence", isExecutionEligible: false, confidence: 79 },
      { symbol: "THIRD", patternType: "Momentum RSI", isExecutionEligible: false, confidence: 71 },
    ], "ai_best_pick");

    expect(selection.signal.symbol).toBe("BETTEREVIDENCE");
    expect(selection.signal.confidence).toBe(79);
  });

  it("orders comparable runner-up candidates by final evidence score", () => {
    const ranked = rankSignalsByEvidence([
      { symbol: "RAW90", patternType: "Raw Composite", confidence: 66 },
      { symbol: "EVIDENCE87", patternType: "5-Layer Confluence", confidence: 87 },
      { symbol: "EVIDENCE74", patternType: "Momentum RSI", confidence: 74 },
    ]);

    expect(ranked.map(candidate => candidate.symbol)).toEqual([
      "EVIDENCE87",
      "EVIDENCE74",
      "RAW90",
    ]);
  });

  it("selects the highest-ranked execution-eligible Momentum RSI candidate", () => {
    const selection = selectSignalForStrategy(candidates, "momentum_rsi");

    expect(selection.signal.symbol).toBe("ETHUSDT");
    expect(selection.applied).toBe(true);
    expect(selection.note).toContain("execution-eligible");
  });

  it("never uses an ineligible Momentum RSI candidate when an eligible leader exists", () => {
    const selection = selectSignalForStrategy([
      { symbol: "BTCUSDT", patternType: "MACD + EMA Confluence", isExecutionEligible: true },
      { symbol: "SOLUSDT", patternType: "Momentum RSI", isExecutionEligible: false },
    ], "momentum_rsi");

    expect(selection.signal.symbol).toBe("BTCUSDT");
    expect(selection.applied).toBe(false);
    expect(selection.label).toContain("Unavailable");
  });
});
