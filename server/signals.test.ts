import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import type { Request, Response } from "express";

/**
 * Test suite for signal history API endpoints
 */

describe("Signal History API", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    // Create a mock context for testing
    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockContext = createContext({ req: mockReq, res: mockRes });
    caller = appRouter.createCaller(mockContext);
  });

  it("should save a new signal", async () => {
    const signalData = {
      symbol: "BTC/USDT",
      direction: "LONG" as const,
      strategy: "Test Strategy",
      entryPrice: "50000",
      stopLoss: "49000",
      takeProfit: "52000",
      confidence: 85,
      riskRewardRatio: "2.0",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: JSON.stringify({ test: true }),
    };

    const result = await caller.signals.save(signalData);

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it("should retrieve signals with minimum confidence filter", async () => {
    const signals = await caller.signals.list({
      minConfidence: 80,
      limit: 10,
    });

    expect(Array.isArray(signals)).toBe(true);
    // All signals should have confidence >= 80
    signals.forEach((signal) => {
      expect(signal.confidence).toBeGreaterThanOrEqual(80);
    });
  });

  it("should retrieve signal statistics", async () => {
    const stats = await caller.signals.stats({
      minConfidence: 80,
    });

    expect(stats).toBeDefined();
    if (stats) {
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.hitTp).toBe("number");
      expect(typeof stats.hitSl).toBe("number");
      expect(typeof stats.expired).toBe("number");
      expect(typeof stats.pending).toBe("number");
      expect(typeof stats.winRate).toBe("string");
    }
  });

  it("should filter signals by outcome", async () => {
    const pendingSignals = await caller.signals.list({
      outcome: "pending",
    });

    expect(Array.isArray(pendingSignals)).toBe(true);
    pendingSignals.forEach((signal) => {
      expect(signal.outcome).toBe("pending");
    });
  });

  it("should validate confidence range", async () => {
    const invalidSignal = {
      symbol: "BTC/USDT",
      direction: "LONG" as const,
      strategy: "Test Strategy",
      entryPrice: "50000",
      stopLoss: "49000",
      takeProfit: "52000",
      confidence: 150, // Invalid: > 100
      riskRewardRatio: "2.0",
    };

    await expect(caller.signals.save(invalidSignal)).rejects.toThrow();
  });

  it("should validate direction enum", async () => {
    const invalidSignal = {
      symbol: "BTC/USDT",
      direction: "INVALID" as any,
      strategy: "Test Strategy",
      entryPrice: "50000",
      stopLoss: "49000",
      takeProfit: "52000",
      confidence: 85,
    };

    await expect(caller.signals.save(invalidSignal)).rejects.toThrow();
  });
});
