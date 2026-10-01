export type TrailingStopDirection = "LONG" | "SHORT";

export interface TrailingStopInput {
  direction: TrailingStopDirection;
  entryPrice: number;
  initialStopLoss: number;
  currentStopLoss: number;
  markPrice: number;
}

export interface TrailingStopDecision {
  shouldUpdate: boolean;
  nextStopLoss?: number;
  reason: string;
}

/**
 * Produce a stop that only moves in the position's favorable direction. The
 * initial risk distance is retained, so the first move occurs at +1R and moves
 * the stop to breakeven; thereafter the stop trails one initial risk distance
 * behind the current mark. This helper never calls an exchange API.
 */
export function calculateNonLooseningTrailingStop(input: TrailingStopInput): TrailingStopDecision {
  const { direction, entryPrice, initialStopLoss, currentStopLoss, markPrice } = input;
  const risk = direction === "LONG"
    ? entryPrice - initialStopLoss
    : initialStopLoss - entryPrice;
  if (![entryPrice, initialStopLoss, currentStopLoss, markPrice, risk].every(Number.isFinite) || risk <= 0) {
    return { shouldUpdate: false, reason: "invalid initial risk geometry" };
  }

  const favorableMove = direction === "LONG"
    ? markPrice - entryPrice
    : entryPrice - markPrice;
  if (favorableMove < risk) {
    return { shouldUpdate: false, reason: "trailing activates only after +1R" };
  }

  const proposed = direction === "LONG"
    ? Math.max(entryPrice, markPrice - risk)
    : Math.min(entryPrice, markPrice + risk);
  const minimumMeaningfulMove = risk * 0.05;
  const tightens = direction === "LONG"
    ? proposed > currentStopLoss + minimumMeaningfulMove
    : proposed < currentStopLoss - minimumMeaningfulMove;
  if (!tightens) {
    return { shouldUpdate: false, reason: "existing stop is already as tight or tighter" };
  }

  return {
    shouldUpdate: true,
    nextStopLoss: proposed,
    reason: proposed === entryPrice ? "moved stop to breakeven at +1R" : "tightened trailing stop behind current mark",
  };
}
