/**
 * Multi-Exchange Market Scanner
 * Aggregates data from Binance, Bybit, OKX, Hyperliquid, dYdX, and GMX
 * to find the best trade opportunities across all markets.
 */

export type ExchangeId = "binance" | "bybit" | "okx" | "hyperliquid" | "dydx" | "gmx" | "asterdex";

export interface ExchangeMarketData {
  exchange: ExchangeId;
  exchangeLabel: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  openInterest?: number;
  fundingRate?: number;
  bidAskSpread?: number;
  liquidityScore: number; // 0-100
  isDeFi: boolean;
  tradeUrl?: string;
}

export interface MultiExchangeSignal {
  symbol: string;
  direction: "LONG" | "SHORT";
  exchange: ExchangeId;
  exchangeLabel: string;
  price: number;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  confidence: number;
  liquidityScore: number;
  fundingRate?: number;
  volume24h: number;
  openInterest?: number;
  priceChange24h: number;
  riskReward: string;
  isDeFi: boolean;
  tradeUrl?: string;
  reasoning: string;
  compositeScore: number; // Overall ranking score
  createdAt: number; // Unix timestamp ms when signal was generated
  volatility?: number; // 0-1 normalised volatility for countdown calculation
}

// ─── Exchange API Fetchers ────────────────────────────────────────────────────

async function fetchBinanceMarkets(): Promise<ExchangeMarketData[]> {
  try {
    const [tickerRes, oiRes, fundingRes] = await Promise.allSettled([
      fetch("https://fapi.binance.com/fapi/v1/ticker/24hr"),
      fetch("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"),
      fetch("https://fapi.binance.com/fapi/v1/fundingRate?limit=1"),
    ]);

    const tickers =
      tickerRes.status === "fulfilled" && tickerRes.value.ok
        ? await tickerRes.value.json()
        : [];

    const usdtPairs = tickers
      .filter(
        (t: any) =>
          t.symbol.endsWith("USDT") &&
          parseFloat(t.quoteVolume) > 10_000_000
      )
      .slice(0, 50)
      .map((t: any) => ({
        exchange: "binance" as ExchangeId,
        exchangeLabel: "Binance Futures",
        symbol: t.symbol.replace("USDT", "/USDT"),
        price: parseFloat(t.lastPrice),
        priceChange24h: parseFloat(t.priceChangePercent),
        volume24h: parseFloat(t.quoteVolume),
        liquidityScore: Math.min(100, Math.round(parseFloat(t.quoteVolume) / 10_000_000)),
        isDeFi: false,
        tradeUrl: `https://www.binance.com/en/trade/${t.symbol.replace('USDT', '_USDT')}?type=futures`,
      }));

    return usdtPairs;
  } catch {
    return [];
  }
}

