export const SIGNAL_CALIBRATION_MODEL_VERSION = "evidence-confluence-v5-hl-microstructure-continuous" as const;
export const SIGNAL_CALIBRATION_SAMPLE_INTERVAL_MS = 15 * 60 * 1000;
export const SIGNAL_CALIBRATION_MIN_RESOLVED = 100;
export const SIGNAL_CALIBRATION_MIN_HIGH_BAND_RESOLVED = 30;

export type SignalCalibrationOutcome = "pending" | "hit_tp" | "hit_sl" | "expired" | "ambiguous";

export function filterSignalCalibrationRowsByModelVersion<T extends { modelVersion: string }>(
  rows: T[],
  modelVersion = SIGNAL_CALIBRATION_MODEL_VERSION,
): T[] {
  return rows.filter((row) => row.modelVersion === modelVersion);
}

export interface CalibrationCandle {
  openTime: number;
  high: string | number;
  low: string | number;
}

export interface CalibrationTarget {
  direction: "LONG" | "SHORT";
  takeProfit: string | number;
  stopLoss: string | number;
  expiresAt: Date | number;
}

export function buildSignalCalibrationObservationKey(observedAt: Date | number): string {
  const timestamp = observedAt instanceof Date ? observedAt.getTime() : observedAt;
  const bucket = Math.floor(timestamp / SIGNAL_CALIBRATION_SAMPLE_INTERVAL_MS) * SIGNAL_CALIBRATION_SAMPLE_INTERVAL_MS;
  return `${SIGNAL_CALIBRATION_MODEL_VERSION}:${bucket}`;
}

export function getEvidenceScoreBand(score: number): "00-69" | "70-79" | "80-87" | "88-94" | "95-100" {
  if (score < 70) return "00-69";
  if (score < 80) return "70-79";
  if (score < 88) return "80-87";
  if (score < 95) return "88-94";
  return "95-100";
}

export function evaluateCalibrationOutcome(
  target: CalibrationTarget,
  candles: CalibrationCandle[],
  now: Date | number,
): { outcome: SignalCalibrationOutcome; exitPrice?: string; outcomeAt?: Date } | null {
  const takeProfit = Number(target.takeProfit);
  const stopLoss = Number(target.stopLoss);
  if (!Number.isFinite(takeProfit) || !Number.isFinite(stopLoss)) return null;

  const expiryMs = target.expiresAt instanceof Date ? target.expiresAt.getTime() : target.expiresAt;
  for (const candle of [...candles].sort((a, b) => a.openTime - b.openTime)) {
    if (candle.openTime > expiryMs) break;
    const high = Number(candle.high);
    const low = Number(candle.low);
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    const hitTp = target.direction === "LONG" ? high >= takeProfit : low <= takeProfit;
    const hitSl = target.direction === "LONG" ? low <= stopLoss : high >= stopLoss;
    const outcomeAt = new Date(candle.openTime);
    if (hitTp && hitSl) return { outcome: "ambiguous", outcomeAt };
    if (hitTp) return { outcome: "hit_tp", exitPrice: String(takeProfit), outcomeAt };
    if (hitSl) return { outcome: "hit_sl", exitPrice: String(stopLoss), outcomeAt };
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs >= expiryMs ? { outcome: "expired", outcomeAt: new Date(expiryMs) } : null;
}

export interface CalibrationBandSummary {
  band: ReturnType<typeof getEvidenceScoreBand>;
  observations: number;
  pending: number;
  resolved: number;
  wins: number;
  losses: number;
  expired: number;
  ambiguous: number;
  empiricalWinRate: number | null;
}

export interface CalibrationSummary {
  observations: number;
  resolved: number;
  meanEvidenceScore: number | null;
  sampleSufficientForAdjustment: boolean;
  bands: CalibrationBandSummary[];
}

export function summarizeSignalCalibration(
  rows: Array<{ evidenceScore: number; outcome: SignalCalibrationOutcome }>,
): CalibrationSummary {
  const bandOrder: CalibrationBandSummary["band"][] = ["00-69", "70-79", "80-87", "88-94", "95-100"];
  const bands = bandOrder.map((band) => {
    const values = rows.filter((row) => getEvidenceScoreBand(row.evidenceScore) === band);
    const wins = values.filter((row) => row.outcome === "hit_tp").length;
    const losses = values.filter((row) => row.outcome === "hit_sl").length;
    const resolved = wins + losses;
    return {
      band,
      observations: values.length,
      pending: values.filter((row) => row.outcome === "pending").length,
      resolved,
      wins,
      losses,
      expired: values.filter((row) => row.outcome === "expired").length,
      ambiguous: values.filter((row) => row.outcome === "ambiguous").length,
      empiricalWinRate: resolved > 0 ? Number(((wins / resolved) * 100).toFixed(2)) : null,
    };
  });
  const resolved = bands.reduce((sum, band) => sum + band.resolved, 0);
  const highBandResolved = bands
    .filter((band) => band.band === "88-94" || band.band === "95-100")
    .reduce((sum, band) => sum + band.resolved, 0);
  return {
    observations: rows.length,
    resolved,
    meanEvidenceScore: rows.length > 0
      ? Number((rows.reduce((sum, row) => sum + row.evidenceScore, 0) / rows.length).toFixed(2))
      : null,
    sampleSufficientForAdjustment: resolved >= SIGNAL_CALIBRATION_MIN_RESOLVED
      && highBandResolved >= SIGNAL_CALIBRATION_MIN_HIGH_BAND_RESOLVED,
    bands,
  };
}
