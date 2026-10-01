/**
 * accuracyEngine.ts
 *
 * Advanced signal accuracy layer for the InverseIQ signal engine.
 * Implements ICT/Smart Money + quantitative techniques that dramatically
 * reduce false signals and improve entry quality:
 *
 * 1. Market Structure (BOS/CHoCH) — HH/HL/LH/LL detection
 * 2. Liquidity Sweep Detection — stop hunt + reversal confirmation
 * 3. Fair Value Gap (FVG) — price imbalance zones
 * 4. RSI Divergence — bullish/bearish divergence vs price
 * 5. CVD Divergence — volume delta vs price divergence
 * 6. ADX Trend Regime Filter — avoid choppy/ranging markets
 * 7. VWAP Deviation — mean reversion + continuation signals
 * 8. Candle Pattern Recognition — engulfing, pin bar, inside bar, doji
 * 9. Fibonacci Retracement Zones — 0.382, 0.5, 0.618 confluence
 * 10. Entry Quality Score — composite entry timing grade (0-100)
 */

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── 1. Market Structure (BOS / CHoCH) ────────────────────────────────────────

export type MarketStructure = {
  trend: "uptrend" | "downtrend" | "ranging";
  lastBOS: "bullish" | "bearish" | null;   // Break of Structure
  lastCHoCH: "bullish" | "bearish" | null; // Change of Character
  swingHighs: number[];
  swingLows: number[];
  structureScore: number; // 0-100, how clean the structure is
};

function findSwingPoints(candles: Candle[], lookback = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const slice = candles.slice(i - lookback, i + lookback + 1);
    const maxHigh = Math.max(...slice.map(c => c.high));
    const minLow = Math.min(...slice.map(c => c.low));
    if (candles[i].high === maxHigh) highs.push(candles[i].high);
    if (candles[i].low === minLow) lows.push(candles[i].low);
  }
  return { highs, lows };
}

export function detectMarketStructure(candles: Candle[]): MarketStructure {
  if (candles.length < 30) {
    return { trend: "ranging", lastBOS: null, lastCHoCH: null, swingHighs: [], swingLows: [], structureScore: 30 };
  }

  const { highs, lows } = findSwingPoints(candles.slice(-60), 3);

  if (highs.length < 3 || lows.length < 3) {
    return { trend: "ranging", lastBOS: null, lastCHoCH: null, swingHighs: highs, swingLows: lows, structureScore: 30 };
  }

  // Check last 3 swing highs and lows for HH/HL or LH/LL
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);

  const hhPattern = recentHighs[2] > recentHighs[1] && recentHighs[1] > recentHighs[0];
  const hlPattern = recentLows[2] > recentLows[1] && recentLows[1] > recentLows[0];
  const lhPattern = recentHighs[2] < recentHighs[1] && recentHighs[1] < recentHighs[0];
  const llPattern = recentLows[2] < recentLows[1] && recentLows[1] < recentLows[0];

  let trend: "uptrend" | "downtrend" | "ranging" = "ranging";
  let lastBOS: "bullish" | "bearish" | null = null;
  let lastCHoCH: "bullish" | "bearish" | null = null;
  let structureScore = 40;

  if (hhPattern && hlPattern) {
    trend = "uptrend";
    lastBOS = "bullish";
    structureScore = 80 + (hhPattern && hlPattern ? 15 : 0);
  } else if (lhPattern && llPattern) {
    trend = "downtrend";
    lastBOS = "bearish";
    structureScore = 80 + (lhPattern && llPattern ? 15 : 0);
  } else if (hhPattern && !hlPattern) {
    // Highs rising but lows not — possible CHoCH
    trend = "uptrend";
    lastCHoCH = "bullish";
    structureScore = 60;
  } else if (llPattern && !lhPattern) {
    trend = "downtrend";
    lastCHoCH = "bearish";
    structureScore = 60;
  }

  return {
    trend,
    lastBOS,
    lastCHoCH,
    swingHighs: recentHighs,
    swingLows: recentLows,
    structureScore: Math.min(100, structureScore),
  };
}

// ─── 2. Liquidity Sweep Detection ─────────────────────────────────────────────

export type LiquiditySweep = {
  detected: boolean;
  direction: "bullish_sweep" | "bearish_sweep" | null; // bullish_sweep = swept lows then reversed up
  sweptLevel: number;
  reversalStrength: number; // 0-100
};

