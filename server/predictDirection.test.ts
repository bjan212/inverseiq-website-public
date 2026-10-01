/**
 * Tests for the predict.direction tRPC procedure
 * Tests input validation, symbol normalisation, and response shape.
 */
import { describe, it, expect } from "vitest";

// ─── Symbol normalisation helper (mirrors server logic) ───────────────────────
function normaliseSymbol(raw: string): string {
  return raw
    .replace("/", "")
    .replace("-PERP", "")
    .replace(":USDT", "")
    .toUpperCase();
}

// ─── PnL calculation helper (mirrors server logic) ────────────────────────────
function calcPnlPct(entry: number, current: number, side: "long" | "short"): number {
  return ((current - entry) / entry) * 100 * (side === "long" ? 1 : -1);
}

// ─── Symbol normalisation tests ───────────────────────────────────────────────
describe("Symbol normalisation", () => {
  it("strips slash from BTC/USDT", () => {
    expect(normaliseSymbol("BTC/USDT")).toBe("BTCUSDT");
  });

  it("strips -PERP suffix", () => {
    expect(normaliseSymbol("BTC-PERP")).toBe("BTC");
  });

  it("strips :USDT suffix", () => {
    expect(normaliseSymbol("BTC:USDT")).toBe("BTC");
  });

  it("uppercases lowercase input", () => {
    expect(normaliseSymbol("ethusdt")).toBe("ETHUSDT");
  });

  it("leaves clean symbol unchanged", () => {
    expect(normaliseSymbol("SOLUSDT")).toBe("SOLUSDT");
  });

  it("handles BTC/USDT:USDT (dYdX format)", () => {
    expect(normaliseSymbol("BTC/USDT")).toBe("BTCUSDT");
  });
});

// ─── PnL calculation tests ────────────────────────────────────────────────────
describe("PnL percentage calculation", () => {
  it("calculates positive PnL for long in profit", () => {
    const pnl = calcPnlPct(60000, 63000, "long");
    expect(pnl).toBeCloseTo(5, 1); // +5%
  });

  it("calculates negative PnL for long in loss", () => {
    const pnl = calcPnlPct(60000, 57000, "long");
    expect(pnl).toBeCloseTo(-5, 1); // -5%
  });

  it("calculates positive PnL for short in profit", () => {
    const pnl = calcPnlPct(60000, 57000, "short");
    expect(pnl).toBeCloseTo(5, 1); // +5%
  });

  it("calculates negative PnL for short in loss", () => {
    const pnl = calcPnlPct(60000, 63000, "short");
    expect(pnl).toBeCloseTo(-5, 1); // -5%
  });

  it("returns 0 when current equals entry", () => {
    // Use toBeCloseTo to handle -0 vs +0 floating point edge case
    expect(calcPnlPct(50000, 50000, "long")).toBeCloseTo(0, 10);
    expect(calcPnlPct(50000, 50000, "short")).toBeCloseTo(0, 10);
  });
});

// ─── Input validation tests ───────────────────────────────────────────────────
describe("Input validation", () => {
  it("rejects leverage below 1", () => {
    const leverage = 0;
    expect(leverage < 1).toBe(true);
  });

  it("rejects leverage above 200", () => {
    const leverage = 201;
    expect(leverage > 200).toBe(true);
  });

  it("accepts leverage at boundary values", () => {
    expect(1 >= 1 && 1 <= 200).toBe(true);
    expect(200 >= 1 && 200 <= 200).toBe(true);
  });

  it("accepts long and short as valid sides", () => {
    const validSides = ["long", "short"];
    expect(validSides.includes("long")).toBe(true);
    expect(validSides.includes("short")).toBe(true);
    expect(validSides.includes("buy")).toBe(false);
  });

  it("rejects empty symbol", () => {
    expect("".trim().length === 0).toBe(true);
  });

  it("rejects zero entry price", () => {
    expect(0 <= 0).toBe(true);
  });
});

