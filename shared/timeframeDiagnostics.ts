export interface TimeframeDiagnostics {
  candles: number;
  returns: number;
  medianAbsoluteMoveBps: number;
  p90AbsoluteMoveBps: number;
  moveAbove10BpsPct: number;
  moveAbove20BpsPct: number;
  directionFlipPct: number;
  lagOneReturnCorrelation: number | null;
}

function percentile(sorted: number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function correlation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : null;
}

export function summarizeTimeframeCloses(closes: number[]): TimeframeDiagnostics {
  const valid = closes.filter((value) => Number.isFinite(value) && value > 0);
  const returns: number[] = [];
  for (let index = 1; index < valid.length; index += 1) {
    returns.push(((valid[index] / valid[index - 1]) - 1) * 10_000);
  }
  const absolute = returns.map(Math.abs).sort((a, b) => a - b);
  let flips = 0;
  let comparableDirections = 0;
  for (let index = 1; index < returns.length; index += 1) {
    const previousDirection = Math.sign(returns[index - 1]);
    const currentDirection = Math.sign(returns[index]);
    if (previousDirection === 0 || currentDirection === 0) continue;
    comparableDirections += 1;
    if (previousDirection !== currentDirection) flips += 1;
  }

  return {
    candles: valid.length,
    returns: returns.length,
    medianAbsoluteMoveBps: Number(percentile(absolute, 0.5).toFixed(4)),
    p90AbsoluteMoveBps: Number(percentile(absolute, 0.9).toFixed(4)),
    moveAbove10BpsPct: returns.length > 0 ? Number(((absolute.filter((value) => value >= 10).length / returns.length) * 100).toFixed(2)) : 0,
    moveAbove20BpsPct: returns.length > 0 ? Number(((absolute.filter((value) => value >= 20).length / returns.length) * 100).toFixed(2)) : 0,
    directionFlipPct: comparableDirections > 0 ? Number(((flips / comparableDirections) * 100).toFixed(2)) : 0,
    lagOneReturnCorrelation: returns.length > 2
      ? Number((correlation(returns.slice(0, -1), returns.slice(1)) ?? 0).toFixed(4))
      : null,
  };
}