export function detectLiquiditySweep(candles: Candle[]): LiquiditySweep {
  if (candles.length < 20) return { detected: false, direction: null, sweptLevel: 0, reversalStrength: 0 };

  const recent = candles.slice(-5);
  const lookback = candles.slice(-30, -5);

  const prevLow = Math.min(...lookback.map(c => c.low));
  const prevHigh = Math.max(...lookback.map(c => c.high));

  // Check last 3 candles for a sweep
  for (let i = recent.length - 3; i < recent.length - 1; i++) {
    const c = recent[i];
    const next = recent[i + 1];

    // Bullish sweep: wick below prior low, close back above it
    if (c.low < prevLow && c.close > prevLow) {
      const wickSize = prevLow - c.low;
      const bodySize = Math.abs(c.close - c.open);
      const reversalStrength = Math.min(100, Math.round((wickSize / (bodySize || 0.0001)) * 30 + (next.close > c.close ? 20 : 0)));
      return {
        detected: true,
        direction: "bullish_sweep",
        sweptLevel: prevLow,
        reversalStrength,
      };
    }

    // Bearish sweep: wick above prior high, close back below it
    if (c.high > prevHigh && c.close < prevHigh) {
      const wickSize = c.high - prevHigh;
      const bodySize = Math.abs(c.close - c.open);
      const reversalStrength = Math.min(100, Math.round((wickSize / (bodySize || 0.0001)) * 30 + (next.close < c.close ? 20 : 0)));
      return {
        detected: true,
        direction: "bearish_sweep",
        sweptLevel: prevHigh,
        reversalStrength,
      };
    }
  }

  return { detected: false, direction: null, sweptLevel: 0, reversalStrength: 0 };
}

// ─── 3. Fair Value Gap (FVG) Detection ────────────────────────────────────────

export type FairValueGap = {
  detected: boolean;
  direction: "bullish" | "bearish" | null; // bullish FVG = price likely to return up
  gapHigh: number;
  gapLow: number;
  priceInGap: boolean; // current price is inside the FVG = high-probability entry
  gapSize: number;     // as % of price
};

export function detectFairValueGap(candles: Candle[]): FairValueGap {
  const empty = { detected: false, direction: null as null, gapHigh: 0, gapLow: 0, priceInGap: false, gapSize: 0 };
  if (candles.length < 10) return empty;

  const currentPrice = candles[candles.length - 1].close;

  // Check last 15 candles for FVGs
  for (let i = candles.length - 15; i < candles.length - 2; i++) {
    const prev = candles[i];
    const curr = candles[i + 1];
    const next = candles[i + 2];

    // Bullish FVG: prev.high < next.low (gap between candle 1 high and candle 3 low)
    if (prev.high < next.low && curr.close > curr.open) {
      const gapLow = prev.high;
      const gapHigh = next.low;
      const gapSize = ((gapHigh - gapLow) / currentPrice) * 100;
      if (gapSize > 0.05) { // Only meaningful gaps
        return {
          detected: true,
          direction: "bullish",
          gapHigh,
          gapLow,
          priceInGap: currentPrice >= gapLow && currentPrice <= gapHigh,
          gapSize,
        };
      }
    }

    // Bearish FVG: prev.low > next.high
    if (prev.low > next.high && curr.close < curr.open) {
      const gapHigh = prev.low;
      const gapLow = next.high;
      const gapSize = ((gapHigh - gapLow) / currentPrice) * 100;
      if (gapSize > 0.05) {
        return {
          detected: true,
          direction: "bearish",
          gapHigh,
          gapLow,
          priceInGap: currentPrice >= gapLow && currentPrice <= gapHigh,
          gapSize,
        };
      }
    }
  }

  return empty;
}

// ─── 4. RSI Divergence ────────────────────────────────────────────────────────

export type RSIDivergence = {
  detected: boolean;
  type: "bullish" | "bearish" | null;
  strength: number; // 0-100
};

function calcRSIArray(closes: number[], period = 14): number[] {
  const rsiArr: number[] = [];
  if (closes.length < period + 2) return rsiArr;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = changes.slice(0, period).filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  let avgLoss = changes.slice(0, period).filter(c => c < 0).map(c => -c).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
    rsiArr.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
  }
  return rsiArr;
}

