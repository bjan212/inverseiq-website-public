export type MicrostructureEvidenceResult = {
  direction: "LONG" | "SHORT" | null;
  score: number;
  directionalPoints: number;
  evidenceCapacity: number;
};

/**
 * Normalize directional microstructure points against the full evidence budget.
 * Hyperliquid-native scans use funding, L2-book imbalance, cached open-interest
 * change, and an explicitly labelled candle-flow proxy (maximum six directional
 * points). Broad display scans can additionally use long/short ratio, OI, and
 * native CVD (maximum nine directional points).
 */
export function scoreMicrostructureEvidence(
  bullPoints: number,
  bearPoints: number,
  strictHyperliquid: boolean,
): MicrostructureEvidenceResult {
  const bull = Math.max(0, Number.isFinite(bullPoints) ? bullPoints : 0);
  const bear = Math.max(0, Number.isFinite(bearPoints) ? bearPoints : 0);
  const evidenceCapacity = strictHyperliquid ? 6 : 9;
  const directionalPoints = Math.max(bull, bear);
  const opposingPoints = Math.min(bull, bear);
  const direction = bull === bear ? null : bull > bear ? "LONG" : "SHORT";
  // Broad display scans retain their established normalization. Strict
  // Hyperliquid execution scans discount conflicting inputs so a mixed book,
  // funding, OI, and candle-flow picture cannot masquerade as conviction.
  const normalizedPoints = strictHyperliquid
    ? Math.max(0, directionalPoints - opposingPoints)
    : directionalPoints;

  return {
    direction,
    score: Math.max(0, Math.min(100, Math.round((normalizedPoints / evidenceCapacity) * 100))),
    directionalPoints,
    evidenceCapacity,
  };
}
