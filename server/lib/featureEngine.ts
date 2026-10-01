/**
 * featureEngine.ts
 *
 * FreqAI-style Feature Engineering Pipeline (Layer 1)
 *
 * Generates 100+ named features across multiple timeframes (5m, 15m, 1h, 4h)
 * for a given trading symbol. Features include:
 *   - RSI (14) per timeframe
 *   - EMA (9, 21, 50, 200) per timeframe
 *   - Bollinger Band position per timeframe
 *   - MACD histogram per timeframe
 *   - ADX (14) per timeframe
 *   - ATR (14) per timeframe
 *   - Stochastic %K/%D per timeframe
 *   - OBV slope per timeframe
 *   - MFI (14) per timeframe
 *   - Volume ratio (current vs 20-period avg)
 *   - Lagged features (t-1, t-2, t-3 candles) for 1h
 *   - BTC correlation (20-period rolling)
 *   - Cross-timeframe divergences
 *
 * Output: flat object with 100+ named numeric features ready for ML model input.
 */

import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureVector {
  [key: string]: number;
}

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const CANDLE_LIMITS: Record<Timeframe, number> = {
  "5m": 200,
  "15m": 200,
  "1h": 200,
  "4h": 100,
};

const HTTP_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/2.0)" };
const TIMEOUT = 8000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a complete feature vector for a given symbol.
 * Returns 100+ named features as a flat numeric object.
 */
