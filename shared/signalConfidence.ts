export const EXECUTABLE_CONFIDENCE_FLOOR = 88;
export const PARTIAL_CONFLUENCE_CEILING = 87;

export type EvidenceConfidenceInput = {
  compositeScore: number;
  technicalScore: number;
  microstructureScore: number;
  volatilityScore: number;
  entryQualityScore: number;
  entryQualityLabel: string;
  directionsAgree: boolean;
  isExecutionEligible: boolean;
};

export type EvidenceConfidenceResult = {
  confidence: number;
  rawEvidenceScore: number;
  executionBandEligible: boolean;
  model: "evidence-confluence-v5-hl-microstructure-continuous";
  calibratedProbability: false;
};

function boundedScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Produces a conservative evidence score, not a promised win probability.
 *
 * Scores below the independent execution gate remain display-only and preserve
 * their weighted evidence continuously up to 87. The 88+ band is reserved for
 * strong, aligned A/A+ confluence across every measured layer. This keeps strong
 * near misses distinguishable without letting them authorize an automated trade.
 */
export function calculateEvidenceConfidence(
  input: EvidenceConfidenceInput,
): EvidenceConfidenceResult {
  const composite = boundedScore(input.compositeScore);
  const technical = boundedScore(input.technicalScore);
  const microstructure = boundedScore(input.microstructureScore);
  const volatility = boundedScore(input.volatilityScore);
  const entryQuality = boundedScore(input.entryQualityScore);

  const rawEvidenceScore = Math.round(
    composite * 0.35
      + technical * 0.25
      + microstructure * 0.20
      + entryQuality * 0.15
      + volatility * 0.05,
  );

  const hasFullExecutionConfluence = input.isExecutionEligible
    && input.directionsAgree
    && ["A", "A+"].includes(input.entryQualityLabel)
    && technical >= 80
    && microstructure >= 75
    && entryQuality >= 70
    && composite >= 78
    && volatility >= 60;

  if (!hasFullExecutionConfluence) {
    return {
      confidence: Math.min(rawEvidenceScore, PARTIAL_CONFLUENCE_CEILING),
      rawEvidenceScore,
      executionBandEligible: false,
      model: "evidence-confluence-v5-hl-microstructure-continuous",
      calibratedProbability: false,
    };
  }

  // The strict threshold produces 88; progressively stronger evidence reaches
  // 100 only when all weighted inputs approach their theoretical maximum.
  const executableConfidence = Math.round(
    EXECUTABLE_CONFIDENCE_FLOOR
      + ((Math.max(76, rawEvidenceScore) - 76) / 24) * 12,
  );

  return {
    confidence: Math.max(EXECUTABLE_CONFIDENCE_FLOOR, Math.min(100, executableConfidence)),
    rawEvidenceScore,
    executionBandEligible: true,
    model: "evidence-confluence-v5-hl-microstructure-continuous",
    calibratedProbability: false,
  };
}
