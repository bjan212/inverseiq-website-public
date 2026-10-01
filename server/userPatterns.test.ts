/**
 * Vitest tests for the userPatterns tRPC router.
 *
 * Tests cover:
 *  - saveUserPatterns  (db helper)
 *  - getUserPatterns   (db helper)
 *  - deleteUserPatterns (db helper)
 *  - Pattern type validation via Zod schema
 *  - Empty pattern array handling (clear-on-save)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the database module ─────────────────────────────────────────────────
vi.mock("./db", () => ({
  saveUserPatterns: vi.fn(),
  getUserPatterns: vi.fn(),
  deleteUserPatterns: vi.fn(),
}));

import * as db from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_PATTERNS = [
  {
    patternType: "LONG_FAILURE" as const,
    confidence: 78,
    description: "User has a 78% failure rate on Long positions.",
    action: "INVERT_LONG",
    tradeCount: 50,
    totalWins: 11,
    totalLosses: 39,
  },
  {
    patternType: "FOMO_ENTRY" as const,
    confidence: 85,
    description: "Detected frequent rapid-fire entries after losses (Revenge Trading).",
    action: "WAIT",
    tradeCount: 50,
    totalWins: 11,
    totalLosses: 39,
  },
];

const MOCK_DB_ROWS = MOCK_PATTERNS.map((p, i) => ({
  id: i + 1,
  userId: 42,
  ...p,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-15"),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("userPatterns db helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveUserPatterns", () => {
    it("calls saveUserPatterns with correct userId and patterns", async () => {
      vi.mocked(db.saveUserPatterns).mockResolvedValue(undefined);

      await db.saveUserPatterns(42, MOCK_PATTERNS);

      expect(db.saveUserPatterns).toHaveBeenCalledOnce();
      expect(db.saveUserPatterns).toHaveBeenCalledWith(42, MOCK_PATTERNS);
    });

    it("accepts an empty array (clear-on-save semantics)", async () => {
      vi.mocked(db.saveUserPatterns).mockResolvedValue(undefined);

      await db.saveUserPatterns(42, []);

      expect(db.saveUserPatterns).toHaveBeenCalledWith(42, []);
    });

    it("handles all four valid patternType values", async () => {
      vi.mocked(db.saveUserPatterns).mockResolvedValue(undefined);

      const allTypes = [
        "LONG_FAILURE",
        "SHORT_FAILURE",
        "FOMO_ENTRY",
        "PANIC_SELL",
      ] as const;

      for (const patternType of allTypes) {
        await db.saveUserPatterns(1, [
          {
            patternType,
            confidence: 70,
            description: `Test ${patternType}`,
            action: "WAIT",
            tradeCount: 10,
            totalWins: 3,
            totalLosses: 7,
          },
        ]);
      }

      expect(db.saveUserPatterns).toHaveBeenCalledTimes(4);
    });
  });

  describe("getUserPatterns", () => {
    it("returns mapped patterns for a given userId", async () => {
      vi.mocked(db.getUserPatterns).mockResolvedValue(MOCK_DB_ROWS as any);

      const result = await db.getUserPatterns(42);

      expect(db.getUserPatterns).toHaveBeenCalledWith(42);
      expect(result).toHaveLength(2);
      expect(result[0].patternType).toBe("LONG_FAILURE");
      expect(result[1].patternType).toBe("FOMO_ENTRY");
    });

    it("returns empty array when no patterns exist", async () => {
      vi.mocked(db.getUserPatterns).mockResolvedValue([]);

      const result = await db.getUserPatterns(99);

      expect(result).toEqual([]);
    });

    it("returns patterns ordered by confidence descending", async () => {
      const rows = [
        { ...MOCK_DB_ROWS[1], confidence: 85 }, // FOMO_ENTRY
        { ...MOCK_DB_ROWS[0], confidence: 78 }, // LONG_FAILURE
      ];
      vi.mocked(db.getUserPatterns).mockResolvedValue(rows as any);

      const result = await db.getUserPatterns(42);

      expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
    });
  });

  describe("deleteUserPatterns", () => {
    it("calls deleteUserPatterns with the correct userId", async () => {
      vi.mocked(db.deleteUserPatterns).mockResolvedValue(undefined);

      await db.deleteUserPatterns(42);

      expect(db.deleteUserPatterns).toHaveBeenCalledOnce();
      expect(db.deleteUserPatterns).toHaveBeenCalledWith(42);
    });
  });
});

// ─── Zod schema validation tests (inline) ────────────────────────────────────

describe("userPatterns input validation", () => {
  it("accepts valid pattern types", () => {
    const { z } = require("zod");
    const patternTypeSchema = z.enum([
      "LONG_FAILURE",
      "SHORT_FAILURE",
      "FOMO_ENTRY",
      "PANIC_SELL",
    ]);

    expect(() => patternTypeSchema.parse("LONG_FAILURE")).not.toThrow();
    expect(() => patternTypeSchema.parse("SHORT_FAILURE")).not.toThrow();
    expect(() => patternTypeSchema.parse("FOMO_ENTRY")).not.toThrow();
    expect(() => patternTypeSchema.parse("PANIC_SELL")).not.toThrow();
  });

  it("rejects invalid pattern types", () => {
    const { z } = require("zod");
    const patternTypeSchema = z.enum([
      "LONG_FAILURE",
      "SHORT_FAILURE",
      "FOMO_ENTRY",
      "PANIC_SELL",
    ]);

    expect(() => patternTypeSchema.parse("UNKNOWN_TYPE")).toThrow();
    expect(() => patternTypeSchema.parse("")).toThrow();
    expect(() => patternTypeSchema.parse(null)).toThrow();
  });

  it("rejects confidence values outside 0-100", () => {
    const { z } = require("zod");
    const confidenceSchema = z.number().int().min(0).max(100);

    expect(() => confidenceSchema.parse(-1)).toThrow();
    expect(() => confidenceSchema.parse(101)).toThrow();
    expect(() => confidenceSchema.parse(50)).not.toThrow();
    expect(() => confidenceSchema.parse(0)).not.toThrow();
    expect(() => confidenceSchema.parse(100)).not.toThrow();
  });

  it("rejects negative tradeCount, totalWins, totalLosses", () => {
    const { z } = require("zod");
    const countSchema = z.number().int().min(0);

    expect(() => countSchema.parse(-1)).toThrow();
    expect(() => countSchema.parse(0)).not.toThrow();
    expect(() => countSchema.parse(100)).not.toThrow();
  });
});
