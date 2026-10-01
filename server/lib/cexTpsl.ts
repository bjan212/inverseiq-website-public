export type EntrySide = "BUY" | "SELL";

export type CexProtectionInput = {
  symbol: string;
  entrySide: EntrySide;
  entryPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
};

export type ProtectionValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates that optional exit levels are directionally coherent with a market entry.
 * Both levels are required whenever exchange-side protection is requested so a trade
 * is never presented as fully protected with only one side of its exit plan.
 */
export function validateCexProtection(input: CexProtectionInput): ProtectionValidation {
  const hasTp = typeof input.takeProfit === "number";
  const hasSl = typeof input.stopLoss === "number";
  if (!hasTp && !hasSl) return { ok: true };
  if (!hasTp || !hasSl) return { ok: false, error: "Both take-profit and stop-loss are required for exchange-side protection" };
  if (!Number.isFinite(input.takeProfit) || !Number.isFinite(input.stopLoss) || input.takeProfit! <= 0 || input.stopLoss! <= 0) {
    return { ok: false, error: "Take-profit and stop-loss must be positive prices" };
  }
  if (typeof input.entryPrice === "number" && input.entryPrice > 0) {
    if (input.entrySide === "BUY" && !(input.takeProfit! > input.entryPrice && input.stopLoss! < input.entryPrice)) {
      return { ok: false, error: "Long protection requires take-profit above entry and stop-loss below entry" };
    }
    if (input.entrySide === "SELL" && !(input.takeProfit! < input.entryPrice && input.stopLoss! > input.entryPrice)) {
      return { ok: false, error: "Short protection requires take-profit below entry and stop-loss above entry" };
    }
  }
  return { ok: true };
}

export function oppositeCexSide(side: EntrySide): EntrySide {
  return side === "BUY" ? "SELL" : "BUY";
}

export function buildBinanceProtectionOrders(input: Required<Pick<CexProtectionInput, "symbol" | "entrySide" | "takeProfit" | "stopLoss">>) {
  const closeSide = oppositeCexSide(input.entrySide);
  return [
    {
      algoType: "CONDITIONAL",
      symbol: input.symbol,
      side: closeSide,
      type: "TAKE_PROFIT_MARKET",
      triggerPrice: String(input.takeProfit),
      closePosition: "true",
      workingType: "MARK_PRICE",
      priceProtect: "true",
    },
    {
      algoType: "CONDITIONAL",
      symbol: input.symbol,
      side: closeSide,
      type: "STOP_MARKET",
      triggerPrice: String(input.stopLoss),
      closePosition: "true",
      workingType: "MARK_PRICE",
      priceProtect: "true",
    },
  ] as const;
}

export function buildBybitPositionProtection(input: Required<Pick<CexProtectionInput, "symbol" | "takeProfit" | "stopLoss">>) {
  return {
    category: "linear",
    symbol: input.symbol,
    tpslMode: "Full",
    positionIdx: 0,
    takeProfit: String(input.takeProfit),
    stopLoss: String(input.stopLoss),
    tpTriggerBy: "MarkPrice",
    slTriggerBy: "MarkPrice",
    tpOrderType: "Market",
    slOrderType: "Market",
  } as const;
}

export function buildOkxPositionProtection(input: Required<Pick<CexProtectionInput, "symbol" | "entrySide" | "takeProfit" | "stopLoss">>) {
  return {
    instId: input.symbol,
    tdMode: "cross",
    side: oppositeCexSide(input.entrySide).toLowerCase(),
    posSide: "net",
    ordType: "oco",
    closeFraction: "1",
    reduceOnly: true,
    cxlOnClosePos: true,
    tpTriggerPx: String(input.takeProfit),
    tpTriggerPxType: "mark",
    tpOrdPx: "-1",
    slTriggerPx: String(input.stopLoss),
    slTriggerPxType: "mark",
    slOrdPx: "-1",
  } as const;
}