async function fetchBybitMarkets(): Promise<ExchangeMarketData[]> {
  try {
    const res = await fetch(
      "https://api.bybit.com/v5/market/tickers?category=linear"
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.result?.list ?? [];

    return list
      .filter(
        (t: any) =>
          t.symbol.endsWith("USDT") &&
          parseFloat(t.turnover24h) > 5_000_000
      )
      .slice(0, 50)
      .map((t: any) => ({
        exchange: "bybit" as ExchangeId,
        exchangeLabel: "Bybit Futures",
        symbol: t.symbol.replace("USDT", "/USDT"),
        price: parseFloat(t.lastPrice),
        priceChange24h: parseFloat(t.price24hPcnt) * 100,
        volume24h: parseFloat(t.turnover24h),
        openInterest: parseFloat(t.openInterest ?? "0"),
        fundingRate: parseFloat(t.fundingRate ?? "0") * 100,
        liquidityScore: Math.min(100, Math.round(parseFloat(t.turnover24h) / 5_000_000)),
        isDeFi: false,
        tradeUrl: `https://www.bybit.com/trade/usdt/${t.symbol}`,
      }));
  } catch {
    return [];
  }
}

async function fetchOKXMarkets(): Promise<ExchangeMarketData[]> {
  try {
    const res = await fetch(
      "https://www.okx.com/api/v5/market/tickers?instType=SWAP"
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data ?? [];

    return list
      .filter(
        (t: any) =>
          t.instId.endsWith("USDT-SWAP") &&
          parseFloat(t.volCcy24h) > 1_000_000
      )
      .slice(0, 50)
      .map((t: any) => {
        const base = t.instId.replace("-USDT-SWAP", "");
        return {
          exchange: "okx" as ExchangeId,
          exchangeLabel: "OKX Futures",
          symbol: `${base}/USDT`,
          price: parseFloat(t.last),
          priceChange24h: ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100,
          volume24h: parseFloat(t.volCcy24h),
          openInterest: parseFloat(t.oi ?? "0"),
          liquidityScore: Math.min(100, Math.round(parseFloat(t.volCcy24h) / 1_000_000)),
          isDeFi: false,
          tradeUrl: `https://www.okx.com/trade-swap/${t.instId.toUpperCase()}`,
        };
      });
  } catch {
    return [];
  }
}

async function fetchHyperliquidMarkets(): Promise<ExchangeMarketData[]> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    });
    if (!res.ok) return [];
    const [meta, assetCtxs] = await res.json();
    const universe: any[] = meta?.universe ?? [];

    return universe
      .map((asset: any, i: number) => {
        const ctx = assetCtxs[i];
        if (!ctx) return null;
        const price = parseFloat(ctx.markPx ?? "0");
        const oi = parseFloat(ctx.openInterest ?? "0") * price;
        const funding = parseFloat(ctx.funding ?? "0") * 100;
        if (oi < 500_000) return null;
        return {
          exchange: "hyperliquid" as ExchangeId,
          exchangeLabel: "Hyperliquid (DeFi)",
          symbol: `${asset.name}/USDC`,
          price,
          priceChange24h: 0, // HL doesn't expose 24h change directly
          volume24h: oi * 2, // Approximate from OI
          openInterest: oi,
          fundingRate: funding,
          liquidityScore: Math.min(100, Math.round(oi / 1_000_000)),
          isDeFi: true,
          tradeUrl: `https://app.hyperliquid.xyz/trade/${asset.name}`,
        };
      })
      .filter(Boolean) as ExchangeMarketData[];
  } catch {
    return [];
  }
}

async function fetchDydxMarkets(): Promise<ExchangeMarketData[]> {
  try {
    const res = await fetch("https://indexer.dydx.trade/v4/perpetualMarkets");
    if (!res.ok) return [];
    const data = await res.json();
    const markets = Object.values(data?.markets ?? {}) as any[];

    return markets
      .filter((m: any) => parseFloat(m.volume24H ?? "0") > 500_000)
      .slice(0, 30)
      .map((m: any) => ({
        exchange: "dydx" as ExchangeId,
        exchangeLabel: "dYdX (DeFi)",
        symbol: m.ticker?.replace("-", "/") ?? m.id,
        price: parseFloat(m.oraclePrice ?? "0"),
        priceChange24h: parseFloat(m.priceChange24H ?? "0"),
        volume24h: parseFloat(m.volume24H ?? "0"),
        openInterest: parseFloat(m.openInterest ?? "0"),
        fundingRate: parseFloat(m.nextFundingRate ?? "0") * 100,
        liquidityScore: Math.min(100, Math.round(parseFloat(m.volume24H ?? "0") / 500_000)),
        isDeFi: true,
        tradeUrl: `https://dydx.trade/trade/${m.ticker}`,
      }));
  } catch {
    return [];
  }
}

