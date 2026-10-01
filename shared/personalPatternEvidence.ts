/**
 * Conservative empirical-Bayes shrinkage for private user trade history.
 * Personal outcomes describe execution behaviour; they are not treated as a
 * standalone market predictor and therefore cannot increase entry confidence.
 */
export function derivePersonalPatternEvidence(wins: number, losses: number) {
  const safeWins = Math.max(0, Math.trunc(wins));
  const safeLosses = Math.max(0, Math.trunc(losses));
  const sampleSize = safeWins + safeLosses;
  const priorStrength = 10;
  const posteriorWinRate = (safeWins + priorStrength / 2) / (sampleSize + priorStrength);
  const evidenceWeight = Math.min(1, sampleSize / 30);
  const rawAdjustment = Math.round((posteriorWinRate - 0.5) * 12 * evidenceWeight);
  const descriptiveAdjustment = Math.max(-6, Math.min(6, rawAdjustment));
  const signalAdjustment = Math.min(0, descriptiveAdjustment);
  const action = signalAdjustment <= -2 ? "SUPPRESS" as const : "NEUTRAL" as const;

  return {
    sampleSize,
    posteriorWinRate,
    evidenceWeight,
    descriptiveAdjustment,
    signalAdjustment,
    action,
  };
}

export function deriveFailureEvidence(losses: number, total: number) {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safeLosses = Math.max(0, Math.min(safeTotal, Math.trunc(losses)));
  const priorStrength = 10;
  const posteriorFailureRate = (safeLosses + priorStrength / 2) / (safeTotal + priorStrength);
  const evidenceWeight = Math.min(1, safeTotal / 30);
  const eligible = safeTotal >= 10 && posteriorFailureRate >= 0.65;
  return { sampleSize: safeTotal, posteriorFailureRate, evidenceWeight, eligible };
}

/** Personal behavioural evidence can suppress but never create a high-confidence entry. */
export function applyPrivatePatternAdjustment(baseConfidence: number, proposedAdjustment: number): number {
  const safeBase = Math.max(0, Math.min(100, Math.round(baseConfidence)));
  const suppression = Math.min(0, Math.max(-6, Math.round(proposedAdjustment)));
  return Math.max(0, safeBase + suppression);
}
