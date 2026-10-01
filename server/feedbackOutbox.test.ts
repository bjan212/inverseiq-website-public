import { describe, expect, it } from "vitest";

function shouldQueueFeedback(outcome: string, entry: number, exit: number) {
  return (outcome === "hit_tp" || outcome === "hit_sl") && Number.isFinite(entry) && Number.isFinite(exit);
}

describe("feedback outbox eligibility", () => {
  it("queues only verified TP/SL outcomes with finite price data", () => {
    expect(shouldQueueFeedback("hit_tp", 100, 110)).toBe(true);
    expect(shouldQueueFeedback("hit_sl", 100, 95)).toBe(true);
    expect(shouldQueueFeedback("expired", 100, 100)).toBe(false);
    expect(shouldQueueFeedback("hit_tp", Number.NaN, 110)).toBe(false);
  });
});
