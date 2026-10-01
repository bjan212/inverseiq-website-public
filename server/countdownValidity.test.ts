import { describe, expect, it } from "vitest";
import { calculateValidityMs } from "../client/src/hooks/useSignalCountdown";

describe("calculateValidityMs", () => {
  it("keeps short, high-volatility signals within the five-minute minimum", () => {
    const validity = calculateValidityMs({
      timeframeMinutes: 5,
      volatility: 1,
      rsi: 90,
      confidence: 55,
    });

    expect(validity).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it("gives a stronger low-volatility setup a longer validity window", () => {
    const shortWindow = calculateValidityMs({
      timeframeMinutes: 15,
      volatility: 0.9,
      confidence: 60,
    });
    const longerWindow = calculateValidityMs({
      timeframeMinutes: 15,
      volatility: 0.1,
      confidence: 95,
    });

    expect(longerWindow).toBeGreaterThan(shortWindow);
    expect(longerWindow).toBeLessThanOrEqual(4 * 60 * 60 * 1000);
  });
});
