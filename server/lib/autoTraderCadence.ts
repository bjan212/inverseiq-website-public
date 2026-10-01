export const AUTO_TRADER_STANDARD_CYCLE_DELAY_MS = 5 * 60 * 1000;
export const AUTO_TRADER_LOW_SCORE_API_WINDOW_MS = 60 * 1000;
export const AUTO_TRADER_ERROR_BACKOFF_BASE_MS = 60 * 1000;
export const AUTO_TRADER_ERROR_BACKOFF_MAX_MS = 5 * 60 * 1000;
export const HYPERLIQUID_REST_WEIGHT_LIMIT_PER_MINUTE = 1_200;

const HYPERLIQUID_STANDARD_INFO_WEIGHT = 20;
const HYPERLIQUID_L2_BOOK_WEIGHT = 2;

export function estimateHyperliquidStrictScanWeight(
  marketCount = 20,
  primaryCandleCount = 120,
  secondaryCandleCount = 60,
  sharedInfoCalls = 2
): number {
  const candleWeight = (count: number) => HYPERLIQUID_STANDARD_INFO_WEIGHT + Math.floor(count / 60);
  const perMarketWeight = candleWeight(primaryCandleCount)
    + candleWeight(secondaryCandleCount)
    + HYPERLIQUID_L2_BOOK_WEIGHT;
  return sharedInfoCalls * HYPERLIQUID_STANDARD_INFO_WEIGHT + marketCount * perMarketWeight;
}

export type AutoTraderCycleOutcome =
  | "ineligible"
  | "position_opened"
  | "position_monitor"
  | "cooldown"
  | "daily_limit"
  | "drawdown_pause"
  | "inactive"
  | "error";

/**
 * Low-score outcomes queue the next scan immediately, but the expensive
 * 20-market REST scan must not re-enter Hyperliquid's 1,200-weight rolling
 * minute before the prior request window clears. Errors use bounded
 * exponential backoff. All non-scan states retain the existing five-minute
 * cadence.
 */
export function getNextAutoTraderCycleDelay(
  outcome: AutoTraderCycleOutcome,
  consecutiveErrors: number
): number | null {
  if (outcome === "inactive") return null;
  if (outcome === "ineligible") return AUTO_TRADER_LOW_SCORE_API_WINDOW_MS;
  if (outcome === "error") {
    const exponent = Math.max(0, consecutiveErrors - 1);
    return Math.min(
      AUTO_TRADER_ERROR_BACKOFF_BASE_MS * 2 ** exponent,
      AUTO_TRADER_ERROR_BACKOFF_MAX_MS
    );
  }
  return AUTO_TRADER_STANDARD_CYCLE_DELAY_MS;
}

export function isAutoTraderExecutionAuthorized(
  signalAborted: boolean,
  persistedActive: boolean | null | undefined
): boolean {
  return !signalAborted && persistedActive === true;
}

export function canBeginAutoTraderCycle(
  loopExists: boolean,
  signalAborted: boolean,
  cycleInFlight: boolean
): boolean {
  return loopExists && !signalAborted && !cycleInFlight;
}

export function isPersistedAutoTraderActive(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}