export async function generateFeatures(symbol: string): Promise<FeatureVector> {
  // Fetch candles for all timeframes + BTC 1h in parallel
  const [candles5m, candles15m, candles1h, candles4h, btcCandles1h] = await Promise.all([
    fetchOHLCV(symbol, "5m", CANDLE_LIMITS["5m"]),
    fetchOHLCV(symbol, "15m", CANDLE_LIMITS["15m"]),
    fetchOHLCV(symbol, "1h", CANDLE_LIMITS["1h"]),
    fetchOHLCV(symbol, "4h", CANDLE_LIMITS["4h"]),
    fetchOHLCV("BTCUSDT", "1h", 50),
  ]);

  const features: FeatureVector = {};

  // Per-timeframe features
  const tfCandles: Record<Timeframe, OHLCV[]> = {
    "5m": candles5m,
    "15m": candles15m,
    "1h": candles1h,
    "4h": candles4h,
  };

  for (const tf of TIMEFRAMES) {
    const candles = tfCandles[tf];
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    const opens = candles.map(c => c.open);
    const prefix = tf; // e.g. "5m_rsi14"

    // RSI
    features[`${prefix}_rsi14`] = computeRSI(closes, 14);

    // EMA values (normalized as distance from price in %)
    const price = closes[closes.length - 1];
    for (const period of [9, 21, 50, 200]) {
      const ema = computeEMA(closes, period);
      features[`${prefix}_ema${period}_dist`] = ((price - ema) / price) * 100;
    }

    // EMA stack direction (1 = bullish stack, -1 = bearish, 0 = mixed)
    const ema9 = computeEMA(closes, 9);
    const ema21 = computeEMA(closes, 21);
    const ema50 = computeEMA(closes, 50);
    features[`${prefix}_ema_stack`] = ema9 > ema21 && ema21 > ema50 ? 1 : ema9 < ema21 && ema21 < ema50 ? -1 : 0;

    // Bollinger Band position (0-100)
    features[`${prefix}_bb_pos`] = computeBBPosition(closes, 20);

    // Bollinger Band width (volatility measure)
    features[`${prefix}_bb_width`] = computeBBWidth(closes, 20);

    // MACD histogram (normalized)
    const macd = computeMACDFull(closes);
    features[`${prefix}_macd_hist`] = macd.histogram;
    features[`${prefix}_macd_signal_dist`] = macd.macdLine - macd.signalLine;

    // ADX
    features[`${prefix}_adx`] = computeADX(highs, lows, closes, 14);

    // ATR (normalized as % of price)
    const atr = computeATR(highs, lows, closes, 14);
    features[`${prefix}_atr_pct`] = (atr / price) * 100;

    // Stochastic %K and %D
    const stoch = computeStochastic(highs, lows, closes, 14, 3);
    features[`${prefix}_stoch_k`] = stoch.k;
    features[`${prefix}_stoch_d`] = stoch.d;

    // OBV slope (normalized)
    features[`${prefix}_obv_slope`] = computeOBVSlope(closes, volumes, 14);

    // MFI (Money Flow Index)
    features[`${prefix}_mfi`] = computeMFI(highs, lows, closes, volumes, 14);

    // Volume ratio (current vs 20-period average)
    features[`${prefix}_vol_ratio`] = computeVolumeRatio(volumes, 20);

    // Price change % (last candle)
    features[`${prefix}_price_change_pct`] = closes.length >= 2
      ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
      : 0;

    // Candle body ratio (body / range)
    const lastIdx = candles.length - 1;
    const bodyRatio = Math.abs(closes[lastIdx] - opens[lastIdx]) / (highs[lastIdx] - lows[lastIdx] || 0.0001);
    features[`${prefix}_body_ratio`] = bodyRatio;

    // Upper/lower wick ratio
    const upperWick = highs[lastIdx] - Math.max(opens[lastIdx], closes[lastIdx]);
    const lowerWick = Math.min(opens[lastIdx], closes[lastIdx]) - lows[lastIdx];
    const range = highs[lastIdx] - lows[lastIdx] || 0.0001;
    features[`${prefix}_upper_wick_ratio`] = upperWick / range;
    features[`${prefix}_lower_wick_ratio`] = lowerWick / range;
  }

  // ── Lagged features (1h timeframe, t-1, t-2, t-3) ──────────────────────────
  const closes1h = candles1h.map(c => c.close);
  for (let lag = 1; lag <= 3; lag++) {
    const idx = closes1h.length - 1 - lag;
    if (idx >= 14) {
      const laggedCloses = closes1h.slice(0, idx + 1);
      features[`1h_rsi14_lag${lag}`] = computeRSI(laggedCloses, 14);
      features[`1h_bb_pos_lag${lag}`] = computeBBPosition(laggedCloses, 20);
      features[`1h_price_change_lag${lag}`] = laggedCloses.length >= 2
        ? ((laggedCloses[laggedCloses.length - 1] - laggedCloses[laggedCloses.length - 2]) / laggedCloses[laggedCloses.length - 2]) * 100
        : 0;
    } else {
      features[`1h_rsi14_lag${lag}`] = 50;
      features[`1h_bb_pos_lag${lag}`] = 50;
      features[`1h_price_change_lag${lag}`] = 0;
    }
  }

  // ── BTC correlation (20-period rolling on 1h closes) ────────────────────────
  const btcCloses = btcCandles1h.map(c => c.close);
  features["btc_correlation_20"] = computeCorrelation(
    closes1h.slice(-20),
    btcCloses.slice(-20)
  );

  // ── BTC relative strength ──────────────────────────────────────────────────
  const symbolReturn = closes1h.length >= 20
    ? (closes1h[closes1h.length - 1] - closes1h[closes1h.length - 20]) / closes1h[closes1h.length - 20]
    : 0;
  const btcReturn = btcCloses.length >= 20
    ? (btcCloses[btcCloses.length - 1] - btcCloses[btcCloses.length - 20]) / btcCloses[btcCloses.length - 20]
    : 0;
  features["btc_relative_strength"] = (symbolReturn - btcReturn) * 100;

  // ── Cross-timeframe divergences ─────────────────────────────────────────────
  // RSI divergence between 5m and 1h
  features["rsi_divergence_5m_1h"] = features["5m_rsi14"] - features["1h_rsi14"];
  // RSI divergence between 15m and 4h
  features["rsi_divergence_15m_4h"] = features["15m_rsi14"] - features["4h_rsi14"];
  // MACD divergence between 1h and 4h
  features["macd_divergence_1h_4h"] = features["1h_macd_hist"] - features["4h_macd_hist"];
  // EMA stack agreement across timeframes
  features["ema_stack_agreement"] = features["5m_ema_stack"] + features["15m_ema_stack"] + features["1h_ema_stack"] + features["4h_ema_stack"];

  // ── Momentum features ───────────────────────────────────────────────────────
  // Rate of change (ROC) 10-period on 1h
  features["1h_roc_10"] = closes1h.length >= 11
    ? ((closes1h[closes1h.length - 1] - closes1h[closes1h.length - 11]) / closes1h[closes1h.length - 11]) * 100
    : 0;
  // ROC 20-period on 1h
  features["1h_roc_20"] = closes1h.length >= 21
    ? ((closes1h[closes1h.length - 1] - closes1h[closes1h.length - 21]) / closes1h[closes1h.length - 21]) * 100
    : 0;

  // ── Volatility regime ───────────────────────────────────────────────────────
  // Current ATR vs 50-period ATR average (regime detection)
  const atrSeries1h = computeATRSeries(candles1h.map(c => c.high), candles1h.map(c => c.low), closes1h, 14);
  if (atrSeries1h.length >= 50) {
    const recentATR = atrSeries1h[atrSeries1h.length - 1];
    const avgATR = atrSeries1h.slice(-50).reduce((a, b) => a + b, 0) / 50;
    features["1h_atr_regime"] = avgATR > 0 ? recentATR / avgATR : 1;
  } else {
    features["1h_atr_regime"] = 1;
  }

  return features;
}

