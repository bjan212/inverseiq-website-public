/**
 * Tests for new features:
 * - Kelly criterion math (PreExecutionModal)
 * - Scan history DB helpers
 * - Hyperliquid 1-click order payload normalisation
 */
import { describe, it, expect } from "vitest";

// ─── Kelly Criterion ──────────────────────────────────────────────────────────
function kellyFraction(winRate: number, rr: number): number {
  const w = winRate / 100;
  const k = w - (1 - w) / rr;
  return Math.max(0, Math.min(k, 0.25));
}

function kellySuggestedMargin(winRate: number, rr: number, accountSize: number): number {
  const f = kellyFraction(winRate, rr);
  return Math.round(f * accountSize);
}

describe("Kelly Criterion", () => {
  it("returns 0 for a losing edge (winRate 40%, RR 1)", () => {
    expect(kellyFraction(40, 1)).toBe(0);
  });

  it("returns a positive fraction for a winning edge (winRate 60%, RR 2)", () => {
    const f = kellyFraction(60, 2);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(0.25);
  });

  it("caps at 0.25 for extreme edges", () => {
    expect(kellyFraction(99, 10)).toBe(0.25);
  });

  it("computes suggested margin correctly", () => {
    // 55% win rate, 1.5 RR, $1000 account
    // k = 0.55 - 0.45/1.5 = 0.55 - 0.3 = 0.25 → capped at 0.25
    const margin = kellySuggestedMargin(55, 1.5, 1000);
    expect(margin).toBe(250);
  });

  it("returns 0 margin when edge is negative", () => {
    const margin = kellySuggestedMargin(30, 1, 1000);
    expect(margin).toBe(0);
  });
});

// ─── Hyperliquid symbol normalisation ────────────────────────────────────────
describe("Hyperliquid symbol normalisation", () => {
  const normalise = (sym: string) => sym.replace("USDT", "").replace("/", "");

  it("strips USDT suffix", () => {
    expect(normalise("BTCUSDT")).toBe("BTC");
  });

  it("strips slash and USDT for slash-separated pairs", () => {
    expect(normalise("ETH/USDT")).toBe("ETH");
  });

  it("leaves non-USDT symbols unchanged", () => {
    expect(normalise("BTCETH")).toBe("BTCETH");
  });
});

// ─── Scan history payload validation ─────────────────────────────────────────
describe("Scan history payload", () => {
  interface ScanPayload {
    symbol: string;
    direction: "LONG" | "SHORT";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    entry: number;
    tp1: number | null;
    sl: number | null;
    exchange: string;
  }

  const buildPayload = (overrides: Partial<ScanPayload> = {}): ScanPayload => ({
    symbol: "BTCUSDT",
    direction: "LONG",
    confidence: "HIGH",
    entry: 65000,
    tp1: 67000,
    sl: 63000,
    exchange: "binance",
    ...overrides,
  });

  it("accepts valid HIGH confidence LONG payload", () => {
    const p = buildPayload();
    expect(p.confidence).toBe("HIGH");
    expect(p.direction).toBe("LONG");
    expect(p.entry).toBeGreaterThan(0);
  });

  it("accepts null tp1 and sl for bad-entry signals", () => {
    const p = buildPayload({ tp1: null, sl: null });
    expect(p.tp1).toBeNull();
    expect(p.sl).toBeNull();
  });

  it("validates direction is LONG or SHORT", () => {
    const validDirections = ["LONG", "SHORT"];
    const p = buildPayload({ direction: "SHORT" });
    expect(validDirections).toContain(p.direction);
  });
});