export function detectRSIDivergence(candles: Candle[]): RSIDivergence {
  const empty = { detected: false, type: null as null, strength: 0 };
  if (candles.length < 40) return empty;

  const closes = candles.map(c => c.close);
  const rsiArr = calcRSIArray(closes, 14);

  if (rsiArr.length < 20) return empty;

  // Look at last 20 candles for divergence
  const lookback = 20;
  const priceSlice = closes.slice(-lookback);
  const rsiSlice = rsiArr.slice(-lookback);

  // Find local price lows and RSI lows
  const priceLow1Idx = priceSlice.slice(0, 10).indexOf(Math.min(...priceSlice.slice(0, 10)));
  const priceLow2Idx = 10 + priceSlice.slice(10).indexOf(Math.min(...priceSlice.slice(10)));

  const priceHigh1Idx = priceSlice.slice(0, 10).indexOf(Math.max(...priceSlice.slice(0, 10)));
  const priceHigh2Idx = 10 + priceSlice.slice(10).indexOf(Math.max(...priceSlice.slice(10)));

  // Bullish divergence: price makes lower low, RSI makes higher low
  const priceLow1 = priceSlice[priceLow1Idx];
  const priceLow2 = priceSlice[priceLow2Idx];
  const rsiLow1 = rsiSlice[priceLow1Idx];
  const rsiLow2 = rsiSlice[priceLow2Idx];

  if (priceLow2 < priceLow1 && rsiLow2 > rsiLow1 && rsiLow1 < 50) {
    const priceDiff = (priceLow1 - priceLow2) / priceLow1 * 100;
    const rsiDiff = rsiLow2 - rsiLow1;
    const strength = Math.min(100, Math.round(priceDiff * 10 + rsiDiff * 2));
    return { detected: true, type: "bullish", strength };
  }

  // Bearish divergence: price makes higher high, RSI makes lower high
  const priceHigh1 = priceSlice[priceHigh1Idx];
  const priceHigh2 = priceSlice[priceHigh2Idx];
  const rsiHigh1 = rsiSlice[priceHigh1Idx];
  const rsiHigh2 = rsiSlice[priceHigh2Idx];

  if (priceHigh2 > priceHigh1 && rsiHigh2 < rsiHigh1 && rsiHigh1 > 50) {
    const priceDiff = (priceHigh2 - priceHigh1) / priceHigh1 * 100;
    const rsiDiff = rsiHigh1 - rsiHigh2;
    const strength = Math.min(100, Math.round(priceDiff * 10 + rsiDiff * 2));
    return { detected: true, type: "bearish", strength };
  }

  return empty;
}

// ─── 5. ADX Trend Regime Filter ───────────────────────────────────────────────

export type TrendRegime = {
  adx: number;
  isTrending: boolean;  // ADX > 20
  isStrongTrend: boolean; // ADX > 30
  regime: "trending" | "ranging" | "weak";
};

export function calcADX(candles: Candle[], period = 14): TrendRegime {
  if (candles.length < period * 2 + 1) {
    return { adx: 20, isTrending: false, isStrongTrend: false, regime: "weak" };
  }

  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smooth with Wilder's method
  let smoothTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const diPlus: number[] = [];
  const diMinus: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trueRanges[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    diPlus.push((smoothPlusDM / smoothTR) * 100);
    diMinus.push((smoothMinusDM / smoothTR) * 100);
  }

  const dx: number[] = diPlus.map((p, i) => {
    const sum = p + diMinus[i];
    return sum === 0 ? 0 : (Math.abs(p - diMinus[i]) / sum) * 100;
  });

  let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
  }

  return {
    adx: Math.round(adxVal),
    isTrending: adxVal > 20,
    isStrongTrend: adxVal > 30,
    regime: adxVal > 30 ? "trending" : adxVal > 20 ? "weak" : "ranging",
  };
}

// ─── 6. VWAP Deviation ────────────────────────────────────────────────────────

export type VWAPAnalysis = {
  vwap: number;
  stdDev1Upper: number;
  stdDev1Lower: number;
  stdDev2Upper: number;
  stdDev2Lower: number;
  priceVsVwap: "above" | "below" | "at";
  deviation: number;     // how many std devs from VWAP (positive = above)
  signal: "mean_reversion_long" | "mean_reversion_short" | "momentum_long" | "momentum_short" | "neutral";
};

