import { describe, expect, it } from "vitest";
import { isSignalOfTheDayEligible } from "./db";

const now = new Date("2026-08-24T00:00:00.000Z");

describe("Signal of the Day eligibility", () => {
  it("accepts a pending, valid A/A+ signal at 80% confidence or higher", () => {
    expect(isSignalOfTheDayEligible({
      confidence: 95, outcome: "pending", expiresAt: new Date("2026-08-24T01:00:00.000Z"),
      metadata: JSON.stringify({ entryQualityLabel: "A+", entryQualityScore: 91 }),
    }, now)).toBe(true);
  });

  it("rejects expired, resolved, low-confidence, and ungraded candidates", () => {
    const base = { confidence: 95, outcome: "pending", expiresAt: new Date("2026-08-24T01:00:00.000Z"), metadata: JSON.stringify({ entryQualityLabel: "A" }) };
    expect(isSignalOfTheDayEligible({ ...base, confidence: 79 }, now)).toBe(false);
    expect(isSignalOfTheDayEligible({ ...base, outcome: "hit_tp" }, now)).toBe(false);
    expect(isSignalOfTheDayEligible({ ...base, expiresAt: new Date("2026-08-23T23:59:00.000Z") }, now)).toBe(false);
    expect(isSignalOfTheDayEligible({ ...base, metadata: JSON.stringify({ entryQualityLabel: "B" }) }, now)).toBe(false);
    expect(isSignalOfTheDayEligible({ ...base, metadata: "{}" }, now)).toBe(false);
  });
});
