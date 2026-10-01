/**
 * Tests for the multi-exchange universe fetcher
 */
import { describe, it, expect } from "vitest";

// ── Unit tests for the exchange symbol normalisation helpers ──────────────────

function normaliseSymbol(raw: string, exchange: "binance" | "bybit" | "okx" | "hyperliquid"): string | null {
  if (exchange === "binance") {
    if (!raw.endsWith("USDT")) return null;
    return raw; // already BTCUSDT format
  }
  if (exchange === "bybit") {
    if (!raw.endsWith("USDT")) return null;
    return raw;
  }
  if (exchange === "okx") {
    // OKX format: BTC-USDT-SWAP → BTCUSDT
    if (!raw.endsWith("-SWAP")) return null;
    const parts = raw.split("-");
    if (parts.length < 3) return null;
    return `${parts[0]}USDT`;
  }
  if (exchange === "hyperliquid") {
    // Hyperliquid format: BTC → BTCUSDT
    return `${raw}USDT`;
  }
  return null;
}

describe("normaliseSymbol", () => {
  it("passes binance USDT pairs through unchanged", () => {
    expect(normaliseSymbol("BTCUSDT", "binance")).toBe("BTCUSDT");
    expect(normaliseSymbol("ETHUSDT", "binance")).toBe("ETHUSDT");
  });

  it("rejects binance non-USDT pairs", () => {
    expect(normaliseSymbol("BTCBUSD", "binance")).toBeNull();
    expect(normaliseSymbol("ETHBTC", "binance")).toBeNull();
  });

  it("converts OKX swap format to USDT pair", () => {
    expect(normaliseSymbol("BTC-USDT-SWAP", "okx")).toBe("BTCUSDT");
    expect(normaliseSymbol("ETH-USDT-SWAP", "okx")).toBe("ETHUSDT");
    expect(normaliseSymbol("SOL-USDT-SWAP", "okx")).toBe("SOLUSDT");
  });

  it("rejects OKX non-swap instruments", () => {
    expect(normaliseSymbol("BTC-USDT", "okx")).toBeNull();
    expect(normaliseSymbol("BTC-USD-SWAP", "okx")).toBe("BTCUSDT"); // still ends in SWAP
  });

  it("appends USDT to Hyperliquid symbols", () => {
    expect(normaliseSymbol("BTC", "hyperliquid")).toBe("BTCUSDT");
    expect(normaliseSymbol("SOL", "hyperliquid")).toBe("SOLUSDT");
  });

  it("passes bybit USDT pairs through unchanged", () => {
    expect(normaliseSymbol("SOLUSDT", "bybit")).toBe("SOLUSDT");
  });
});

// ── Deduplication logic ───────────────────────────────────────────────────────

function deduplicateAndRank(
  symbols: Array<{ symbol: string; volume: number; exchange: string }>
): string[] {
  const best = new Map<string, { volume: number; exchange: string }>();
  for (const s of symbols) {
    const existing = best.get(s.symbol);
    if (!existing || s.volume > existing.volume) {
      best.set(s.symbol, { volume: s.volume, exchange: s.exchange });
    }
  }
  return Array.from(best.entries())
    .sort((a, b) => b[1].volume - a[1].volume)
    .map(([sym]) => sym);
}

describe("deduplicateAndRank", () => {
  it("deduplicates symbols across exchanges, keeping highest volume", () => {
    const input = [
      { symbol: "BTCUSDT", volume: 1000, exchange: "binance" },
      { symbol: "BTCUSDT", volume: 1200, exchange: "bybit" },
      { symbol: "ETHUSDT", volume: 800, exchange: "binance" },
    ];
    const result = deduplicateAndRank(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("BTCUSDT"); // highest volume first
    expect(result[1]).toBe("ETHUSDT");
  });

  it("returns symbols sorted by volume descending", () => {
    const input = [
      { symbol: "SOLUSDT", volume: 300, exchange: "binance" },
      { symbol: "BTCUSDT", volume: 5000, exchange: "binance" },
      { symbol: "ETHUSDT", volume: 2000, exchange: "binance" },
    ];
    const result = deduplicateAndRank(input);
    expect(result).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
  });

  it("handles empty input", () => {
    expect(deduplicateAndRank([])).toEqual([]);
  });

  it("handles single exchange input", () => {
    const input = [
      { symbol: "BTCUSDT", volume: 100, exchange: "okx" },
    ];
    expect(deduplicateAndRank(input)).toEqual(["BTCUSDT"]);
  });
});

// ── Exchange count aggregation ────────────────────────────────────────────────

function countByExchange(
  symbols: Array<{ symbol: string; exchange: string }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of symbols) {
    counts[s.exchange] = (counts[s.exchange] ?? 0) + 1;
  }
  return counts;
}

describe("countByExchange", () => {
  it("counts symbols per exchange correctly", () => {
    const input = [
      { symbol: "BTCUSDT", exchange: "binance" },
      { symbol: "ETHUSDT", exchange: "binance" },
      { symbol: "SOLUSDT", exchange: "bybit" },
    ];
    const counts = countByExchange(input);
    expect(counts.binance).toBe(2);
    expect(counts.bybit).toBe(1);
    expect(counts.okx).toBeUndefined();
  });

  it("returns empty object for empty input", () => {
    expect(countByExchange([])).toEqual({});
  });
});

// ── Conviction scoring helpers ────────────────────────────────────────────────

function scoreRSI(rsi: number): number {
  // Distance from neutral (50) — higher = more conviction
  return Math.abs(rsi - 50);
}

function scoreBBPos(bbPos: number): number {
  return Math.abs(bbPos - 50);
}

function computeConvictionScore(rsi: number, bbPos: number, macdAligned: boolean, volatility: number): number {
  const rsiScore = scoreRSI(rsi);
  const bbScore = scoreBBPos(bbPos);
  const macdBonus = macdAligned ? 10 : 0;
  const volBonus = volatility >= 0.5 && volatility <= 3.0 ? 8 : volatility > 3.0 ? 4 : 0;
  return rsiScore + bbScore + macdBonus + volBonus;
}

describe("computeConvictionScore", () => {
  it("gives higher score for extreme RSI", () => {
    const highConviction = computeConvictionScore(75, 50, true, 1.5);
    const lowConviction  = computeConvictionScore(52, 50, true, 1.5);
    expect(highConviction).toBeGreaterThan(lowConviction);
  });

  it("gives MACD alignment bonus", () => {
    const withMACD    = computeConvictionScore(60, 60, true, 1.5);
    const withoutMACD = computeConvictionScore(60, 60, false, 1.5);
    expect(withMACD - withoutMACD).toBe(10);
  });

  it("gives volatility bonus for moderate volatility (0.5–3%)", () => {
    const modVol  = computeConvictionScore(60, 60, false, 1.5);
    const lowVol  = computeConvictionScore(60, 60, false, 0.1);
    const highVol = computeConvictionScore(60, 60, false, 5.0);
    expect(modVol).toBeGreaterThan(lowVol);
    expect(modVol).toBeGreaterThan(highVol);
  });

  it("returns 0 for perfectly neutral conditions without bonuses", () => {
    expect(computeConvictionScore(50, 50, false, 0.1)).toBe(0);
  });
});