async function fetchAsterDEXMarkets(): Promise<ExchangeMarketData[]> {
  try {
    // AsterDEX Perpetuals — Binance-compatible API at https://fapi.asterdex.com
    const [tickerRes, premiumRes] = await Promise.allSettled([
      fetch("https://fapi.asterdex.com/fapi/v3/ticker/24hr"),
      fetch("https://fapi.asterdex.com/fapi/v3/premiumIndex"),
    ]);

    const tickers: any[] =
      tickerRes.status === "fulfilled" && tickerRes.value.ok
        ? await tickerRes.value.json()
        : [];

    const premiums: any[] =
      premiumRes.status === "fulfilled" && premiumRes.value.ok
        ? await premiumRes.value.json()
        : [];

    // Build funding rate lookup
    const fundingMap: Record<string, number> = {};
    for (const p of premiums) {
      fundingMap[p.symbol] = parseFloat(p.lastFundingRate ?? "0") * 100;
    }

    return tickers
      .filter(
        (t: any) =>
          t.symbol.endsWith("USDT") &&
          parseFloat(t.quoteVolume ?? "0") > 1_000_000
      )
      .slice(0, 40)
      .map((t: any) => ({
        exchange: "asterdex" as ExchangeId,
        exchangeLabel: "AsterDEX (DeFi Perps)",
        symbol: t.symbol.replace("USDT", "/USDT"),
        price: parseFloat(t.lastPrice),
        priceChange24h: parseFloat(t.priceChangePercent ?? "0"),
        volume24h: parseFloat(t.quoteVolume ?? "0"),
        fundingRate: fundingMap[t.symbol] ?? undefined,
        liquidityScore: Math.min(100, Math.round(parseFloat(t.quoteVolume ?? "0") / 1_000_000)),
        isDeFi: true,
        tradeUrl: `https://www.asterdex.com/futures/${t.symbol}`,
      }));
  } catch {
    return [];
  }
}

async function fetchGMXMarkets(): Promise<ExchangeMarketData[]> {
  try {
    // GMX v2 stats API
    const res = await fetch("https://arbitrum-api.gmxinfra.io/prices/tickers");
    if (!res.ok) return [];
    const tickers = await res.json();

    return (tickers as any[])
      .filter((t: any) => t.tokenSymbol && parseFloat(t.minPrice ?? "0") > 0)
      .slice(0, 20)
      .map((t: any) => {
        const price = parseFloat(t.minPrice) / 1e30; // GMX uses 30 decimal precision
        return {
          exchange: "gmx" as ExchangeId,
          exchangeLabel: "GMX (DeFi)",
          symbol: `${t.tokenSymbol}/USD`,
          price,
          priceChange24h: 0,
          volume24h: 0,
          liquidityScore: 50,
          isDeFi: true,
          tradeUrl: `https://app.gmx.io/#/trade`,
        };
      });
  } catch {
    return [];
  }
}

// ─── Technical Analysis Helpers ──────────────────────────────────────────────

function calculateATR(high: number, low: number, close: number): number {
  return Math.max(high - low, Math.abs(high - close), Math.abs(low - close));
}

function scoreMarket(market: ExchangeMarketData): number {
  let score = 0;

  // Liquidity weight (30%)
  score += market.liquidityScore * 0.3;

  // Volume weight (20%)
  const volScore = Math.min(100, Math.log10(market.volume24h + 1) * 10);
  score += volScore * 0.2;

  // Momentum weight (20%) - strong moves in either direction
  const momentumScore = Math.min(100, Math.abs(market.priceChange24h) * 5);
  score += momentumScore * 0.2;

  // Funding rate opportunity (15%) - extreme funding = mean reversion opportunity
  if (market.fundingRate !== undefined) {
    const fundingScore = Math.min(100, Math.abs(market.fundingRate) * 1000);
    score += fundingScore * 0.15;
  }

  // DeFi bonus (15%) - DeFi markets often have better opportunities
  if (market.isDeFi) score += 15;

  return Math.round(score);
}

