/**
 * validityTimer.ts
 *
 * Computes a precise signal validity window in seconds based on live market data.
 *
 * Logic:
 *  1. Base window comes from the dominant timeframe (5m → 20min, 15m → 45min, 1h → 3h, 4h → 12h)
 *  2. ATR as % of price (normalised volatility) scales the window:
 *     - High volatility (ATR% > 2%) → shorten by 30%  (market moves fast, signal stales quickly)
 *     - Low  volatility (ATR% < 0.3%) → extend by 40%  (slow market, signal stays valid longer)
 *  3. RSI extremity bonus: RSI > 70 or < 30 → extend by 20% (strong momentum, signal more durable)
 *  4. Confidence multiplier: HIGH → ×1.2, MEDIUM → ×1.0, LOW → ×0.7
 *  5. Hard caps: min 10 minutes, max 24 hours
 *
 * All inputs come from data already fetched during the scan — no extra API calls needed.
 */

export interface ValidityInput {
  /** ATR value from the 1H candles */
  atr1h: number;
  /** Current live price from the exchange */
  currentPrice: number;
  /** RSI from the primary timeframe (1H) */
  rsi1h: number;
  /** Confidence level from the LLM */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Primary timeframe used for the scan (default "1h") */
  primaryTf?: "5m" | "15m" | "1h" | "4h";
  /** Optional: LLM-suggested validity string as a fallback hint e.g. "2-4 hours" */
  llmValidityHint?: string | null;
}

/** Base validity windows in seconds per timeframe */
const BASE_SECONDS: Record<string, number> = {
  "5m":  20 * 60,       // 20 minutes
  "15m": 45 * 60,       // 45 minutes
  "1h":  3  * 3600,     // 3 hours
  "4h":  12 * 3600,     // 12 hours
};

/**
 * Parse an LLM validity hint string into seconds as a sanity-check fallback.
 * e.g. "2-4 hours" → 10800, "30 minutes" → 1800
 */
export function parseLLMValidityHint(hint: string | null | undefined): number | null {
  if (!hint) return null;
  const rangeH = hint.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*h/i);
  if (rangeH) return Math.round(((parseFloat(rangeH[1]) + parseFloat(rangeH[2])) / 2) * 3600);
  const singleH = hint.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (singleH) return Math.round(parseFloat(singleH[1]) * 3600);
  const mins = hint.match(/(\d+)\s*min/i);
  if (mins) return parseInt(mins[1]) * 60;
  return null;
}

/**
 * Compute a precise validity window in seconds from live market data.
 */
export function computeValiditySeconds(input: ValidityInput): number {
  const {
    atr1h,
    currentPrice,
    rsi1h,
    confidence,
    primaryTf = "1h",
    llmValidityHint,
  } = input;

  // 1. Base window
  let seconds = BASE_SECONDS[primaryTf] ?? BASE_SECONDS["1h"];

  // 2. ATR-based volatility scaling
  const atrPct = currentPrice > 0 ? (atr1h / currentPrice) * 100 : 1;
  if (atrPct > 2.0) {
    // High volatility — signal stales quickly
    seconds = Math.round(seconds * 0.70);
  } else if (atrPct > 1.0) {
    seconds = Math.round(seconds * 0.85);
  } else if (atrPct < 0.3) {
    // Very low volatility — signal stays valid longer
    seconds = Math.round(seconds * 1.40);
  } else if (atrPct < 0.6) {
    seconds = Math.round(seconds * 1.20);
  }

  // 3. RSI extremity bonus — strong momentum = more durable signal
  if (rsi1h >= 70 || rsi1h <= 30) {
    seconds = Math.round(seconds * 1.20);
  } else if (rsi1h >= 65 || rsi1h <= 35) {
    seconds = Math.round(seconds * 1.10);
  }

  // 4. Confidence multiplier
  const confMult: Record<string, number> = {
    HIGH:   1.20,
    MEDIUM: 1.00,
    LOW:    0.70,
  };
  seconds = Math.round(seconds * (confMult[confidence] ?? 1.0));

  // 5. Sanity-check against LLM hint (blend if hint is reasonable)
  const llmSecs = parseLLMValidityHint(llmValidityHint);
  if (llmSecs !== null) {
    // Blend: 60% our calculation, 40% LLM hint
    seconds = Math.round(seconds * 0.6 + llmSecs * 0.4);
  }

  // 6. Hard caps: 10 minutes → 24 hours
  const MIN_SECS = 10 * 60;
  const MAX_SECS = 24 * 3600;
  return Math.max(MIN_SECS, Math.min(MAX_SECS, seconds));
}

/**
 * Format a seconds value into a human-readable validity string.
 * e.g. 7200 → "2h 00m"
 */
export function formatValidityDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}
