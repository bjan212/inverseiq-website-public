import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("./db", () => ({
  getPendingFeedbackOutbox: vi.fn(),
  markFeedbackDelivered: vi.fn(),
  queueFeedbackOutbox: vi.fn(),
  recordFeedbackDeliveryFailure: vi.fn(),
}));
vi.mock("./_core/env", () => ({
  ENV: { inverseiqBackendUrl: "https://backend.test", inverseiqFeedbackApiKey: "" },
}));
vi.mock("axios", () => ({ default: { post: mocks.post } }));

import { submitSignalFeedback } from "./backendFeedback";

describe("feedback backend authentication", () => {
  it("retains feedback locally rather than sending it to an unauthenticated backend", async () => {
    await expect(
      submitSignalFeedback({
        signalId: 12,
        symbol: "ETHUSDT",
        direction: "LONG",
        entry: 2500,
        exit: 2550,
        outcome: "win",
        confidence: 85,
        strategy: "bestCoin",
      })
    ).resolves.toEqual({ success: false, message: "Feedback API key not configured" });
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