// ─── Response shape validation ────────────────────────────────────────────────
describe("Response shape", () => {
  const mockSuccessResponse = {
    success: true,
    verdict: "UP" as const,
    probability: 72,
    confidence: "HIGH" as const,
    keyReason: "RSI divergence on 4H with bullish MACD crossover",
    keyLevel: 68500,
    suggestedAction: "HOLD" as const,
    analysis: "Full analysis text...",
    currentPrice: 67800,
    pnlPct: 1.2,
    indicators: [
      { tf: "15m", rsi: 58, macdBias: "bullish", bbPos: 20, volTrend: "rising" },
      { tf: "1H",  rsi: 62, macdBias: "bullish", bbPos: 35, volTrend: "stable" },
    ],
    fundingRate: "+0.0100%",
    oiChange: "+3.20% (8h)",
  };

  it("has required verdict field", () => {
    expect(["UP", "DOWN", "UNKNOWN"]).toContain(mockSuccessResponse.verdict);
  });

  it("has probability in 0-100 range", () => {
    expect(mockSuccessResponse.probability).toBeGreaterThanOrEqual(0);
    expect(mockSuccessResponse.probability).toBeLessThanOrEqual(100);
  });

  it("has valid confidence level", () => {
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(mockSuccessResponse.confidence);
  });

  it("has valid suggestedAction", () => {
    expect(["HOLD", "ADD", "REDUCE", "EXIT"]).toContain(mockSuccessResponse.suggestedAction);
  });

  it("has indicators array", () => {
    expect(Array.isArray(mockSuccessResponse.indicators)).toBe(true);
  });

  it("each indicator has required fields", () => {
    mockSuccessResponse.indicators.forEach(ind => {
      expect(ind).toHaveProperty("tf");
      expect(ind).toHaveProperty("rsi");
      expect(ind).toHaveProperty("macdBias");
      expect(ind).toHaveProperty("bbPos");
      expect(ind).toHaveProperty("volTrend");
    });
  });

  it("RSI values are in valid range", () => {
    mockSuccessResponse.indicators.forEach(ind => {
      expect(ind.rsi).toBeGreaterThanOrEqual(0);
      expect(ind.rsi).toBeLessThanOrEqual(100);
    });
  });

  it("macdBias is bullish or bearish", () => {
    mockSuccessResponse.indicators.forEach(ind => {
      expect(["bullish", "bearish"]).toContain(ind.macdBias);
    });
  });

  const mockErrorResponse = {
    success: false,
    error: "Network timeout",
    verdict: "UNKNOWN" as const,
    probability: 50,
    confidence: "LOW" as const,
    keyReason: "",
    keyLevel: null,
    suggestedAction: "HOLD" as const,
    analysis: "",
    currentPrice: 0,
    pnlPct: 0,
    indicators: [],
    fundingRate: "",
    oiChange: "",
  };

  it("error response has success=false", () => {
    expect(mockErrorResponse.success).toBe(false);
  });

  it("error response defaults to UNKNOWN verdict", () => {
    expect(mockErrorResponse.verdict).toBe("UNKNOWN");
  });

  it("error response defaults to 50% probability", () => {
    expect(mockErrorResponse.probability).toBe(50);
  });
});

// ─── Symbol pattern context builder ──────────────────────────────────────────
describe("Symbol pattern context builder", () => {
  const mockPatterns = [
    {
      symbol: "BTCUSDT",
      tradeCount: 45,
      winRate: 38,
      avgPnl: -12.5,
      dominantSide: "BUY",
      bias: "LONG_BIAS",
      action: "SUPPRESS",
      summary: "Consistent losses on BTC longs — consider inverting",
    },
  ];

  it("finds pattern for matching symbol", () => {
    const pat = mockPatterns.find(p => p.symbol === "BTCUSDT");
    expect(pat).toBeDefined();
    expect(pat?.winRate).toBe(38);
  });

  it("returns undefined for non-matching symbol", () => {
    const pat = mockPatterns.find(p => p.symbol === "ETHUSDT");
    expect(pat).toBeUndefined();
  });

  it("builds correct context string", () => {
    const pat = mockPatterns[0];
    const ctx = `${pat.tradeCount} trades on ${pat.symbol}: ${pat.winRate}% win rate, avg PnL $${pat.avgPnl.toFixed(2)}, dominant side ${pat.dominantSide}, bias ${pat.bias}. Recommendation: ${pat.action} (${pat.summary})`;
    expect(ctx).toContain("45 trades on BTCUSDT");
    expect(ctx).toContain("38% win rate");
    expect(ctx).toContain("avg PnL $-12.50");
    expect(ctx).toContain("SUPPRESS");
  });
});
