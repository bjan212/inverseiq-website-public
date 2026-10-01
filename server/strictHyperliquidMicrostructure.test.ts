import { describe, expect, it } from "vitest";
import { scoreStrictHyperliquidMicrostructure } from "@shared/strictHyperliquidMicrostructure";

describe("strict Hyperliquid continuous microstructure", () => {
  it("allows strong aligned book and candle-flow evidence to clear the 75 microstructure floor", () => {
    const result = scoreStrictHyperliquidMicrostructure({
      technicalDirection: "LONG",
      orderBookImbalance: 0.42,
      candleFlow: { direction: "buy", strength: 0.9 },
      fundingRate: 0.00001,
      openInterestRelativeChange: null,
    });
    expect(result.direction).toBe("LONG");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.components.funding).toBe(0);
  });

  it("preserves intermediate strength for partially aligned observable evidence", () => {
    const result = scoreStrictHyperliquidMicrostructure({
      technicalDirection: "LONG",
      orderBookImbalance: 0.3,
      candleFlow: { direction: "buy", strength: 0.8 },
      fundingRate: 0.00001,
      openInterestRelativeChange: null,
    });
    expect(result.direction).toBe("LONG");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThan(75);
  });

  it("keeps weak or neutral evidence below the strict floor", () => {
    const result = scoreStrictHyperliquidMicrostructure({
      technicalDirection: "LONG",
      orderBookImbalance: 0.08,
      candleFlow: { direction: "neutral", strength: 0 },
      fundingRate: 0.00001,
      openInterestRelativeChange: 0.0005,
    });
    expect(result.direction).toBe("LONG");
    expect(result.score).toBeLessThan(75);
  });

  it("discounts opposing evidence instead of promoting a mixed book and flow picture", () => {
    const result = scoreStrictHyperliquidMicrostructure({
      technicalDirection: "LONG",
      orderBookImbalance: 0.35,
      candleFlow: { direction: "sell", strength: 1 },
      fundingRate: 0.00001,
      openInterestRelativeChange: null,
    });
    expect(result.score).toBeLessThan(20);
    expect(result.direction).toBe("LONG");
  });

  it("treats falling OI as neutral rather than an autonomous short signal", () => {
    const result = scoreStrictHyperliquidMicrostructure({
      technicalDirection: "LONG",
      orderBookImbalance: 0,
      candleFlow: { direction: "neutral", strength: 0 },
      fundingRate: 0,
      openInterestRelativeChange: -0.02,
    });
    expect(result).toMatchObject({ direction: null, score: 0 });
    expect(result.components.openInterest).toBe(0);
  });

  it("uses material rising OI only as confirmation of the technical direction", () => {
    const result = scoreStrictHyperliquidMicrostructure({
      technicalDirection: "SHORT",
      orderBookImbalance: 0,
      candleFlow: { direction: "neutral", strength: 0 },
      fundingRate: 0,
      openInterestRelativeChange: 0.02,
    });
    expect(result.direction).toBe("SHORT");
    expect(result.components.openInterest).toBe(5);
  });
});