export function calcVWAP(candles: Candle[]): VWAPAnalysis {
  const neutral: VWAPAnalysis = {
    vwap: candles[candles.length - 1]?.close ?? 0,
    stdDev1Upper: 0, stdDev1Lower: 0, stdDev2Upper: 0, stdDev2Lower: 0,
    priceVsVwap: "at", deviation: 0, signal: "neutral",
  };
  if (candles.length < 10) return neutral;

  // Use last 100 candles for VWAP
  const slice = candles.slice(-100);
  let cumTPV = 0, cumVol = 0;
  const typicalPrices: number[] = [];

  for (const c of slice) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
    typicalPrices.push(tp);
  }

  const vwap = cumVol > 0 ? cumTPV / cumVol : slice[slice.length - 1].close;

  // Standard deviation of typical prices
  const variance = typicalPrices.reduce((sum, tp) => sum + Math.pow(tp - vwap, 2), 0) / typicalPrices.length;
  const stdDev = Math.sqrt(variance);

  const currentPrice = slice[slice.length - 1].close;
  const deviation = stdDev > 0 ? (currentPrice - vwap) / stdDev : 0;

  let signal: VWAPAnalysis["signal"] = "neutral";
  if (deviation < -2) signal = "mean_reversion_long";       // Extreme oversold vs VWAP
  else if (deviation > 2) signal = "mean_reversion_short";  // Extreme overbought vs VWAP
  else if (deviation > 0.5 && deviation < 1.5) signal = "momentum_long";  // Healthy above VWAP
  else if (deviation < -0.5 && deviation > -1.5) signal = "momentum_short"; // Healthy below VWAP

  return {
    vwap,
    stdDev1Upper: vwap + stdDev,
    stdDev1Lower: vwap - stdDev,
    stdDev2Upper: vwap + 2 * stdDev,
    stdDev2Lower: vwap - 2 * stdDev,
    priceVsVwap: currentPrice > vwap * 1.001 ? "above" : currentPrice < vwap * 0.999 ? "below" : "at",
    deviation: Math.round(deviation * 100) / 100,
    signal,
  };
}

// ─── 7. Candle Pattern Recognition ────────────────────────────────────────────

export type CandlePattern = {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number; // 0-100
};

export function detectCandlePattern(candles: Candle[]): CandlePattern {
  const none: CandlePattern = { name: "No Pattern", direction: "neutral", strength: 0 };
  if (candles.length < 3) return none;

  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c = candles[candles.length - 1]; // current candle

  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  const avgBody = [c1, c2].reduce((s, x) => s + Math.abs(x.close - x.open), 0) / 2;
  const avgVol = [c1, c2].reduce((s, x) => s + x.volume, 0) / 2;

  // Bullish Engulfing
  if (c2.close < c2.open && c.close > c.open &&
      c.open < c2.close && c.close > c2.open &&
      body > avgBody * 1.2) {
    return { name: "Bullish Engulfing", direction: "bullish", strength: 80 + (c.volume > avgVol ? 15 : 0) };
  }

  // Bearish Engulfing
  if (c2.close > c2.open && c.close < c.open &&
      c.open > c2.close && c.close < c2.open &&
      body > avgBody * 1.2) {
    return { name: "Bearish Engulfing", direction: "bearish", strength: 80 + (c.volume > avgVol ? 15 : 0) };
  }

  // Bullish Pin Bar (hammer)
  if (lowerWick > body * 2.5 && upperWick < body * 0.5 && range > 0) {
    return { name: "Bullish Pin Bar", direction: "bullish", strength: 70 + Math.min(25, Math.round(lowerWick / body * 5)) };
  }

  // Bearish Pin Bar (shooting star)
  if (upperWick > body * 2.5 && lowerWick < body * 0.5 && range > 0) {
    return { name: "Bearish Pin Bar", direction: "bearish", strength: 70 + Math.min(25, Math.round(upperWick / body * 5)) };
  }

  // Inside Bar (consolidation before breakout)
  if (c.high < c2.high && c.low > c2.low) {
    const dir = c2.close > c2.open ? "bullish" : "bearish";
    return { name: "Inside Bar", direction: dir, strength: 55 };
  }

  // Doji (indecision — only meaningful at extremes)
  if (body < range * 0.1 && range > 0) {
    return { name: "Doji", direction: "neutral", strength: 40 };
  }

  // Three White Soldiers (3 consecutive bullish candles)
  if (c1.close > c1.open && c2.close > c2.open && c.close > c.open &&
      c2.close > c1.close && c.close > c2.close) {
    return { name: "Three White Soldiers", direction: "bullish", strength: 85 };
  }

  // Three Black Crows
  if (c1.close < c1.open && c2.close < c2.open && c.close < c.open &&
      c2.close < c1.close && c.close < c2.close) {
    return { name: "Three Black Crows", direction: "bearish", strength: 85 };
  }

  return none;
}

