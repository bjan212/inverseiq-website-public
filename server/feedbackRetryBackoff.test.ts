import { describe, expect, it } from "vitest";
import { getFeedbackRetryDelayMs } from "./db";

describe("feedback retry backoff", () => {
  it("starts at five minutes and doubles for each failed attempt", () => {
    expect(getFeedbackRetryDelayMs(1)).toBe(5 * 60 * 1000);
    expect(getFeedbackRetryDelayMs(2)).toBe(10 * 60 * 1000);
    expect(getFeedbackRetryDelayMs(3)).toBe(20 * 60 * 1000);
  });

  it("caps prolonged backend outages at six hours", () => {
    expect(getFeedbackRetryDelayMs(24)).toBe(6 * 60 * 60 * 1000);
  });
});
