import { describe, expect, it } from "vitest";
import {
  AUTO_TRADER_ERROR_BACKOFF_MAX_MS,
  AUTO_TRADER_LOW_SCORE_API_WINDOW_MS,
  AUTO_TRADER_STANDARD_CYCLE_DELAY_MS,
  HYPERLIQUID_REST_WEIGHT_LIMIT_PER_MINUTE,
  canBeginAutoTraderCycle,
  estimateHyperliquidStrictScanWeight,
  isPersistedAutoTraderActive,
  getNextAutoTraderCycleDelay,
  isAutoTraderExecutionAuthorized,
} from "./lib/autoTraderCadence";

describe("Auto Trader scan cadence", () => {
  it("queues the next low-score scan at the earliest safe REST-weight window", () => {
    expect(getNextAutoTraderCycleDelay("ineligible", 0)).toBe(AUTO_TRADER_LOW_SCORE_API_WINDOW_MS);
    expect(AUTO_TRADER_LOW_SCORE_API_WINDOW_MS).toBeLessThan(AUTO_TRADER_STANDARD_CYCLE_DELAY_MS);
  });

  it("retains the existing cadence for positions, cooldown, and daily limits", () => {
    expect(getNextAutoTraderCycleDelay("position_opened", 0)).toBe(AUTO_TRADER_STANDARD_CYCLE_DELAY_MS);
    expect(getNextAutoTraderCycleDelay("position_monitor", 0)).toBe(AUTO_TRADER_STANDARD_CYCLE_DELAY_MS);
    expect(getNextAutoTraderCycleDelay("cooldown", 0)).toBe(AUTO_TRADER_STANDARD_CYCLE_DELAY_MS);
    expect(getNextAutoTraderCycleDelay("daily_limit", 0)).toBe(AUTO_TRADER_STANDARD_CYCLE_DELAY_MS);
  });

  it("backs off exponentially after worker or API errors and caps the delay", () => {
    expect(getNextAutoTraderCycleDelay("error", 1)).toBe(60_000);
    expect(getNextAutoTraderCycleDelay("error", 2)).toBe(120_000);
    expect(getNextAutoTraderCycleDelay("error", 3)).toBe(240_000);
    expect(getNextAutoTraderCycleDelay("error", 10)).toBe(AUTO_TRADER_ERROR_BACKOFF_MAX_MS);
  });

  it("does not reschedule an inactive worker", () => {
    expect(getNextAutoTraderCycleDelay("inactive", 0)).toBeNull();
  });

  it("blocks execution when a stop arrives during a scan", () => {
    expect(isAutoTraderExecutionAuthorized(false, true)).toBe(true);
    expect(isAutoTraderExecutionAuthorized(true, true)).toBe(false);
    expect(isAutoTraderExecutionAuthorized(false, false)).toBe(false);
    expect(isAutoTraderExecutionAuthorized(false, null)).toBe(false);
  });

  it("never begins an overlapping cycle", () => {
    expect(canBeginAutoTraderCycle(true, false, false)).toBe(true);
    expect(canBeginAutoTraderCycle(true, false, true)).toBe(false);
    expect(canBeginAutoTraderCycle(true, true, false)).toBe(false);
    expect(canBeginAutoTraderCycle(false, false, false)).toBe(false);
  });

  it("keeps the 20-market strict scan inside Hyperliquid's documented one-minute weight budget", () => {
    const estimatedWeight = estimateHyperliquidStrictScanWeight(20, 120, 60, 2);
    expect(estimatedWeight).toBe(940);
    expect(estimatedWeight).toBeLessThan(HYPERLIQUID_REST_WEIGHT_LIMIT_PER_MINUTE);
  });

  it("continues only when persisted active state is explicitly true", () => {
    expect(isPersistedAutoTraderActive(true)).toBe(true);
    expect(isPersistedAutoTraderActive(1)).toBe(true);
    expect(isPersistedAutoTraderActive("1")).toBe(true);
    expect(isPersistedAutoTraderActive(false)).toBe(false);
    expect(isPersistedAutoTraderActive(0)).toBe(false);
    expect(isPersistedAutoTraderActive("0")).toBe(false);
    expect(isPersistedAutoTraderActive(null)).toBe(false);
    expect(isPersistedAutoTraderActive(undefined)).toBe(false);
  });
});
