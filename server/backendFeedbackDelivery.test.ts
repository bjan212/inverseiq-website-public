import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPending: vi.fn(),
  markDelivered: vi.fn(),
  recordFailure: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./db", () => ({
  getPendingFeedbackOutbox: mocks.getPending,
  markFeedbackDelivered: mocks.markDelivered,
  recordFeedbackDeliveryFailure: mocks.recordFailure,
  queueFeedbackOutbox: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    inverseiqBackendUrl: "https://backend.test",
    inverseiqFeedbackApiKey: "test-feedback-key",
  },
}));
vi.mock("axios", () => ({ default: { post: mocks.post } }));

import { deliverQueuedFeedback } from "./backendFeedback";

const queuedItem = {
  id: 7,
  signalId: 42,
  symbol: "BTCUSDT",
  direction: "LONG" as const,
  entryPrice: "100",
  exitPrice: "110",
  outcome: "win" as const,
  confidence: 88,
  strategy: "InverseIQ",
  status: "pending" as const,
  attemptCount: 0,
  lastAttemptAt: null,
  deliveredAt: null,
  lastError: null,
  createdAt: new Date(),
};

describe("durable feedback delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPending.mockResolvedValue([queuedItem]);
  });

  it("marks a record delivered only after the backend confirms success", async () => {
    mocks.post.mockResolvedValue({ data: { success: true } });

    await expect(deliverQueuedFeedback()).resolves.toEqual({ delivered: 1, failed: 0, pending: 1 });
    expect(mocks.markDelivered).toHaveBeenCalledWith(7);
    expect(mocks.recordFailure).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith(
      "https://backend.test/api/feedback/signal-outcome",
      expect.objectContaining({ signalId: 42, entry: 100, exit: 110 }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-feedback-key" }),
      })
    );
  });

  it("retains the queued record and stores the error when the backend is unreachable", async () => {
    mocks.post.mockRejectedValue(new Error("backend offline"));

    await expect(deliverQueuedFeedback()).resolves.toEqual({ delivered: 0, failed: 1, pending: 1 });
    expect(mocks.markDelivered).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(7, "backend offline");
  });
});
