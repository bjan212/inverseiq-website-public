/**
 * exchangeUniverse.ts
 *
 * Fetches the live universe of active USDT-margined perpetual futures pairs
 * from all supported exchanges using PUBLIC REST APIs — no API key required.
 *
 * Supported exchanges:
 *   - Binance Futures (fapi)
 *   - Bybit Linear (v5)
 *   - OKX Swap (v5)
 *   - Hyperliquid (info endpoint)
 */

import axios from "axios";

export interface ExchangePair {
  symbol: string;       // normalised base symbol, e.g. "BTC"
  rawSymbol: string;    // exchange-native symbol, e.g. "BTCUSDT" / "BTC-USDT-SWAP"
  exchange: "binance" | "bybit" | "okx" | "hyperliquid";
  quoteVolume24h: number; // USDT volume in last 24 h (used for ranking)
}

export interface ExchangeUniverseResult {
  pairs: ExchangePair[];
  exchangeCounts: Record<string, number>;
  fetchedAt: number; // unix ms
}

// ── Binance Futures ──────────────────────────────────────────────────────────
async function fetchBinancePairs(): Promise<ExchangePair[]> {
  try {
    const res = await axios.get(
      "https://fapi.binance.com/fapi/v1/ticker/24hr",
      { timeout: 8000 }
    );
    const tickers: { symbol: string; quoteVolume: string }[] = res.data;
    return tickers
      .filter(t => t.symbol.endsWith("USDT") && !t.symbol.includes("_"))
      .map(t => ({
        symbol: t.symbol.replace("USDT", ""),
        rawSymbol: t.symbol,
        exchange: "binance" as const,
        quoteVolume24h: parseFloat(t.quoteVolume) || 0,
      }));
  } catch {
    return [];
  }
}

// ── Bybit Linear Perpetuals ──────────────────────────────────────────────────
async function fetchBybitPairs(): Promise<ExchangePair[]> {
  try {
    const res = await axios.get(
      "https://api.bybit.com/v5/market/tickers?category=linear",
      { timeout: 8000 }
    );
    const list: { symbol: string; turnover24h: string }[] =
      res.data?.result?.list ?? [];
    return list
      .filter(t => t.symbol.endsWith("USDT") && !t.symbol.includes("-"))
      .map(t => ({
        symbol: t.symbol.replace("USDT", ""),
        rawSymbol: t.symbol,
        exchange: "bybit" as const,
        quoteVolume24h: parseFloat(t.turnover24h) || 0,
      }));
  } catch {
    return [];
  }
}

