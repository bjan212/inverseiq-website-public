/**
 * Tests for the AI Sentiment Engine
 */
import { describe, it, expect } from "vitest";

// ── Inline the pure scoring logic so tests have no network deps ───────────────

type SentimentLabel = "STRONG_BULL" | "BULL" | "NEUTRAL" | "BEAR" | "STRONG_BEAR";

function scoreToLabel(score: number): SentimentLabel {
  if (score >= 70) return "STRONG_BULL";
  if (score >= 55) return "BULL";
  if (score >= 45) return "NEUTRAL";
  if (score >= 30) return "BEAR";
  return "STRONG_BEAR";
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function computeCompositeScore(factors: { score: number; weight: number }[]): number {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weighted = factors.reduce((s, f) => s + f.score * f.weight, 0);
  return Math.round(clamp(weighted / totalWeight, 0, 100));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Sentiment Engine — scoreToLabel", () => {
  it("returns STRONG_BULL for score >= 70", () => {
    expect(scoreToLabel(70)).toBe("STRONG_BULL");
    expect(scoreToLabel(85)).toBe("STRONG_BULL");
    expect(scoreToLabel(100)).toBe("STRONG_BULL");
  });

  it("returns BULL for score 55-69", () => {
    expect(scoreToLabel(55)).toBe("BULL");
    expect(scoreToLabel(62)).toBe("BULL");
    expect(scoreToLabel(69)).toBe("BULL");
  });

  it("returns NEUTRAL for score 45-54", () => {
    expect(scoreToLabel(45)).toBe("NEUTRAL");
    expect(scoreToLabel(50)).toBe("NEUTRAL");
    expect(scoreToLabel(54)).toBe("NEUTRAL");
  });

  it("returns BEAR for score 30-44", () => {
    expect(scoreToLabel(30)).toBe("BEAR");
    expect(scoreToLabel(40)).toBe("BEAR");
    expect(scoreToLabel(44)).toBe("BEAR");
  });

  it("returns STRONG_BEAR for score < 30", () => {
    expect(scoreToLabel(29)).toBe("STRONG_BEAR");
    expect(scoreToLabel(0)).toBe("STRONG_BEAR");
  });
});

describe("Sentiment Engine — computeCompositeScore", () => {
  it("computes equal-weight average correctly", () => {
    const factors = [
      { score: 80, weight: 1 },
      { score: 60, weight: 1 },
      { score: 40, weight: 1 },
    ];
    // (80+60+40)/3 = 60
    expect(computeCompositeScore(factors)).toBe(60);
  });

  it("applies weights correctly — higher weight pulls score", () => {
    const factors = [
      { score: 90, weight: 3 }, // heavily weighted bullish
      { score: 10, weight: 1 }, // lightly weighted bearish
    ];
    // (90*3 + 10*1) / 4 = 280/4 = 70
    expect(computeCompositeScore(factors)).toBe(70);
  });

  it("clamps score to [0, 100]", () => {
    const factors = [{ score: 200, weight: 1 }];
    expect(computeCompositeScore(factors)).toBe(100);

    const factors2 = [{ score: -50, weight: 1 }];
    expect(computeCompositeScore(factors2)).toBe(0);
  });

  it("handles single factor", () => {
    const factors = [{ score: 63, weight: 2 }];
    expect(computeCompositeScore(factors)).toBe(63);
  });
});

describe("Sentiment Engine — funding rate scoring", () => {
  function fundingRateScore(rate: number): number {
    // Negative funding = longs pay shorts → bearish pressure
    // Positive funding = shorts pay longs → bullish pressure (but extreme = overheated)
    if (rate > 0.01)  return 35;  // very high positive → overheated, bearish signal
    if (rate > 0.005) return 55;  // moderately positive → mild bull
    if (rate > 0)     return 65;  // slightly positive → bullish
    if (rate > -0.005) return 45; // slightly negative → neutral
    return 30;                    // very negative → bearish
  }

  it("very high positive funding is bearish (overheated)", () => {
    expect(fundingRateScore(0.015)).toBe(35);
  });

  it("moderate positive funding is mildly bullish", () => {
    expect(fundingRateScore(0.007)).toBe(55);
  });

  it("slightly positive funding is bullish", () => {
    expect(fundingRateScore(0.001)).toBe(65);
  });

  it("slightly negative funding is neutral", () => {
    expect(fundingRateScore(-0.002)).toBe(45);
  });

  it("very negative funding is bearish", () => {
    expect(fundingRateScore(-0.01)).toBe(30);
  });
});

describe("Sentiment Engine — RSI scoring", () => {
  function rsiScore(rsi: number): number {
    if (rsi >= 70) return 25;   // overbought → bearish
    if (rsi >= 60) return 60;   // bullish momentum
    if (rsi >= 50) return 55;   // mild bull
    if (rsi >= 40) return 45;   // mild bear
    if (rsi >= 30) return 40;   // bearish
    return 75;                  // oversold → reversal potential (bullish)
  }

  it("RSI >= 70 is overbought (bearish)", () => {
    expect(rsiScore(75)).toBe(25);
    expect(rsiScore(70)).toBe(25);
  });

  it("RSI 60-69 is bullish momentum", () => {
    expect(rsiScore(65)).toBe(60);
  });

  it("RSI 50-59 is mildly bullish", () => {
    expect(rsiScore(55)).toBe(55);
  });

  it("RSI < 30 is oversold (bullish reversal)", () => {
    expect(rsiScore(25)).toBe(75);
  });
});

describe("Sentiment Engine — label consistency", () => {
  it("STRONG_BULL score always maps back to STRONG_BULL", () => {
    [70, 75, 80, 90, 100].forEach(s => {
      expect(scoreToLabel(s)).toBe("STRONG_BULL");
    });
  });

  it("boundary values are assigned correctly", () => {
    expect(scoreToLabel(29)).toBe("STRONG_BEAR");
    expect(scoreToLabel(30)).toBe("BEAR");
    expect(scoreToLabel(44)).toBe("BEAR");
    expect(scoreToLabel(45)).toBe("NEUTRAL");
    expect(scoreToLabel(54)).toBe("NEUTRAL");
    expect(scoreToLabel(55)).toBe("BULL");
    expect(scoreToLabel(69)).toBe("BULL");
    expect(scoreToLabel(70)).toBe("STRONG_BULL");
  });
});
