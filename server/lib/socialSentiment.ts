/**
 * socialSentiment.ts
 *
 * Aggregates social sentiment signals from multiple free, no-key-required sources:
 *
 *  1. Fear & Greed Index  — api.alternative.me/fng/  (market-wide sentiment 0–100)
 *  2. CoinGecko Trending  — api.coingecko.com/api/v3/search/trending (trending coins list)
 *  3. CoinGecko Coin Data — community_score, sentiment_votes_up/down (per-coin)
 *
 * Outputs a SentimentResult with:
 *   fearGreedValue        — 0–100 (0=Extreme Fear, 100=Extreme Greed)
 *   fearGreedLabel        — "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
 *   isTrending            — true if coin appears in CoinGecko's top 15 trending
 *   trendingRank          — 1–15 if trending, null otherwise
 *   communityScore        — 0–100 from CoinGecko community data
 *   sentimentVotesUpPct   — % of positive votes (0–100)
 *   sentimentScore        — composite 0–100 sentiment score
 *   sentimentBias         — "bullish" | "bearish" | "neutral"
 *   sentimentLabel        — human-readable label
 */

import axios from "axios";

export interface SentimentResult {
  fearGreedValue: number;
  fearGreedLabel: string;
  isTrending: boolean;
  trendingRank: number | null;
  communityScore: number;
  sentimentVotesUpPct: number;
  sentimentScore: number;        // 0–100 composite
  sentimentBias: "bullish" | "bearish" | "neutral";
  sentimentLabel: string;
}

// ─── In-memory cache (TTL: 5 minutes for F&G, 10 minutes for trending) ────────

interface CacheEntry<T> { data: T; expiresAt: number }

const cache: {
  fearGreed?: CacheEntry<{ value: number; label: string }>;
  trending?: CacheEntry<string[]>;  // array of CoinGecko coin IDs
  coinData: Record<string, CacheEntry<{ communityScore: number; votesUpPct: number }>>;
} = { coinData: {} };

// ─── Fear & Greed ─────────────────────────────────────────────────────────────

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  const now = Date.now();
  if (cache.fearGreed && cache.fearGreed.expiresAt > now) return cache.fearGreed.data;

  try {
    const res = await axios.get("https://api.alternative.me/fng/?limit=1", { timeout: 5000 });
    const item = res.data?.data?.[0];
    if (!item) throw new Error("No data");
    const data = { value: parseInt(item.value), label: item.value_classification as string };
    cache.fearGreed = { data, expiresAt: now + 5 * 60 * 1000 };
    return data;
  } catch {
    return { value: 50, label: "Neutral" };
  }
}

// ─── CoinGecko Trending ───────────────────────────────────────────────────────

// Map common trading symbols to CoinGecko IDs for trending lookup
const SYMBOL_TO_CG_ID: Record<string, string> = {
  BTCUSDT: "bitcoin", ETHUSDT: "ethereum", SOLUSDT: "solana",
  BNBUSDT: "binancecoin", XRPUSDT: "ripple", DOGEUSDT: "dogecoin",
  ADAUSDT: "cardano", AVAXUSDT: "avalanche-2", DOTUSDT: "polkadot",
  LINKUSDT: "chainlink", MATICUSDT: "matic-network", NEARUSDT: "near",
  APTUSDT: "aptos", SUIUSDT: "sui", ARBUSDT: "arbitrum",
  OPUSDT: "optimism", INJUSDT: "injective-protocol", TIAUSDT: "celestia",
  SEIUSDT: "sei-network", WIFUSDT: "dogwifcoin", JUPUSDT: "jupiter-exchange-solana",
  LTCUSDT: "litecoin", UNIUSDT: "uniswap", ATOMUSDT: "cosmos",
  SNDKUSDT: "sonic-3", ENAUSDT: "ethena", MRVLUSDT: "marvell-technology",
  SOXLUSDT: "direxion-daily-semiconductor-bull-3x-shares",
  WLDUSDT: "worldcoin-wld", FETUSDT: "fetch-ai", RNDRUSDT: "render-token",
  TAOUSDT: "bittensor", ARUSDT: "arweave", FILUSDT: "filecoin",
  STXUSDT: "blockstack", RUNEUSDT: "thorchain", LDOUSDT: "lido-dao",
  AAVEUSDT: "aave", CRVUSDT: "curve-dao-token", GMXUSDT: "gmx",
  DYDXUSDT: "dydx", PERPUSDT: "perpetual-protocol",
};

