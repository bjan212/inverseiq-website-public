import { describe, expect, it } from "vitest";
import { isEligibleHighConfidenceSignal } from "./lib/telegramBot";

describe("Telegram high-confidence signal eligibility", () => {
  it("accepts A and A+ entries at the selected confidence threshold", () => {
    expect(isEligibleHighConfidenceSignal({ confidence: 95, entryQualityLabel: "A" }, 95)).toBe(true);
    expect(isEligibleHighConfidenceSignal({ confidence: 99, entryQualityLabel: "A+" }, 95)).toBe(true);
  });

  it("rejects a high score when entry quality is below A", () => {
    expect(isEligibleHighConfidenceSignal({ confidence: 99, entryQualityLabel: "B" }, 95)).toBe(false);
    expect(isEligibleHighConfidenceSignal({ confidence: 100, entryQualityLabel: "C" }, 95)).toBe(false);
  });

  it("rejects A/A+ entries below the user's selected confidence threshold", () => {
    expect(isEligibleHighConfidenceSignal({ confidence: 94, entryQualityLabel: "A+" }, 95)).toBe(false);
    expect(isEligibleHighConfidenceSignal({ confidence: 94, entryQualityLabel: "A" }, 95)).toBe(false);
  });
});