/**
 * Get the list of all feature names this engine produces.
 * Useful for model training and feature importance display.
 */
export function getFeatureNames(): string[] {
  const names: string[] = [];
  for (const tf of TIMEFRAMES) {
    names.push(
      `${tf}_rsi14`,
      `${tf}_ema9_dist`, `${tf}_ema21_dist`, `${tf}_ema50_dist`, `${tf}_ema200_dist`,
      `${tf}_ema_stack`,
      `${tf}_bb_pos`, `${tf}_bb_width`,
      `${tf}_macd_hist`, `${tf}_macd_signal_dist`,
      `${tf}_adx`,
      `${tf}_atr_pct`,
      `${tf}_stoch_k`, `${tf}_stoch_d`,
      `${tf}_obv_slope`,
      `${tf}_mfi`,
      `${tf}_vol_ratio`,
      `${tf}_price_change_pct`,
      `${tf}_body_ratio`,
      `${tf}_upper_wick_ratio`, `${tf}_lower_wick_ratio`,
    );
  }
  // Lagged
  for (let lag = 1; lag <= 3; lag++) {
    names.push(`1h_rsi14_lag${lag}`, `1h_bb_pos_lag${lag}`, `1h_price_change_lag${lag}`);
  }
  // Cross-pair & divergences
  names.push(
    "btc_correlation_20", "btc_relative_strength",
    "rsi_divergence_5m_1h", "rsi_divergence_15m_4h",
    "macd_divergence_1h_4h", "ema_stack_agreement",
    "1h_roc_10", "1h_roc_20", "1h_atr_regime",
  );
  return names;
}

// ─── Indicator Computations ───────────────────────────────────────────────────

function computeRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  return al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeBBPosition(closes: number[], period: number): number {
  if (closes.length < period) return 50;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const last = closes[closes.length - 1];
  if (upper === lower) return 50;
  return parseFloat(Math.max(0, Math.min(100, ((last - lower) / (upper - lower)) * 100)).toFixed(2));
}

function computeBBWidth(closes: number[], period: number): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return mean > 0 ? parseFloat(((4 * std) / mean * 100).toFixed(4)) : 0;
}

function computeMACDFull(closes: number[]): { macdLine: number; signalLine: number; histogram: number } {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12 - ema26;

  // Compute signal line (EMA9 of MACD line series)
  // Approximate: compute MACD series then EMA9
  const macdSeries: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    const e12 = computeEMA(closes.slice(0, i + 1), 12);
    const e26 = computeEMA(closes.slice(0, i + 1), 26);
    macdSeries.push(e12 - e26);
  }
  const signalLine = macdSeries.length >= 9 ? computeEMA(macdSeries, 9) : macdLine;
  const histogram = macdLine - signalLine;

  // Normalize by price
  const price = closes[closes.length - 1] || 1;
  return {
    macdLine: parseFloat(((macdLine / price) * 100).toFixed(4)),
    signalLine: parseFloat(((signalLine / price) * 100).toFixed(4)),
    histogram: parseFloat(((histogram / price) * 100).toFixed(4)),
  };
}

function computeADX(highs: number[], lows: number[], closes: number[], period: number): number {
  if (highs.length < period + 1) return 25;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }

  // Smoothed averages
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);

  const dx: number[] = [];
  for (let i = period; i < plusDM.length; i++) {
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    smoothTR = smoothTR - smoothTR / period + tr[i];

    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    dx.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
  }

  if (dx.length < period) return dx.length > 0 ? dx[dx.length - 1] : 25;

  // ADX = EMA of DX
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }
  return parseFloat(adx.toFixed(2));
}

function computeATR(highs: number[], lows: number[], closes: number[], period: number): number {
  if (highs.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function computeATRSeries(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const atrSeries: number[] = [];
  for (let i = period - 1; i < trs.length; i++) {
    const slice = trs.slice(i - period + 1, i + 1);
    atrSeries.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return atrSeries;
}

function computeStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number): { k: number; d: number } {
  if (closes.length < kPeriod) return { k: 50, d: 50 };

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const periodHighs = highs.slice(i - kPeriod + 1, i + 1);
    const periodLows = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...periodHighs);
    const lowest = Math.min(...periodLows);
    const range = highest - lowest;
    kValues.push(range > 0 ? ((closes[i] - lowest) / range) * 100 : 50);
  }

  const k = kValues[kValues.length - 1];
  const dSlice = kValues.slice(-dPeriod);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;

  return { k: parseFloat(k.toFixed(2)), d: parseFloat(d.toFixed(2)) };
}

