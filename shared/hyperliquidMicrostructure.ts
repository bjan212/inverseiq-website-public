export type DirectionalFlowBias = "buy" | "sell" | "neutral";

export type ContinuousDirectionalStrength = {
  direction: DirectionalFlowBias;
  strength: number;
};

type CandleVolumeSample = {
  open: number;
  close: number;
  volume: number;
};

/**
 * Treat open interest as directional confirmation only when a fresh shared
 * Hyperliquid asset context shows a material relative move. The first sample,
 * invalid values, and small moves are intentionally neutral.
 */
export function deriveOpenInterestTrend(
  previousOpenInterest: number | null | undefined,
  currentOpenInterest: number | null | undefined,
  minimumRelativeMove = 0.002,
): "rising" | "falling" | "stable" {
  if (!Number.isFinite(previousOpenInterest) || !Number.isFinite(currentOpenInterest)
    || (previousOpenInterest ?? 0) <= 0 || (currentOpenInterest ?? 0) <= 0) {
    return "stable";
  }

  const relativeMove = ((currentOpenInterest! - previousOpenInterest!) / previousOpenInterest!);
  if (relativeMove >= minimumRelativeMove) return "rising";
  if (relativeMove <= -minimumRelativeMove) return "falling";
  return "stable";
}

/**
 * A bounded OHLCV-derived trade-flow proxy for the already fetched confirmation
 * candles. It is not exchange-native CVD and must be labelled accordingly.
 */
export function deriveCandleVolumeFlowBias(
  candles: CandleVolumeSample[],
  sampleSize = 12,
  minimumDirectionalShare = 0.2,
): DirectionalFlowBias {
  const sample = candles.slice(-sampleSize);
  if (sample.length < Math.min(6, sampleSize)) return "neutral";

  let signedVolume = 0;
  let totalVolume = 0;
  for (const candle of sample) {
    if (!Number.isFinite(candle.open) || !Number.isFinite(candle.close)
      || !Number.isFinite(candle.volume) || candle.volume <= 0) continue;
    const body = candle.close - candle.open;
    if (body === 0) continue;
    totalVolume += candle.volume;
    signedVolume += Math.sign(body) * candle.volume;
  }

  if (totalVolume <= 0 || Math.abs(signedVolume) / totalVolume < minimumDirectionalShare) {
    return "neutral";
  }
  return signedVolume > 0 ? "buy" : "sell";
}

/**
 * Returns a bounded signed-volume-flow strength from the same confirmation
 * candles already retrieved for strict Hyperliquid analysis. It remains a
 * labelled OHLCV proxy rather than exchange-native trade CVD.
 */
export function deriveCandleVolumeFlowStrength(
  candles: CandleVolumeSample[],
  sampleSize = 12,
  minimumDirectionalShare = 0.2,
): ContinuousDirectionalStrength {
  const sample = candles.slice(-sampleSize);
  if (sample.length < Math.min(6, sampleSize)) return { direction: "neutral", strength: 0 };

  let signedVolume = 0;
  let totalVolume = 0;
  for (const candle of sample) {
    if (!Number.isFinite(candle.open) || !Number.isFinite(candle.close)
      || !Number.isFinite(candle.volume) || candle.volume <= 0) continue;
    const body = candle.close - candle.open;
    if (body === 0) continue;
    totalVolume += candle.volume;
    signedVolume += Math.sign(body) * candle.volume;
  }

  if (totalVolume <= 0) return { direction: "neutral", strength: 0 };
  const signedShare = signedVolume / totalVolume;
  const absoluteShare = Math.abs(signedShare);
  if (absoluteShare < minimumDirectionalShare) return { direction: "neutral", strength: 0 };

  return {
    direction: signedShare > 0 ? "buy" : "sell",
    strength: Math.min(1, (absoluteShare - minimumDirectionalShare) / (1 - minimumDirectionalShare)),
  };
}

/**
 * Preserve the existing discrete label for UI compatibility while deriving it
 * from the continuous strength calculation used by strict execution scans.
 */
export function deriveCandleVolumeFlowBiasFromStrength(
  candles: CandleVolumeSample[],
  sampleSize = 12,
  minimumDirectionalShare = 0.2,
): DirectionalFlowBias {
  return deriveCandleVolumeFlowStrength(candles, sampleSize, minimumDirectionalShare).direction;
}
