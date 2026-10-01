import { describe, expect, it } from "vitest";
import { isGemAlertChannelEnabled, isGemAlertEligible } from "./lib/alertEligibility";
import { isEligibleHighConfidenceSignal } from "./lib/telegramBot";

describe("separate gem and Telegram alert preferences", () => {
  const gemSettings = {
    isEnabled: 1,
    minConfidence: 85,
    enableTelegram: 1,
    enableEmail: 0,
    telegramChatId: "12345",
  };

  it("requires gem opt-in, threshold eligibility, and the relevant channel flag", () => {
    expect(isGemAlertEligible(gemSettings, 85)).toBe(true);
    expect(isGemAlertEligible(gemSettings, 84.9)).toBe(false);
    expect(isGemAlertChannelEnabled(gemSettings, "telegram")).toBe(true);
    expect(isGemAlertChannelEnabled(gemSettings, "email")).toBe(false);
  });

  it("requires A/A+ grade and the configured Telegram confidence threshold", () => {
    expect(isEligibleHighConfidenceSignal({ confidence: 96, entryQualityLabel: "A+" }, 95)).toBe(true);
    expect(isEligibleHighConfidenceSignal({ confidence: 96, entryQualityLabel: "B" }, 95)).toBe(false);
    expect(isEligibleHighConfidenceSignal({ confidence: 94, entryQualityLabel: "A" }, 95)).toBe(false);
  });
});
