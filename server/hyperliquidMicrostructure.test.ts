import { describe, expect, it } from "vitest";
import {
  deriveCandleVolumeFlowBias,
  deriveCandleVolumeFlowStrength,
  deriveOpenInterestTrend,
} from "../shared/hyperliquidMicrostructure";

describe("Hyperliquid microstructure primitives", () => {
  it("keeps the first, invalid, and immaterial open-interest readings neutral", () => {
    expect(deriveOpenInterestTrend(undefined, 100)).toBe("stable");
    expect(deriveOpenInterestTrend(100, 100.1)).toBe("stable");
    expect(deriveOpenInterestTrend(0, 100)).toBe("stable");
  });

  it("detects only material cached open-interest changes", () => {
    expect(deriveOpenInterestTrend(100, 100.3)).toBe("rising");
    expect(deriveOpenInterestTrend(100, 99.7)).toBe("falling");
  });

  it("derives a labelled candle-flow proxy only from sufficiently one-sided confirmation volume", () => {
    const bullish = Array.from({ length: 12 }, () => ({ open: 100, close: 101, volume: 10 }));
    const neutral = Array.from({ length: 12 }, (_, index) => ({
      open: 100,
      close: index % 2 === 0 ? 101 : 99,
      volume: 10,
    }));
    expect(deriveCandleVolumeFlowBias(bullish)).toBe("buy");
    expect(deriveCandleVolumeFlowBias(neutral)).toBe("neutral");
    expect(deriveCandleVolumeFlowBias(bullish.slice(0, 5))).toBe("neutral");
  });

  it("returns a bounded continuous flow strength without inventing a balanced direction", () => {
    const bullish = Array.from({ length: 12 }, () => ({ open: 100, close: 101, volume: 10 }));
    const neutral = Array.from({ length: 12 }, (_, index) => ({
      open: 100,
      close: index % 2 === 0 ? 101 : 99,
      volume: 10,
    }));
    expect(deriveCandleVolumeFlowStrength(bullish)).toEqual({ direction: "buy", strength: 1 });
    expect(deriveCandleVolumeFlowStrength(neutral)).toEqual({ direction: "neutral", strength: 0 });
  });
});