async function fetchTrendingIds(): Promise<string[]> {
  const now = Date.now();
  if (cache.trending && cache.trending.expiresAt > now) return cache.trending.data;

  try {
    const res = await axios.get("https://api.coingecko.com/api/v3/search/trending", { timeout: 6000 });
    const coins: { item: { id: string } }[] = res.data?.coins ?? [];
    const ids = coins.map(c => c.item.id);
    cache.trending = { data: ids, expiresAt: now + 10 * 60 * 1000 };
    return ids;
  } catch {
    return [];
  }
}

// ─── CoinGecko Coin Community Data ───────────────────────────────────────────

async function fetchCoinCommunityData(cgId: string): Promise<{ communityScore: number; votesUpPct: number }> {
  const now = Date.now();
  const cached = cache.coinData[cgId];
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false&sparkline=false`,
      { timeout: 6000 }
    );
    const d = res.data;
    const communityScore = d?.community_score ?? 0;
    const votesUp   = d?.sentiment_votes_up_percentage ?? 50;
    const votesDown = d?.sentiment_votes_down_percentage ?? 50;
    const votesUpPct = votesUp + votesDown > 0
      ? (votesUp / (votesUp + votesDown)) * 100
      : 50;

    const data = {
      communityScore: Math.min(100, Math.max(0, communityScore)),
      votesUpPct: parseFloat(votesUpPct.toFixed(1)),
    };
    cache.coinData[cgId] = { data, expiresAt: now + 15 * 60 * 1000 };
    return data;
  } catch {
    return { communityScore: 50, votesUpPct: 50 };
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch aggregated social sentiment for a given trading symbol (e.g. "BTCUSDT").
 * All data sources are cached to avoid rate limits.
 */
export async function fetchSocialSentiment(symbol: string): Promise<SentimentResult> {
  const cgId = SYMBOL_TO_CG_ID[symbol.toUpperCase()];

  // Fetch all sources in parallel
  const [fearGreed, trendingIds, coinData] = await Promise.all([
    fetchFearGreed(),
    fetchTrendingIds(),
    cgId ? fetchCoinCommunityData(cgId) : Promise.resolve({ communityScore: 50, votesUpPct: 50 }),
  ]);

  // Trending check
  const isTrending = cgId ? trendingIds.includes(cgId) : false;
  const trendingRank = isTrending ? trendingIds.indexOf(cgId) + 1 : null;

  // ── Composite sentiment score ────────────────────────────────────────────────
  // Weights:
  //   Fear & Greed:      40% (market-wide macro sentiment)
  //   Votes Up %:        35% (coin-specific community sentiment)
  //   Community Score:   15% (engagement level)
  //   Trending bonus:    10% (viral/momentum factor)

  const fgNormalized = fearGreed.value; // already 0–100
  const votesNormalized = coinData.votesUpPct; // 0–100
  const communityNormalized = coinData.communityScore; // 0–100
  const trendingBonus = isTrending ? (trendingRank && trendingRank <= 5 ? 100 : 70) : 50;

  const sentimentScore = Math.round(
    fgNormalized * 0.40 +
    votesNormalized * 0.35 +
    communityNormalized * 0.15 +
    trendingBonus * 0.10
  );

  const sentimentBias: "bullish" | "bearish" | "neutral" =
    sentimentScore >= 60 ? "bullish" :
    sentimentScore <= 40 ? "bearish" : "neutral";

  const sentimentLabel =
    sentimentScore >= 75 ? "Very Bullish" :
    sentimentScore >= 60 ? "Bullish" :
    sentimentScore >= 45 ? "Neutral" :
    sentimentScore >= 30 ? "Bearish" : "Very Bearish";

  return {
    fearGreedValue: fearGreed.value,
    fearGreedLabel: fearGreed.label,
    isTrending,
    trendingRank,
    communityScore: coinData.communityScore,
    sentimentVotesUpPct: coinData.votesUpPct,
    sentimentScore,
    sentimentBias,
    sentimentLabel,
  };
}

/**
 * Fetch Fear & Greed only (lightweight, for tools that don't need per-coin data).
 */
export async function fetchFearGreedIndex(): Promise<{ value: number; label: string }> {
  return fetchFearGreed();
}

/**
 * Get a directional score contribution from sentiment (0–100, 50=neutral).
 * Used directly in scoring engines.
 */
export function sentimentToScore(sentiment: SentimentResult): number {
  return sentiment.sentimentScore;
}