function computeOBVSlope(closes: number[], volumes: number[], period: number): number {
  if (closes.length < period + 1) return 0;

  // Compute OBV series
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }

  // Linear regression slope of last `period` OBV values, normalized
  const recentOBV = obv.slice(-period);
  const n = recentOBV.length;
  const xMean = (n - 1) / 2;
  const yMean = recentOBV.reduce((a, b) => a + b, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recentOBV[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;

  // Normalize by average volume
  const avgVol = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
  return avgVol > 0 ? parseFloat((slope / avgVol).toFixed(4)) : 0;
}

function computeMFI(highs: number[], lows: number[], closes: number[], volumes: number[], period: number): number {
  if (closes.length < period + 1) return 50;

  const typicalPrices = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  let posFlow = 0, negFlow = 0;

  const start = Math.max(1, typicalPrices.length - period);
  for (let i = start; i < typicalPrices.length; i++) {
    const rawMF = typicalPrices[i] * volumes[i];
    if (typicalPrices[i] > typicalPrices[i - 1]) posFlow += rawMF;
    else if (typicalPrices[i] < typicalPrices[i - 1]) negFlow += rawMF;
  }

  if (negFlow === 0) return 100;
  const mfRatio = posFlow / negFlow;
  return parseFloat((100 - 100 / (1 + mfRatio)).toFixed(2));
}

function computeVolumeRatio(volumes: number[], period: number): number {
  if (volumes.length < period + 1) return 1;
  const avgVol = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  const currentVol = volumes[volumes.length - 1];
  return avgVol > 0 ? parseFloat((currentVol / avgVol).toFixed(3)) : 1;
}

function computeCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;

  const aSlice = a.slice(-n);
  const bSlice = b.slice(-n);

  // Convert to returns
  const aReturns: number[] = [];
  const bReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    aReturns.push(aSlice[i - 1] !== 0 ? (aSlice[i] - aSlice[i - 1]) / aSlice[i - 1] : 0);
    bReturns.push(bSlice[i - 1] !== 0 ? (bSlice[i] - bSlice[i - 1]) / bSlice[i - 1] : 0);
  }

  const aMean = aReturns.reduce((s, v) => s + v, 0) / aReturns.length;
  const bMean = bReturns.reduce((s, v) => s + v, 0) / bReturns.length;

  let cov = 0, aVar = 0, bVar = 0;
  for (let i = 0; i < aReturns.length; i++) {
    const da = aReturns[i] - aMean;
    const db = bReturns[i] - bMean;
    cov += da * db;
    aVar += da * da;
    bVar += db * db;
  }

  const denom = Math.sqrt(aVar * bVar);
  return denom > 0 ? parseFloat((cov / denom).toFixed(4)) : 0;
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

function toOkxInterval(interval: string): string {
  const map: Record<string, string> = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
    "1d": "1D", "1w": "1W",
  };
  return map[interval] ?? "1H";
}

function toBybitInterval(interval: string): string {
  const map: Record<string, string> = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
    "1d": "D", "1w": "W",
  };
  return map[interval] ?? "60";
}

function toOkxInstId(symbol: string): string {
  const base = symbol.replace(/USDT$/, "").replace(/USDC$/, "");
  return `${base}-USDT-SWAP`;
}

async function fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
  // Primary: OKX
  try {
    const okxInterval = toOkxInterval(interval);
    const instId = toOkxInstId(symbol);
    const r = await axios.get(
      `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${okxInterval}&limit=${limit}`,
      { timeout: TIMEOUT, headers: HTTP_HEADERS }
    );
    const data: string[][] = (r.data?.data ?? []).reverse();
    if (data.length > 10) {
      return data.map(c => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
    }
  } catch { /* fallback */ }

  // Fallback: Bybit
  try {
    const bybitInterval = toBybitInterval(interval);
    const r = await axios.get(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`,
      { timeout: TIMEOUT, headers: HTTP_HEADERS }
    );
    const list: string[][] = (r.data?.result?.list ?? []).reverse();
    if (list.length > 10) {
      return list.map(c => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
    }
  } catch { /* fallback */ }

  // Return empty with safe defaults if both fail
  return Array.from({ length: Math.max(30, limit) }, (_, i) => ({
    timestamp: Date.now() - (limit - i) * 60000,
    open: 0, high: 0, low: 0, close: 0, volume: 0,
  }));
}
