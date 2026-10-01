export const HYPERLIQUID_AUTO_TRADER_MIN_CONFIDENCE = 88;
export const HYPERLIQUID_AUTO_TRADER_MAX_CONFIDENCE = 100;

export interface AutoTraderCandidateGateInput {
  confidence: number;
  entryQualityLabel: string;
  isExecutionEligible?: boolean;
  patternType: string;
}

export interface HyperliquidPerpAsset {
  name: string;
  isDelisted?: boolean;
}

export interface HyperliquidAssetContext {
  dayNtlVlm?: string;
  markPx?: string;
  prevDayPx?: string;
}

export interface HyperliquidScanPlan {
  consideredSymbols: string[];
  deepScanSymbols: string[];
}

/**
 * Returns every named asset in Hyperliquid's current perpetual universe, ordered
 * by current notional volume. The list is not volume-filtered: liquidity checks
 * remain an execution gate rather than silently excluding a perpetual from scans.
 */
export function getFullHyperliquidPerpSymbols(
  assets: HyperliquidPerpAsset[],
  contexts: HyperliquidAssetContext[],
): string[] {
  return assets
    .map((asset, index) => ({
      name: asset.name.trim(),
      volume: Number.parseFloat(contexts[index]?.dayNtlVlm ?? "0") || 0,
      isDelisted: asset.isDelisted === true,
    }))
    .filter(({ name, isDelisted }) => name.length > 0 && !isDelisted)
    .sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name))
    .map(({ name }) => `${name.toUpperCase()}USDC`);
}

/**
 * Every active market is considered from the shared Hyperliquid metadata snapshot.
 * A bounded set then receives expensive candle/order-book analysis so the worker
 * stays below the exchange's aggregate REST weight limit. The core liquid markets
 * are always included, fast movers are promoted, and the remaining universe rotates.
 */
export function buildHyperliquidScanPlan(
  assets: HyperliquidPerpAsset[],
  contexts: HyperliquidAssetContext[],
  allowedSymbols: string[],
  rotationSeed: number,
  deepScanLimit = 20,
): HyperliquidScanPlan {
  const allowed = new Set(allowedSymbols.map(symbol => symbol.toUpperCase()));
  const rows = assets
    .map((asset, index) => {
      const symbol = `${asset.name.trim().toUpperCase()}USDC`;
      const mark = Number.parseFloat(contexts[index]?.markPx ?? "0") || 0;
      const previous = Number.parseFloat(contexts[index]?.prevDayPx ?? "0") || 0;
      return {
        symbol,
        isDelisted: asset.isDelisted === true,
        volume: Number.parseFloat(contexts[index]?.dayNtlVlm ?? "0") || 0,
        absoluteMove: mark > 0 && previous > 0 ? Math.abs((mark - previous) / previous) : 0,
      };
    })
    .filter(row => row.symbol !== "USDC" && !row.isDelisted && allowed.has(row.symbol));

  rows.sort((a, b) => b.volume - a.volume || a.symbol.localeCompare(b.symbol));
  const consideredSymbols = rows.map(row => row.symbol);
  const boundedLimit = Math.max(1, Math.min(deepScanLimit, rows.length));
  const coreTarget = Math.min(12, boundedLimit);
  const moverTarget = Math.min(4, Math.max(0, boundedLimit - coreTarget));
  const selected = new Set(rows.slice(0, coreTarget).map(row => row.symbol));

  rows
    .filter(row => !selected.has(row.symbol))
    .sort((a, b) => b.absoluteMove - a.absoluteMove || b.volume - a.volume || a.symbol.localeCompare(b.symbol))
    .slice(0, moverTarget)
    .forEach(row => selected.add(row.symbol));

  const rotationSlots = boundedLimit - selected.size;
  const rotationPool = rows.filter(row => !selected.has(row.symbol));
  if (rotationSlots > 0 && rotationPool.length > 0) {
    const start = (Math.abs(Math.trunc(rotationSeed)) * rotationSlots) % rotationPool.length;
    for (let offset = 0; offset < rotationSlots && offset < rotationPool.length; offset += 1) {
      selected.add(rotationPool[(start + offset) % rotationPool.length].symbol);
    }
  }

  return { consideredSymbols, deepScanSymbols: Array.from(selected) };
}

/** Accept either a bare Hyperliquid coin name or the app's USDC display suffix. */
export function matchesConfiguredHyperliquidSymbol(symbol: string, filter: string): boolean {
  const normalize = (value: string) => value
    .trim()
    .toUpperCase()
    .replace(/USDT$|USDC$|USD$/, "");
  return normalize(symbol) === normalize(filter);
}

export function resolveAutoTraderConfidenceFloor(configuredMinimum: number): number {
  return Math.min(
    HYPERLIQUID_AUTO_TRADER_MAX_CONFIDENCE,
    Math.max(HYPERLIQUID_AUTO_TRADER_MIN_CONFIDENCE, configuredMinimum),
  );
}

/**
 * Auto Trader can act only on an A/A+ server-qualified setup in the requested
 * 88–100 evidence-score range. This is deliberately stricter than display-only
 * signals and excludes fallback paths.
 */
export function isAutoTraderCandidateEligible(
  candidate: AutoTraderCandidateGateInput,
  configuredMinimum: number,
): { eligible: boolean; reason?: string } {
  const requiredConfidence = resolveAutoTraderConfidenceFloor(configuredMinimum);
  if (candidate.confidence < requiredConfidence || candidate.confidence > HYPERLIQUID_AUTO_TRADER_MAX_CONFIDENCE) {
    return { eligible: false, reason: `evidence score ${candidate.confidence}/100 is outside ${requiredConfidence}–${HYPERLIQUID_AUTO_TRADER_MAX_CONFIDENCE}` };
  }
  if (!candidate.isExecutionEligible) return { eligible: false, reason: "quality gate failed" };
  if (candidate.entryQualityLabel !== "A" && candidate.entryQualityLabel !== "A+") {
    return { eligible: false, reason: `entry ${candidate.entryQualityLabel} is not A-quality` };
  }
  if (candidate.patternType.includes("Fallback")) return { eligible: false, reason: "fallback signal" };
  return { eligible: true };
}