// ─── 8. Fibonacci Retracement Zones ───────────────────────────────────────────

export type FibonacciZone = {
  nearFib: boolean;
  level: number;       // e.g. 0.618
  fibPrice: number;    // actual price at that fib level
  direction: "support" | "resistance" | null;
  proximityPct: number; // how close price is to the fib level (%)
};

export function detectFibonacciZone(candles: Candle[]): FibonacciZone {
  const empty: FibonacciZone = { nearFib: false, level: 0, fibPrice: 0, direction: null, proximityPct: 100 };
  if (candles.length < 30) return empty;

  const slice = candles.slice(-50);
  const swingHigh = Math.max(...slice.map(c => c.high));
  const swingLow = Math.min(...slice.map(c => c.low));
  const range = swingHigh - swingLow;
  if (range === 0) return empty;

  const currentPrice = candles[candles.length - 1].close;
  const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];

  let closestFib = { level: 0, fibPrice: 0, proximity: 100 };

  for (const fib of fibLevels) {
    // Retracement from high (potential support in uptrend)
    const retracementPrice = swingHigh - range * fib;
    const proximityPct = Math.abs(currentPrice - retracementPrice) / currentPrice * 100;
    if (proximityPct < closestFib.proximity) {
      closestFib = { level: fib, fibPrice: retracementPrice, proximity: proximityPct };
    }
  }

  const isNear = closestFib.proximity < 1.5; // within 1.5% of a fib level
  return {
    nearFib: isNear,
    level: closestFib.level,
    fibPrice: closestFib.fibPrice,
    direction: isNear ? (currentPrice > swingHigh - range * 0.5 ? "resistance" : "support") : null,
    proximityPct: Math.round(closestFib.proximity * 100) / 100,
  };
}

// ─── 9. Entry Quality Score ────────────────────────────────────────────────────

export interface AccuracyAnalysis {
  marketStructure: MarketStructure;
  liquiditySweep: LiquiditySweep;
  fvg: FairValueGap;
  rsiDivergence: RSIDivergence;
  adx: TrendRegime;
  vwap: VWAPAnalysis;
  candlePattern: CandlePattern;
  fibonacci: FibonacciZone;
  entryQualityScore: number;    // 0-100 composite entry grade
  entryQualityLabel: "A+" | "A" | "B" | "C" | "D";
  accuracyBoost: number;        // points to add to composite score
  accuracyFactors: string[];    // human-readable reasons
  shouldFilter: boolean;        // true = low quality, skip this signal
}