// ── OKX Swap (USDT-margined) ─────────────────────────────────────────────────
async function fetchOkxPairs(): Promise<ExchangePair[]> {
  try {
    const res = await axios.get(
      "https://www.okx.com/api/v5/market/tickers?instType=SWAP",
      { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0; +https://inverseiq.io)" } }
    );
    const list: { instId: string; volCcy24h: string }[] =
      res.data?.data ?? [];
    return list
      .filter(t => t.instId.endsWith("-USDT-SWAP"))
      .map(t => ({
        symbol: t.instId.replace("-USDT-SWAP", ""),
        rawSymbol: t.instId,
        exchange: "okx" as const,
        quoteVolume24h: parseFloat(t.volCcy24h) || 0,
      }));
  } catch {
    return [];
  }
}

// ── Hyperliquid ──────────────────────────────────────────────────────────────
async function fetchHyperliquidPairs(): Promise<ExchangePair[]> {
  try {
    const res = await axios.post(
      "https://api.hyperliquid.xyz/info",
      { type: "metaAndAssetCtxs" },
      { timeout: 8000 }
    );
    const [meta, assetCtxs] = res.data as [
      { universe: { name: string }[] },
      { dayNtlVlm: string }[]
    ];
    return meta.universe.map((asset, i) => ({
      symbol: asset.name,
      rawSymbol: asset.name,
      exchange: "hyperliquid" as const,
      quoteVolume24h: parseFloat(assetCtxs[i]?.dayNtlVlm ?? "0") || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the full live universe from all four exchanges in parallel.
 * Returns a deduplicated, volume-sorted list of pairs.
 */
export async function fetchMultiExchangeUniverse(): Promise<ExchangeUniverseResult> {
  const [binance, bybit, okx, hyperliquid] = await Promise.all([
    fetchBinancePairs(),
    fetchBybitPairs(),
    fetchOkxPairs(),
    fetchHyperliquidPairs(),
  ]);

  const all = [...binance, ...bybit, ...okx, ...hyperliquid];

  // Sort by 24h volume descending so the most liquid pairs are scanned first
  all.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

  const exchangeCounts: Record<string, number> = {
    binance: binance.length,
    bybit: bybit.length,
    okx: okx.length,
    hyperliquid: hyperliquid.length,
  };

  return {
    pairs: all,
    exchangeCounts,
    fetchedAt: Date.now(),
  };
}

/**
 * Get the top N unique base symbols by combined volume across all exchanges.
 * Prioritises symbols listed on Binance or Bybit (which have reliable kline APIs).
 * Hyperliquid-only / OKX-only exotic coins are included only as fallback.
 */
export async function getTopSymbolsForScanning(topN = 60): Promise<{
  symbols: string[];
  exchangeCounts: Record<string, number>;
  totalPairs: number;
}> {
  const { pairs, exchangeCounts } = await fetchMultiExchangeUniverse();

  // Build a set of base symbols confirmed on OKX (primary kline source — no geo-block)
  const okxSymbols     = new Set(pairs.filter(p => p.exchange === "okx").map(p => p.symbol));
  const binanceSymbols = new Set(pairs.filter(p => p.exchange === "binance").map(p => p.symbol));
  const bybitSymbols   = new Set(pairs.filter(p => p.exchange === "bybit").map(p => p.symbol));

  // Deduplicate by base symbol, keeping the highest-volume entry
  const seen = new Map<string, ExchangePair>();
  for (const p of pairs) {
    const existing = seen.get(p.symbol);
    if (!existing || p.quoteVolume24h > existing.quoteVolume24h) {
      seen.set(p.symbol, p);
    }
  }

  // Sort: OKX-listed first (reliable kline source), then Binance, then Bybit, then others
  const sorted = Array.from(seen.values()).sort((a, b) => {
    const tierA = okxSymbols.has(a.symbol) ? 0 : binanceSymbols.has(a.symbol) ? 1 : bybitSymbols.has(a.symbol) ? 2 : 3;
    const tierB = okxSymbols.has(b.symbol) ? 0 : binanceSymbols.has(b.symbol) ? 1 : bybitSymbols.has(b.symbol) ? 2 : 3;
    if (tierA !== tierB) return tierA - tierB;
    return b.quoteVolume24h - a.quoteVolume24h;
  });

  // Convert to Binance USDT perp symbol format (XXXUSDT)
  // Only include symbols that pass a basic sanity check (no special chars, reasonable length)
  const topSymbols = sorted
    .filter(p => /^[A-Z0-9]{2,12}$/.test(p.symbol)) // filter out exotic symbols like "1000PEPE" edge cases
    .slice(0, topN)
    .map(p => `${p.symbol}USDT`);

  return {
    symbols: topSymbols,
    exchangeCounts,
    totalPairs: pairs.length,
  };
}

/**
 * For a given base symbol, return which exchanges list it as a perp.
 * Handles various input formats: "BTCUSDT", "BTC/USDT", "BTC/USDC", "BTCUSDC", "BTC"
 */
export async function getExchangesForSymbol(
  baseSymbol: string
): Promise<("binance" | "bybit" | "okx" | "hyperliquid")[]> {
  const { pairs } = await fetchMultiExchangeUniverse();
  // Normalize: strip quote currencies (USDT, USDC, USD) and separators (/, -)
  const sym = baseSymbol
    .toUpperCase()
    .replace(/[\/\-]/g, "")
    .replace(/USDT$/, "")
    .replace(/USDC$/, "")
    .replace(/USD$/, "");
  const exchanges = pairs
    .filter(p => p.symbol.toUpperCase() === sym)
    .map(p => p.exchange);
  return Array.from(new Set(exchanges));
}
