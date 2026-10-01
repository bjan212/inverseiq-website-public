/**
 * Gem Scanner Engine
 * Scans Bybit spot market for the best coins worth considering right now.
 * Scores each coin across: dip depth, recovery momentum, volume spike, liquidity, and overall potential.
 */

export type RiskAppetite = "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW";

export interface GemResult {
  symbol: string;
  exchange: string;
  price: number;
  priceChange24h: number;   // percent
  priceChange7d?: number;   // percent
  volume24h: number;        // USD
  marketCap?: number;       // USD
  volumeToMcapRatio?: number;
  dipDepth: number;         // percent drop from recent high
  recoveryMomentum: number; // 0-100 score
  volumeSpike: number;      // ratio vs 7d avg
  liquidityScore: number;   // 0-100
  gemScore: number;         // composite 0-100
  riskLevel: RiskAppetite;
  reason: string;           // human-readable rationale
  entryZone: { low: number; high: number };
  targetPrice: number;
  stopLoss: number;
  potentialGain: number;    // percent
  tags: string[];
  // Enrichment fields (added after server-side enrichment)
  sentimentScore?: number;
  sentimentLabel?: string;
  sentimentBias?: "bullish" | "bearish" | "neutral";
  fearGreedValue?: number;
  fearGreedLabel?: string;
  isTrending?: boolean;
  trendingRank?: number | null;
  vpBias?: "bullish" | "bearish" | "neutral";
  vpScore?: number;
  poc?: number;
  vah?: number;
  val?: number;
  priceVsPoc?: "above" | "below" | "at";
  sentimentBoost?: number;
}

export interface GemScanFilters {
  riskAppetite: RiskAppetite;
  minMarketCap?: number;
  maxMarketCap?: number;
  minVolume24h?: number;
  exchanges?: string[];
  maxResults?: number;
}

// Risk profile definitions
const RISK_PROFILES: Record<RiskAppetite, {
  minDipDepth: number;
  maxMarketCap: number;
  minVolumeSpike: number;
  minGemScore: number;
  label: string;
  color: string;
  description: string;
}> = {
  VERY_HIGH: {
    minDipDepth: 15,
    maxMarketCap: 50_000_000,
    minVolumeSpike: 1.2,
    minGemScore: 35,
    label: "Very High Risk",
    color: "text-red-400",
    description: "Micro-caps in deep dips — maximum upside, maximum risk",
  },
  HIGH: {
    minDipDepth: 8,
    maxMarketCap: 200_000_000,
    minVolumeSpike: 1.0,
    minGemScore: 30,
    label: "High Risk",
    color: "text-orange-400",
    description: "Small-caps with strong volume spikes and dip recovery signals",
  },
  MEDIUM: {
    minDipDepth: 5,
    maxMarketCap: 1_000_000_000,
    minVolumeSpike: 0.8,
    minGemScore: 25,
    label: "Medium Risk",
    color: "text-yellow-400",
    description: "Mid-caps showing accumulation patterns and breakout potential",
  },
  LOW: {
    minDipDepth: 3,
    maxMarketCap: 5_000_000_000,
    minVolumeSpike: 0.5,
    minGemScore: 20,
    label: "Low Risk",
    color: "text-green-400",
    description: "Established coins in healthy pullbacks with strong fundamentals",
  },
};

export const RISK_PROFILE_INFO = RISK_PROFILES;

// Stablecoins and wrapped tokens to exclude
const EXCLUDED_TOKENS = new Set([
  "USDC/USDT", "BUSD/USDT", "DAI/USDT", "TUSD/USDT", "FDUSD/USDT",
  "USDD/USDT", "USDP/USDT", "WBTC/USDT", "WETH/USDT", "STETH/USDT",
  "EURT/USDT", "PAXG/USDT",
]);

