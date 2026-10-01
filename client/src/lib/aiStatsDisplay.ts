export interface DetailedAIStats {
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

export const EMPTY_AI_STATS: DetailedAIStats = {
  totalPatterns: 0,
  totalTraders: 0,
  totalTrades: 0,
  lastUpdated: new Date(0).toISOString(),
  averageConfidence: 0,
  patternSources: { publicOnly: 0, traderOnly: 0, combined: 0 },
  confidenceBySource: { publicPatterns: 0, traderPatterns: 0, combinedPatterns: 0 },
  qualityDistribution: { highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 },
  insights: [],
};

/** Prefer the single normalized proxy response whenever it is available. */
export function selectAiStatsForDisplay(stats: DetailedAIStats | null | undefined): DetailedAIStats {
  return stats ?? EMPTY_AI_STATS;
}
