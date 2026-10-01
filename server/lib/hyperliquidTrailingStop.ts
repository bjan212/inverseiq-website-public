import { buildModifyReduceOnlyStopAction } from "../hyperliquidSigning";

export interface VerifiedTrailingStopUpdate {
  oid: number;
  assetIndex: number;
  closingIsBuy: boolean;
  size: number;
  currentStopLoss: number;
  nextStopLoss: number;
  direction: "LONG" | "SHORT";
}

/**
 * Construct, but never submit, a replacement for an already verified SL trigger.
 * A LONG stop can only rise and a SHORT stop can only fall. This contains no
 * network or signing call; submission remains separately authorization-gated.
 */
export function buildVerifiedTrailingStopUpdate(input: VerifiedTrailingStopUpdate) {
  if (!Number.isInteger(input.oid) || input.oid < 0) throw new Error("A verified trigger OID is required");
  if (!Number.isFinite(input.size) || input.size <= 0) throw new Error("A positive protected size is required");
  if (!Number.isFinite(input.nextStopLoss) || input.nextStopLoss <= 0) throw new Error("A valid replacement stop is required");
  const tightens = input.direction === "LONG"
    ? input.nextStopLoss > input.currentStopLoss
    : input.nextStopLoss < input.currentStopLoss;
  if (!tightens) throw new Error("Trailing protection may not loosen the existing stop");
  return buildModifyReduceOnlyStopAction({
    oid: input.oid,
    assetIndex: input.assetIndex,
    closingIsBuy: input.closingIsBuy,
    size: input.size,
    stopLoss: input.nextStopLoss,
  });
}
