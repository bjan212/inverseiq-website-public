export interface NormalizedAiStats {
  totalPatterns: number;
  totalTraders: number;
  totalTrades: number;
  lastUpdated: string;
  averageConfidence: number;
  patternSources: {
    publicOnly: number;
    traderOnly: number;
    combined: number;
  };
  confidenceBySource: {
    publicPatterns: number;
    traderPatterns: number;
    combinedPatterns: number;
  };
  qualityDistribution: {
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  insights: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeAiStats(raw: unknown): NormalizedAiStats | null {
  const source = record(raw);
  if (!source) return null;

  const patternSources = record(source.patternSources);
  const confidenceBySource = record(source.confidenceBySource);
  const qualityDistribution = record(source.qualityDistribution);
  const insights = Array.isArray(source.insights)
    ? source.insights.filter((insight): insight is string => typeof insight === "string")
    : [];

  const averageConfidence = numberValue(source.avgConfidence ?? source.averageConfidence);

  return {
    totalPatterns: numberValue(source.totalPatterns),
    totalTraders: numberValue(source.totalTraders),
    totalTrades: numberValue(source.totalTrades),
    lastUpdated: stringValue(source.lastUpdated) ?? new Date(0).toISOString(),
    averageConfidence,
    patternSources: {
      publicOnly: numberValue(patternSources?.publicOnly ?? source.publicOnlyPatterns),
      traderOnly: numberValue(patternSources?.traderOnly ?? source.traderOnlyPatterns),
      combined: numberValue(patternSources?.combined ?? source.combinedPatterns),
    },
    confidenceBySource: {
      publicPatterns: numberValue(confidenceBySource?.publicPatterns ?? source.publicPatternsConfidence),
      traderPatterns: numberValue(confidenceBySource?.traderPatterns ?? source.traderPatternsConfidence),
      combinedPatterns: numberValue(confidenceBySource?.combinedPatterns ?? source.combinedPatternsConfidence ?? averageConfidence),
    },
    qualityDistribution: {
      highConfidence: numberValue(qualityDistribution?.highConfidence ?? source.highConfidenceCount),
      mediumConfidence: numberValue(qualityDistribution?.mediumConfidence ?? source.mediumConfidenceCount),
      lowConfidence: numberValue(qualityDistribution?.lowConfidence ?? source.lowConfidenceCount),
    },
    insights,
  };
}
