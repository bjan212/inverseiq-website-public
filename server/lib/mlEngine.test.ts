/**
 * mlEngine.test.ts
 *
 * Unit tests for the Self-Adaptive ML Engine.
 * Tests model training, inference, and persistence logic.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the database module to avoid requiring a real DB connection
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe("mlEngine", () => {
  describe("predictSignal", () => {
    it("should return null when no model is loaded (no DB)", async () => {
      const { predictSignal } = await import("./mlEngine");
      const features: Record<string, number> = {};
      // Fill with dummy features
      const { getFeatureNames } = await import("./featureEngine");
      const names = getFeatureNames();
      names.forEach(name => { features[name] = Math.random() * 100; });

      const result = await predictSignal(features);
      // Without a trained model in DB, should return null
      expect(result).toBeNull();
    });
  });

  describe("retrainModel", () => {
    it("should fail gracefully when database is not available", async () => {
      const { retrainModel } = await import("./mlEngine");
      const result = await retrainModel();
      expect(result.success).toBe(false);
      expect(result.message).toContain("Database not available");
    });
  });

  describe("getModelStatus", () => {
    it("should return unloaded status when no model exists", async () => {
      const { getModelStatus } = await import("./mlEngine");
      const status = await getModelStatus();
      expect(status.loaded).toBe(false);
      expect(status.version).toBe(0);
      expect(status.accuracy).toBe(0);
      expect(status.trainingSamples).toBe(0);
    });
  });
});
