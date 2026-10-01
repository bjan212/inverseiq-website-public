/**
 * Adds deterministic, collision-safe render keys to symbol-based lists.
 * Symbols alone are not unique when a user has multiple source or exchange
 * records for the same asset, so each repeated symbol receives an occurrence
 * suffix from the original data order before any display sorting occurs.
 */
export function withUniqueSymbolRenderKeys<T extends { symbol: string }>(
  items: readonly T[],
  scope: string,
): Array<T & { renderKey: string }> {
  const occurrences = new Map<string, number>();

  return items.map((item) => {
    const symbol = item.symbol.trim() || "UNKNOWN";
    const occurrence = (occurrences.get(symbol) ?? 0) + 1;
    occurrences.set(symbol, occurrence);

    return {
      ...item,
      renderKey: `${scope}:${encodeURIComponent(symbol)}:${occurrence}`,
    };
  });
}

/**
 * Keeps the first record for each displayed symbol. Historical data can contain
 * duplicate snapshots for a pair; showing both would double-count the same
 * performance record in My Pairs summary calculations.
 */
export function keepFirstRecordPerSymbol<T extends { symbol: string }>(items: readonly T[]): T[] {
  const seenSymbols = new Set<string>();

  return items.filter((item) => {
    const symbol = item.symbol.trim().toUpperCase() || "UNKNOWN";
    if (seenSymbols.has(symbol)) return false;
    seenSymbols.add(symbol);
    return true;
  });
}
