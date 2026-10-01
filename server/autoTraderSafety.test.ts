import { describe, expect, it } from "vitest";
import { buildHyperliquidScanPlan, getFullHyperliquidPerpSymbols, isAutoTraderCandidateEligible, resolveAutoTraderConfidenceFloor } from "./lib/autoTraderSafety";
import { calculateNonLooseningTrailingStop } from "./lib/trailingStop";

describe("Hyperliquid auto-trader safeguards", () => {
  it("includes every named perp while ordering by current volume", () => {
    expect(getFullHyperliquidPerpSymbols(
      [{ name: "BTC" }, { name: "LOW" }, { name: "ETH" }, { name: "OLD", isDelisted: true }],
      [{ dayNtlVlm: "20" }, { dayNtlVlm: "1" }, { dayNtlVlm: "10" }, { dayNtlVlm: "100" }],
    )).toEqual(["BTCUSDC", "ETHUSDC", "LOWUSDC"]);
  });

  it("considers every active pair while bounding expensive deep analysis", () => {
    const assets = Array.from({ length: 30 }, (_, index) => ({ name: `C${index}` }));
    const contexts = assets.map((_, index) => ({
      dayNtlVlm: String(30 - index),
      markPx: index === 29 ? "2" : "1",
      prevDayPx: "1",
    }));
    const allowed = assets.map(asset => `${asset.name}USDC`);
    const plan = buildHyperliquidScanPlan(assets, contexts, allowed, 0, 20);

    expect(plan.consideredSymbols).toHaveLength(30);
    expect(plan.deepScanSymbols).toHaveLength(20);
    expect(plan.deepScanSymbols).toContain("C0USDC");
    expect(plan.deepScanSymbols).toContain("C29USDC");
  });

  it("selects 12 volume leaders, 4 distinct movers, and 4 rotating active markets", () => {
    const assets = [
      ...Array.from({ length: 30 }, (_, index) => ({ name: `C${index}` })),
      { name: "OLD", isDelisted: true },
    ];
    const contexts = assets.map((asset, index) => ({
      dayNtlVlm: asset.name === "OLD" ? "9999" : String(100 - index),
      markPx: index >= 26 && index <= 29 ? String(1 + (index - 25) / 10) : "1",
      prevDayPx: "1",
    }));
    const allowed = assets.map(asset => `${asset.name}USDC`);
    const plan = buildHyperliquidScanPlan(assets, contexts, allowed, 0, 20);

    expect(plan.consideredSymbols).not.toContain("OLDUSDC");
    expect(plan.deepScanSymbols.slice(0, 12)).toEqual(
      Array.from({ length: 12 }, (_, index) => `C${index}USDC`),
    );
    expect(plan.deepScanSymbols.slice(12, 16)).toEqual([
      "C29USDC",
      "C28USDC",
      "C27USDC",
      "C26USDC",
    ]);
    expect(plan.deepScanSymbols.slice(16)).toEqual([
      "C12USDC",
      "C13USDC",
      "C14USDC",
      "C15USDC",
    ]);
  });

  it("rotates lower-ranked pairs between scan cycles", () => {
    const assets = Array.from({ length: 30 }, (_, index) => ({ name: `C${index}` }));
    const contexts = assets.map((_, index) => ({ dayNtlVlm: String(30 - index), markPx: "1", prevDayPx: "1" }));
    const allowed = assets.map(asset => `${asset.name}USDC`);
    const first = buildHyperliquidScanPlan(assets, contexts, allowed, 0, 20).deepScanSymbols;
    const second = buildHyperliquidScanPlan(assets, contexts, allowed, 1, 20).deepScanSymbols;

    expect(second).not.toEqual(first);
    expect(second.slice(0, 12)).toEqual(first.slice(0, 12));
  });

  it("never permits an execution threshold below 88", () => {
    expect(resolveAutoTraderConfidenceFloor(70)).toBe(88);
    expect(resolveAutoTraderConfidenceFloor(92)).toBe(92);
    expect(resolveAutoTraderConfidenceFloor(150)).toBe(100);
  });

  it("allows only 88–100 confidence A-quality execution-eligible non-fallback candidates", () => {
    const base = { confidence: 88, entryQualityLabel: "A", isExecutionEligible: true, patternType: "5-layer-confluence" };
    expect(isAutoTraderCandidateEligible(base, 70)).toMatchObject({ eligible: true });
    expect(isAutoTraderCandidateEligible({ ...base, confidence: 87 }, 70).eligible).toBe(false);
    expect(isAutoTraderCandidateEligible({ ...base, confidence: 101 }, 70).eligible).toBe(false);
    expect(isAutoTraderCandidateEligible({ ...base, entryQualityLabel: "B" }, 70).eligible).toBe(false);
    expect(isAutoTraderCandidateEligible({ ...base, patternType: "Fallback Momentum" }, 70).eligible).toBe(false);
  });

  it("moves a long stop to breakeven at +1R and never loosens it", () => {
    expect(calculateNonLooseningTrailingStop({ direction: "LONG", entryPrice: 100, initialStopLoss: 90, currentStopLoss: 90, markPrice: 110 }))
      .toMatchObject({ shouldUpdate: true, nextStopLoss: 100 });
    expect(calculateNonLooseningTrailingStop({ direction: "LONG", entryPrice: 100, initialStopLoss: 90, currentStopLoss: 105, markPrice: 110 }))
      .toMatchObject({ shouldUpdate: false });
  });

  it("moves a short stop only downward after a favorable +1R move", () => {
    expect(calculateNonLooseningTrailingStop({ direction: "SHORT", entryPrice: 100, initialStopLoss: 110, currentStopLoss: 110, markPrice: 90 }))
      .toMatchObject({ shouldUpdate: true, nextStopLoss: 100 });
    expect(calculateNonLooseningTrailingStop({ direction: "SHORT", entryPrice: 100, initialStopLoss: 110, currentStopLoss: 95, markPrice: 90 }))
      .toMatchObject({ shouldUpdate: false });
  });
});
