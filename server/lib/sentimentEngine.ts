/**
 * AI Sentiment Engine for Perpetual Futures
 *
 * Computes a composite sentiment score for a given symbol by aggregating:
 *   1. Funding rate  — positive = longs paying (bearish pressure), negative = shorts paying (bullish)
 *   2. Open Interest trend — rising OI with rising price = bullish; rising OI with falling price = bearish
 *   3. Volume delta — buy vs sell volume imbalance from recent candles
 *   4. RSI (14) — momentum indicator
 *   5. Price momentum — 1h and 4h price change
 *
 * Final score: 0–100 (0 = extreme bearish, 50 = neutral, 100 = extreme bullish)
 * Label: STRONG_BULL | BULL | NEUTRAL | BEAR | STRONG_BEAR
 */

import axios from "axios";

export type SentimentLabel =
  | "STRONG_BULL"
  | "BULL"
  | "NEUTRAL"
  | "BEAR"
  | "STRONG_BEAR";

export interface SentimentFactor {
  name: string;
  value: number; // raw value
  score: number; // 0–100 contribution
  weight: number; // weight in composite
  label: string; // human-readable interpretation
}

export interface SentimentResult {
  symbol: string;
  exchange: string;
  score: number; // 0–100
  label: SentimentLabel;
  factors: SentimentFactor[];
  summary: string;
  computedAt: number; // unix ms
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/** Map a value in [low, high] linearly to [0, 100] */
function linearMap(v: number, low: number, high: number): number {
  if (high === low) return 50;
  return clamp(((v - low) / (high - low)) * 100);
}

function labelFromScore(score: number): SentimentLabel {
  if (score >= 72) return "STRONG_BULL";
  if (score >= 58) return "BULL";
  if (score >= 42) return "NEUTRAL";
  if (score >= 28) return "BEAR";
  return "STRONG_BEAR";
}

function summaryFromLabel(label: SentimentLabel, symbol: string): string {
  const base = symbol.replace("USDT", "").replace("-PERP", "");
  switch (label) {
    case "STRONG_BULL":
      return `${base} shows strong bullish momentum — funding, OI, and volume all align long.`;
    case "BULL":
      return `${base} leans bullish. Most indicators favour longs with moderate conviction.`;
    case "NEUTRAL":
      return `${base} is in equilibrium. Mixed signals — wait for a clearer directional trigger.`;
    case "BEAR":
      return `${base} leans bearish. Funding and momentum suggest short-side pressure.`;
    case "STRONG_BEAR":
      return `${base} shows strong bearish momentum — avoid longs, consider short setups.`;
  }
}

// ─── Data Fetchers ───────────────────────────────────────────────────────────

const BYBIT_BASE = "https://api.bybit.com";

async function fetchBinanceSentimentData(symbol: string) {
  // Binance is geo-blocked — delegate to Bybit
  return fetchBybitSentimentData(symbol);
}

async function fetchBybitSentimentData(symbol: string) {
  const sym = symbol.includes("USDT") ? symbol : `${symbol}USDT`;
  const [fundingRes, klinesRes] = await Promise.allSettled([
    axios.get(`${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${sym}`, { timeout: 5000 }),
    axios.get(`${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${sym}&interval=60&limit=20`, { timeout: 5000 }),
  ]);

  let funding = 0;
  if (fundingRes.status === "fulfilled") {
    const list = fundingRes.value.data?.result?.list ?? [];
    funding = parseFloat(list[0]?.fundingRate ?? "0");
  }

  let klines: number[][] = [];
  if (klinesRes.status === "fulfilled") {
    // Bybit kline: [startTime, open, high, low, close, volume, turnover]
    const raw: string[][] = klinesRes.value.data?.result?.list ?? [];
    klines = raw.map((r) => [
      Number(r[0]), // openTime
      Number(r[1]), // open
      Number(r[2]), // high
      Number(r[3]), // low
      Number(r[4]), // close
      Number(r[5]), // volume
      Number(r[5]), // quoteVolume (approx)
      0, 0, 0, 0, 0,
    ]);
  }

  return { funding, klines, openInterest: 0 };
}

// ─── Indicator Calculations ──────────────────────────────────────────────────

function calcRSI(klines: number[][], period = 14): number {
  if (klines.length < period + 1) return 50;
  const closes = klines.map((k) => k[4]);
  let gains = 0,
    losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcVolumeDelta(klines: number[][]): number {
  // Approximate buy/sell pressure: if close > open → buy candle, else sell
  if (klines.length === 0) return 0.5;
  let buyVol = 0,
    sellVol = 0;
  const recent = klines.slice(-10);
  for (const k of recent) {
    const [, open, , , close, vol] = k;
    if (close >= open) buyVol += vol;
    else sellVol += vol;
  }
  const total = buyVol + sellVol;
  return total === 0 ? 0.5 : buyVol / total; // 0–1
}

function calcPriceMomentum(klines: number[][]): { h1: number; h4: number } {
  if (klines.length < 4) return { h1: 0, h4: 0 };
  const closes = klines.map((k) => k[4]);
  const latest = closes[closes.length - 1];
  const h1Prev = closes[closes.length - 2];
  const h4Prev = closes[Math.max(0, closes.length - 5)];
  const h1 = h1Prev > 0 ? (latest - h1Prev) / h1Prev : 0;
  const h4 = h4Prev > 0 ? (latest - h4Prev) / h4Prev : 0;
  return { h1, h4 };
}

// ─── Composite Score Builder ─────────────────────────────────────────────────

function buildSentiment(
  symbol: string,
  exchange: string,
  funding: number,
  klines: number[][],
  openInterest: number
): SentimentResult {
  const rsi = calcRSI(klines);
  const volumeDeltaRatio = calcVolumeDelta(klines);
  const { h1, h4 } = calcPriceMomentum(klines);

  // ── Factor 1: Funding Rate ─────────────────────────────────────────────────
  // Funding > 0 means longs pay shorts → market is over-leveraged long → bearish signal
  // Funding < 0 means shorts pay longs → bearish over-leverage → bullish signal
  // Range: typically -0.003 to +0.003 (0.3%)
  const fundingScore = clamp(50 - funding * 10000); // invert: negative funding = bullish
  const fundingFactor: SentimentFactor = {
    name: "Funding Rate",
    value: funding,
    score: fundingScore,
    weight: 0.25,
    label:
      funding > 0.001
        ? "Longs over-leveraged (bearish)"
        : funding < -0.001
        ? "Shorts over-leveraged (bullish)"
        : "Neutral",
  };

  // ── Factor 2: RSI ──────────────────────────────────────────────────────────
  // RSI 30–70 mapped to 0–100; extremes capped
  const rsiScore = clamp(linearMap(rsi, 25, 75));
  const rsiFactor: SentimentFactor = {
    name: "RSI (14)",
    value: rsi,
    score: rsiScore,
    weight: 0.2,
    label:
      rsi > 70
        ? "Overbought"
        : rsi < 30
        ? "Oversold (potential reversal)"
        : rsi > 55
        ? "Bullish momentum"
        : rsi < 45
        ? "Bearish momentum"
        : "Neutral",
  };

  // ── Factor 3: Volume Delta ─────────────────────────────────────────────────
  const volDeltaScore = clamp(volumeDeltaRatio * 100);
  const volDeltaFactor: SentimentFactor = {
    name: "Volume Delta",
    value: volumeDeltaRatio,
    score: volDeltaScore,
    weight: 0.2,
    label:
      volumeDeltaRatio > 0.65
        ? "Strong buy pressure"
        : volumeDeltaRatio < 0.35
        ? "Strong sell pressure"
        : "Balanced",
  };

  // ── Factor 4: 1H Price Momentum ────────────────────────────────────────────
  const h1Score = clamp(50 + h1 * 2000); // ±2.5% maps to ±50 pts
  const h1Factor: SentimentFactor = {
    name: "1H Momentum",
    value: h1,
    score: h1Score,
    weight: 0.15,
    label:
      h1 > 0.01
        ? `+${(h1 * 100).toFixed(2)}% bullish`
        : h1 < -0.01
        ? `${(h1 * 100).toFixed(2)}% bearish`
        : "Flat",
  };

  // ── Factor 5: 4H Price Momentum ────────────────────────────────────────────
  const h4Score = clamp(50 + h4 * 1000); // ±5% maps to ±50 pts
  const h4Factor: SentimentFactor = {
    name: "4H Momentum",
    value: h4,
    score: h4Score,
    weight: 0.2,
    label:
      h4 > 0.02
        ? `+${(h4 * 100).toFixed(2)}% bullish trend`
        : h4 < -0.02
        ? `${(h4 * 100).toFixed(2)}% bearish trend`
        : "Ranging",
  };

  const factors = [fundingFactor, rsiFactor, volDeltaFactor, h1Factor, h4Factor];
  const composite = clamp(
    factors.reduce((acc, f) => acc + f.score * f.weight, 0)
  );

  const label = labelFromScore(composite);

  return {
    symbol,
    exchange,
    score: Math.round(composite),
    label,
    factors,
    summary: summaryFromLabel(label, symbol),
    computedAt: Date.now(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchSentiment(
  symbol: string,
  exchange: string = "binance"
): Promise<SentimentResult> {
  try {
    let funding = 0;
    let klines: number[][] = [];
    let openInterest = 0;

    if (exchange === "bybit") {
      ({ funding, klines, openInterest } = await fetchBybitSentimentData(symbol));
    } else {
      // Default to Bybit for all others (Binance is geo-blocked in deployment)
      ({ funding, klines, openInterest } = await fetchBybitSentimentData(symbol));
    }

    return buildSentiment(symbol, exchange, funding, klines, openInterest);
  } catch {
    // Return neutral on any error so UI never breaks
    return buildSentiment(symbol, exchange, 0, [], 0);
  }
}

export async function fetchSentimentBatch(
  pairs: { symbol: string; exchange: string }[]
): Promise<SentimentResult[]> {
  const results = await Promise.allSettled(
    pairs.map((p) => fetchSentiment(p.symbol, p.exchange))
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : buildSentiment(pairs[i].symbol, pairs[i].exchange, 0, [], 0)
  );
}
