export const BEST_COIN_STRATEGY_PREFERENCES = ["ai_best_pick", "momentum_rsi"] as const;

export type BestCoinStrategyPreference = (typeof BEST_COIN_STRATEGY_PREFERENCES)[number];

export interface StrategySelectableSignal {
  symbol: string;
  patternType: string;
  isExecutionEligible?: boolean;
  confidence?: number;
}

export interface StrategySelection<T extends StrategySelectableSignal> {
  signal: T;
  requested: BestCoinStrategyPreference;
  applied: boolean;
  label: string;
  note: string;
}

export function rankSignalsByEvidence<T extends StrategySelectableSignal>(candidates: T[]): T[] {
  return candidates
    .map((candidate, originalIndex) => ({ candidate, originalIndex }))
    .sort((a, b) =>
      (b.candidate.confidence ?? -1) - (a.candidate.confidence ?? -1)
      || a.originalIndex - b.originalIndex,
    )
    .map(({ candidate }) => candidate);
}

/**
 * Selects only among the existing server-engine candidates. It deliberately does
 * not relax the engine's execution-quality gate or call any exchange API.
 */
export function selectSignalForStrategy<T extends StrategySelectableSignal>(
  candidates: T[],
  preference: BestCoinStrategyPreference = "ai_best_pick",
): StrategySelection<T> {
  if (candidates.length === 0) {
    throw new Error("Strategy selection requires at least one signal candidate");
  }

  const rankedSignals = rankSignalsByEvidence(candidates);
  const eligibleSignals = rankedSignals.filter(candidate => candidate.isExecutionEligible);
  const defaultSignal = eligibleSignals[0] ?? rankedSignals[0];
  if (preference === "ai_best_pick") {
    return {
      signal: defaultSignal,
      requested: preference,
      applied: true,
      label: "AI Best Pick (5-Layer Confluence)",
      note: "Highest-ranked server candidate that preserves the existing execution-quality preference.",
    };
  }

  const momentumSignal = eligibleSignals.find(candidate => /momentum\s*rsi/i.test(candidate.patternType));
  if (momentumSignal) {
    return {
      signal: momentumSignal,
      requested: preference,
      applied: true,
      label: "Momentum RSI Preference",
      note: "Selected the highest-ranked execution-eligible Momentum RSI candidate from the same server scan.",
    };
  }

  return {
    signal: defaultSignal,
    requested: preference,
    applied: false,
    label: "AI Best Pick (Momentum RSI Preference Unavailable)",
    note: "No execution-eligible Momentum RSI candidate was available, so the standard server-quality selection was retained.",
  };
}