function generateSignalFromMarket(market: ExchangeMarketData): MultiExchangeSignal {
  const price = market.price;
  const atr = price * 0.02; // Approximate 2% ATR

  // Determine direction based on momentum and funding rate
  let direction: "LONG" | "SHORT" = "LONG";
  let reasoning = "";

  if (market.fundingRate !== undefined && Math.abs(market.fundingRate) > 0.05) {
    // Extreme funding rate = fade the trend (mean reversion)
    direction = market.fundingRate > 0 ? "SHORT" : "LONG";
    reasoning = `Extreme funding rate (${market.fundingRate.toFixed(4)}%) signals mean reversion opportunity`;
  } else if (Math.abs(market.priceChange24h) > 5) {
    // Strong momentum = follow the trend with pullback entry
    direction = market.priceChange24h > 0 ? "LONG" : "SHORT";
    reasoning = `Strong ${market.priceChange24h > 0 ? "bullish" : "bearish"} momentum (${market.priceChange24h.toFixed(2)}%) with pullback entry`;
  } else {
    // Default: use liquidity and OI for direction
    direction = market.openInterest && market.openInterest > market.volume24h * 0.5 ? "SHORT" : "LONG";
    reasoning = `High liquidity (score: ${market.liquidityScore}) with ${direction === "LONG" ? "bullish" : "bearish"} OI structure`;
  }

  const entryPrice = direction === "LONG" ? price * 0.998 : price * 1.002;
  const takeProfit = direction === "LONG" ? entryPrice * 1.03 : entryPrice * 0.97;
  const stopLoss = direction === "LONG" ? entryPrice * 0.985 : entryPrice * 1.015;
  const rr = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);

  const compositeScore = scoreMarket(market);
  const confidence = Math.min(95, 60 + compositeScore * 0.35);

  // Estimate normalised volatility from 24h price change (0-1 scale)
  const volatility = Math.min(1, Math.abs(market.priceChange24h) / 20);

  return {
    symbol: market.symbol,
    direction,
    exchange: market.exchange,
    exchangeLabel: market.exchangeLabel,
    price,
    entryPrice,
    takeProfit,
    stopLoss,
    confidence: Math.round(confidence),
    liquidityScore: market.liquidityScore,
    fundingRate: market.fundingRate,
    volume24h: market.volume24h,
    openInterest: market.openInterest,
    priceChange24h: market.priceChange24h,
    riskReward: `1:${rr.toFixed(1)}`,
    isDeFi: market.isDeFi,
    tradeUrl: market.tradeUrl,
    reasoning,
    compositeScore,
    createdAt: Date.now(),
    volatility,
  };
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export type ScanFilter = "all" | "cex" | "defi" | "binance" | "bybit" | "okx" | "hyperliquid" | "dydx" | "gmx" | "asterdex";

export async function scanAllMarkets(filter: ScanFilter = "all"): Promise<MultiExchangeSignal[]> {
  const fetchers: Record<string, () => Promise<ExchangeMarketData[]>> = {
    binance: fetchBinanceMarkets,
    bybit: fetchBybitMarkets,
    okx: fetchOKXMarkets,
    hyperliquid: fetchHyperliquidMarkets,
    dydx: fetchDydxMarkets,
    gmx: fetchGMXMarkets,
    asterdex: fetchAsterDEXMarkets,
  };
  // Determine which exchanges to scan
  let exchangesToScan = Object.keys(fetchers);
  if (filter === "cex") exchangesToScan = ["binance", "bybit", "okx"];
  else if (filter === "defi") exchangesToScan = ["hyperliquid", "dydx", "gmx", "asterdex"];
  else if (filter !== "all") exchangesToScan = [filter];

  // Fetch all markets in parallel
  const results = await Promise.allSettled(
    exchangesToScan.map((ex) => fetchers[ex]())
  );

  const allMarkets: ExchangeMarketData[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  if (allMarkets.length === 0) return [];

  // Score and rank all markets
  const signals = allMarkets
    .filter((m) => m.price > 0 && m.volume24h > 0)
    .map(generateSignalFromMarket)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  // Return top 20 signals, deduplicated by symbol+exchange
  const seen = new Set<string>();
  return signals
    .filter((s) => {
      const key = `${s.symbol}-${s.exchange}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

export async function findBestTradeAcrossMarkets(): Promise<MultiExchangeSignal | null> {
  const signals = await scanAllMarkets("all");
  return signals.length > 0 ? signals[0] : null;
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

export const EXCHANGE_COLORS: Record<ExchangeId, string> = {
  binance: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  bybit: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  okx: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  hyperliquid: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  dydx: "text-pink-400 border-pink-400/30 bg-pink-400/10",
  gmx: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  asterdex: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

export const EXCHANGE_ICONS: Record<ExchangeId, string> = {
  binance: "🟡",
  bybit: "🟠",
  okx: "🔵",
  hyperliquid: "🟣",
  dydx: "🩷",
  gmx: "🩵",
  asterdex: "⭐",
};