export function runAccuracyAnalysis(candles: Candle[], direction: "LONG" | "SHORT"): AccuracyAnalysis {
  const marketStructure = detectMarketStructure(candles);
  const liquiditySweep = detectLiquiditySweep(candles);
  const fvg = detectFairValueGap(candles);
  const rsiDivergence = detectRSIDivergence(candles);
  const adx = calcADX(candles);
  const vwap = calcVWAP(candles);
  const candlePattern = detectCandlePattern(candles);
  const fibonacci = detectFibonacciZone(candles);

  let score = 40; // baseline
  const factors: string[] = [];

  // ── Market Structure alignment ─────────────────────────────────────────────
  if (marketStructure.trend === "uptrend" && direction === "LONG") {
    score += 15;
    factors.push(`Market Structure: Uptrend (BOS Bullish)`);
  } else if (marketStructure.trend === "downtrend" && direction === "SHORT") {
    score += 15;
    factors.push(`Market Structure: Downtrend (BOS Bearish)`);
  } else if (marketStructure.trend === "ranging") {
    score -= 10;
    factors.push("Market Structure: Ranging (lower confidence)");
  } else {
    // Counter-trend — penalize but don't eliminate (reversals exist)
    score -= 5;
    factors.push(`Market Structure: Counter-trend (${marketStructure.trend})`);
  }

  // ── Liquidity Sweep (highest-conviction entry signal) ─────────────────────
  if (liquiditySweep.detected) {
    if ((liquiditySweep.direction === "bullish_sweep" && direction === "LONG") ||
        (liquiditySweep.direction === "bearish_sweep" && direction === "SHORT")) {
      score += 20;
      factors.push(`Liquidity Sweep: ${liquiditySweep.direction?.replace("_", " ")} (strength ${liquiditySweep.reversalStrength})`);
    }
  }

  // ── Fair Value Gap ─────────────────────────────────────────────────────────
  if (fvg.detected) {
    if ((fvg.direction === "bullish" && direction === "LONG") ||
        (fvg.direction === "bearish" && direction === "SHORT")) {
      score += fvg.priceInGap ? 18 : 10;
      factors.push(`FVG: ${fvg.direction} gap ${fvg.priceInGap ? "(price IN gap — ideal entry)" : "(gap nearby)"}`);
    }
  }

  // ── RSI Divergence ─────────────────────────────────────────────────────────
  if (rsiDivergence.detected) {
    if ((rsiDivergence.type === "bullish" && direction === "LONG") ||
        (rsiDivergence.type === "bearish" && direction === "SHORT")) {
      score += Math.round(rsiDivergence.strength * 0.15);
      factors.push(`RSI Divergence: ${rsiDivergence.type} (strength ${rsiDivergence.strength})`);
    }
  }

  // ── ADX Regime ────────────────────────────────────────────────────────────
  if (adx.isStrongTrend) {
    score += 10;
    factors.push(`ADX ${adx.adx} — Strong Trend (high signal quality)`);
  } else if (adx.isTrending) {
    score += 5;
    factors.push(`ADX ${adx.adx} — Trending Market`);
  } else {
    score -= 8;
    factors.push(`ADX ${adx.adx} — Ranging/Choppy (avoid)`);
  }

  // ── VWAP Signal ───────────────────────────────────────────────────────────
  if (vwap.signal === "mean_reversion_long" && direction === "LONG") {
    score += 12;
    factors.push(`VWAP: Price ${Math.abs(vwap.deviation).toFixed(1)}σ below — Mean Reversion Long`);
  } else if (vwap.signal === "mean_reversion_short" && direction === "SHORT") {
    score += 12;
    factors.push(`VWAP: Price ${vwap.deviation.toFixed(1)}σ above — Mean Reversion Short`);
  } else if (vwap.signal === "momentum_long" && direction === "LONG") {
    score += 6;
    factors.push(`VWAP: Price above VWAP — Momentum Long`);
  } else if (vwap.signal === "momentum_short" && direction === "SHORT") {
    score += 6;
    factors.push(`VWAP: Price below VWAP — Momentum Short`);
  }

  // ── Candle Pattern ────────────────────────────────────────────────────────
  if (candlePattern.direction !== "neutral" && candlePattern.strength > 50) {
    if ((candlePattern.direction === "bullish" && direction === "LONG") ||
        (candlePattern.direction === "bearish" && direction === "SHORT")) {
      score += Math.round(candlePattern.strength * 0.1);
      factors.push(`Candle Pattern: ${candlePattern.name} (strength ${candlePattern.strength})`);
    }
  }

  // ── Fibonacci Zone ────────────────────────────────────────────────────────
  if (fibonacci.nearFib) {
    if ((fibonacci.direction === "support" && direction === "LONG") ||
        (fibonacci.direction === "resistance" && direction === "SHORT")) {
      score += 8;
      factors.push(`Fibonacci: ${(fibonacci.level * 100).toFixed(1)}% level (${fibonacci.proximityPct.toFixed(1)}% away)`);
    }
  }

  const finalScore = Math.max(0, Math.min(100, score));

  const label: AccuracyAnalysis["entryQualityLabel"] =
    finalScore >= 85 ? "A+" :
    finalScore >= 70 ? "A" :
    finalScore >= 55 ? "B" :
    finalScore >= 40 ? "C" : "D";

  // Accuracy boost to composite score: A+ = +15, A = +10, B = +5, C = 0, D = -5
  const boostMap: Record<string, number> = { "A+": 15, "A": 10, "B": 5, "C": 0, "D": -5 };
  const accuracyBoost = boostMap[label] ?? 0;

  // Filter out D-grade signals unless it's the only option (handled in runSignalScan)
  const shouldFilter = label === "D" && !liquiditySweep.detected && !rsiDivergence.detected;

  return {
    marketStructure,
    liquiditySweep,
    fvg,
    rsiDivergence,
    adx,
    vwap,
    candlePattern,
    fibonacci,
    entryQualityScore: finalScore,
    entryQualityLabel: label,
    accuracyBoost,
    accuracyFactors: factors,
    shouldFilter,
  };
}