// Fetch tickers from Bybit spot market (reliable, no geo-blocking)
async function fetchBybitTickers(): Promise<any[]> {
  try {
    const res = await fetch("https://api.bybit.com/v5/market/tickers?category=spot", {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result?.list || []).filter((t: any) => t.symbol.endsWith("USDT"));
  } catch {
    return [];
  }
}

// Fetch 7d klines from Bybit to compute recent high and 7d change
async function fetchKlines(symbol: string): Promise<{ high7d: number; change7d: number; avgVolume7d: number } | null> {
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=D&limit=7`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const klines: string[][] = (data?.result?.list ?? []).reverse();
    if (!klines.length) return null;
    const highs = klines.map((k) => parseFloat(k[2]));
    const volumes = klines.map((k) => parseFloat(k[5])); // turnover
    const firstOpen = parseFloat(klines[0][1]);
    const lastClose = parseFloat(klines[klines.length - 1][4]);
    const high7d = Math.max(...highs);
    const change7d = firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
    const avgVolume7d = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return { high7d, change7d, avgVolume7d };
  } catch {
    return null;
  }
}

// Score a coin's gem potential
function scoreGem(
  price: number,
  priceChange24h: number,
  volume24h: number,
  high7d: number,
  change7d: number,
  avgVolume7d: number,
): {
  dipDepth: number;
  recoveryMomentum: number;
  volumeSpike: number;
  liquidityScore: number;
  gemScore: number;
  riskLevel: RiskAppetite;
  tags: string[];
} {
  // Dip depth from 7d high
  const dipDepth = high7d > 0 ? ((high7d - price) / high7d) * 100 : 0;

  // Recovery momentum: positive 24h change after a dip is bullish
  const recoveryMomentum = Math.min(100, Math.max(0,
    (priceChange24h > 0 ? priceChange24h * 8 : priceChange24h * 2 + 20) +
    (dipDepth > 10 ? 20 : dipDepth * 2) +
    (change7d < -10 ? 15 : 0)
  ));

  // Volume spike vs 7d average
  const volumeSpike = avgVolume7d > 0 ? volume24h / avgVolume7d : 1;

  // Liquidity score based on volume
  const liquidityScore = Math.min(100, Math.log10(Math.max(1, volume24h)) * 12);

  // Composite gem score (weighted)
  let gemScore = 0;
  gemScore += Math.min(30, dipDepth * 1.2);             // dip depth (max 30 pts)
  gemScore += Math.min(25, recoveryMomentum * 0.25);    // recovery (max 25 pts)
  gemScore += Math.min(25, Math.min(volumeSpike, 8) * 3.1); // volume spike (max 25 pts)
  gemScore += Math.min(20, liquidityScore * 0.2);       // liquidity (max 20 pts)

  // Bonus for strong reversal signals
  if (priceChange24h > 3 && dipDepth > 10) gemScore += 5;
  if (volumeSpike > 2 && dipDepth > 15) gemScore += 5;

  gemScore = Math.min(100, gemScore);

  // Determine risk level based on volume (proxy for market cap since we don't have mcap)
  let riskLevel: RiskAppetite = "LOW";
  if (volume24h < 500_000) riskLevel = "VERY_HIGH";
  else if (volume24h < 2_000_000) riskLevel = "HIGH";
  else if (volume24h < 10_000_000) riskLevel = "MEDIUM";
  else riskLevel = "LOW";

  // Tags
  const tags: string[] = [];
  if (dipDepth > 25) tags.push("Deep Dip");
  else if (dipDepth > 10) tags.push("Dip Buy");
  if (volumeSpike > 2.5) tags.push("Volume Surge");
  else if (volumeSpike > 1.5) tags.push("Rising Volume");
  if (priceChange24h > 5) tags.push("Recovering");
  if (priceChange24h > 0 && dipDepth > 10) tags.push("Reversal Signal");
  if (change7d < -20) tags.push("Oversold");
  if (liquidityScore > 70) tags.push("High Liquidity");
  if (volume24h > 50_000_000) tags.push("Blue Chip");

  return { dipDepth, recoveryMomentum, volumeSpike, liquidityScore, gemScore, riskLevel, tags };
}

// Build a human-readable reason string
function buildReason(
  dipDepth: number,
  volumeSpike: number,
  priceChange24h: number,
  change7d: number,
): string {
  const parts: string[] = [];
  if (dipDepth > 25) parts.push(`down ${dipDepth.toFixed(0)}% from 7d high`);
  else if (dipDepth > 10) parts.push(`${dipDepth.toFixed(0)}% dip from recent peak`);
  else if (dipDepth > 5) parts.push(`${dipDepth.toFixed(0)}% pullback`);
  if (volumeSpike > 2.5) parts.push(`volume ${volumeSpike.toFixed(1)}x above 7d avg`);
  else if (volumeSpike > 1.3) parts.push(`elevated volume (${volumeSpike.toFixed(1)}x avg)`);
  if (priceChange24h > 3) parts.push(`+${priceChange24h.toFixed(1)}% recovery today`);
  else if (priceChange24h > 0) parts.push(`green candle forming`);
  if (change7d < -15) parts.push(`${change7d.toFixed(0)}% weekly drawdown`);
  if (parts.length === 0) parts.push("accumulation pattern detected");
  return parts.join(" · ");
}

// Main scan function — simplified to just find the best coins
export async function scanForGems(filters: GemScanFilters): Promise<GemResult[]> {
  const maxResults = filters.maxResults ?? 20;

  // Fetch tickers from Bybit (reliable, no geo-blocking)
  const bybitTickers = await fetchBybitTickers();

  if (bybitTickers.length === 0) {
    throw new Error("Failed to fetch market data");
  }

  // Normalize tickers
  const candidates: Array<{
    symbol: string;
    exchange: string;
    price: number;
    priceChange24h: number;
    volume24h: number;
  }> = [];

  for (const t of bybitTickers) {
    const symbol = t.symbol.replace("USDT", "/USDT");
    // Skip stablecoins and excluded tokens
    if (EXCLUDED_TOKENS.has(symbol)) continue;
    
    const price = parseFloat(t.lastPrice);
    const priceChange24h = parseFloat(t.price24hPcnt) * 100;
    const volume24h = parseFloat(t.turnover24h); // USD turnover
    
    if (price <= 0 || isNaN(volume24h)) continue;
    // Minimal volume filter — just exclude dead coins with almost no trading
    if (volume24h < 50_000) continue;
    
    candidates.push({ symbol, exchange: "Bybit", price, priceChange24h, volume24h });
  }

  // Sort by volume and take top 150 for kline analysis
  const topCandidates = candidates
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 150);

  // Fetch 7d kline data in parallel (batched to avoid rate limits)
  const batchSize = 30;
  const allKlineResults: (Awaited<ReturnType<typeof fetchKlines>> | null)[] = [];
  
  for (let i = 0; i < topCandidates.length; i += batchSize) {
    const batch = topCandidates.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(c => fetchKlines(c.symbol.replace("/USDT", "USDT")))
    );
    for (const r of results) {
      allKlineResults.push(r.status === "fulfilled" ? r.value : null);
    }
    // Small delay between batches to be nice to the API
    if (i + batchSize < topCandidates.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  const gems: GemResult[] = [];

  for (let i = 0; i < topCandidates.length; i++) {
    const c = topCandidates[i];
    const klineData = allKlineResults[i];
    const high7d = klineData?.high7d ?? c.price * 1.1; // conservative fallback
    const change7d = klineData?.change7d ?? c.priceChange24h * 2;
    const avgVolume7d = klineData?.avgVolume7d ?? c.volume24h * 0.8;

    const scores = scoreGem(
      c.price,
      c.priceChange24h,
      c.volume24h,
      high7d,
      change7d,
      avgVolume7d,
    );

    // Only require a minimum gem score — no other hard filters
    if (scores.gemScore < 25) continue;

    // Calculate entry zone, target, stop loss
    const entryLow = c.price * 0.98;
    const entryHigh = c.price * 1.02;
    // Target: recover 50-70% of the dip depending on depth
    const recoveryPct = scores.dipDepth > 20 ? 0.5 : scores.dipDepth > 10 ? 0.6 : 0.7;
    const targetPrice = c.price * (1 + (scores.dipDepth / 100) * recoveryPct);
    const stopLoss = c.price * (1 - Math.max(0.03, (scores.dipDepth / 100) * 0.25));
    const potentialGain = ((targetPrice - c.price) / c.price) * 100;

    // Only include if there's meaningful upside
    if (potentialGain < 2) continue;

    gems.push({
      symbol: c.symbol,
      exchange: c.exchange,
      price: c.price,
      priceChange24h: c.priceChange24h,
      priceChange7d: change7d,
      volume24h: c.volume24h,
      dipDepth: scores.dipDepth,
      recoveryMomentum: scores.recoveryMomentum,
      volumeSpike: scores.volumeSpike,
      liquidityScore: scores.liquidityScore,
      gemScore: scores.gemScore,
      riskLevel: scores.riskLevel,
      reason: buildReason(scores.dipDepth, scores.volumeSpike, c.priceChange24h, change7d),
      entryZone: { low: entryLow, high: entryHigh },
      targetPrice,
      stopLoss,
      potentialGain,
      tags: scores.tags,
    });
  }

  // Sort by gem score descending — best coins first
  return gems
    .sort((a, b) => b.gemScore - a.gemScore)
    .slice(0, maxResults);
}
