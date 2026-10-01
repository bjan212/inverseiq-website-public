/**
 * signalEngine.ts
 *
 * Enhanced signal engine that mirrors the AiSetupFinder's proven approach:
 * - Always produces a signal (guaranteed fallback like MomentumRSI)
 * - Multi-source data: klines + long/short ratio + OI + order book + funding + CVD
 * - Composite scoring: technicals (RSI/MACD/EMA/BB) + microstructure + volatility
 * - Scans top N coins by volume, picks the highest composite score
 *
 * Data sources (all Bybit public API — no geo-block):
 *   /v5/market/kline           — OHLCV candles
 *   /v5/market/account-ratio   — long/short ratio
 *   /v5/market/open-interest   — open interest history
 *   /v5/market/orderbook       — order book depth (bid/ask imbalance)
 *   /v5/market/tickers         — funding rate + mark price + 24h volume
 *   /v5/market/recent-trade    — recent trades for CVD approximation
 */

import axios from "axios";
import { applyPrivatePatternAdjustment } from "../../shared/personalPatternEvidence";
import { calculateEvidenceConfidence } from "../../shared/signalConfidence";
import { scoreMicrostructureEvidence } from "../../shared/microstructureEvidence";
import {
  deriveCandleVolumeFlowStrength,
  deriveOpenInterestTrend,
  type DirectionalFlowBias,
} from "../../shared/hyperliquidMicrostructure";
import { scoreStrictHyperliquidMicrostructure } from "../../shared/strictHyperliquidMicrostructure";
import { computeVolumeProfile, type VolumeProfileResult } from "./volumeProfile";
import { fetchSocialSentiment, type SentimentResult } from "./socialSentiment";
import { runAccuracyAnalysis, type AccuracyAnalysis } from "./accuracyEngine";
import { generateFeatures } from "./featureEngine";
import { predictSignal } from "./mlEngine";
import { rankSignalsByEvidence, selectSignalForStrategy, type BestCoinStrategyPreference } from "./strategyPreference";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignalResult {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp2: number;
  riskReward: number;
  confidence: number;                // 0–100
  compositeScore: number;            // raw weighted score
  technicalScore: number;
  microstructureScore: number;
  volatilityScore: number;
  atr1h: number;
  rsi: number;
  macdSignal: "bullish" | "bearish" | "neutral";
  bbPosition: number;                // 0=lower band, 100=upper band
  fundingRate: number;
  longShortRatio: number;            // >1 = more longs, <1 = more shorts
  oiTrend: "rising" | "falling" | "stable";
  cvdBias: "buy" | "sell" | "neutral";
  /** Strict Hyperliquid uses a labelled OHLCV flow proxy, not exchange-native CVD. */
  microstructureFlowSource?: "candle_volume_proxy" | "native_cvd";
  /** Strict Hyperliquid only: bounded strength of the labelled 1m candle-flow proxy. */
  candleFlowStrength?: number;
  /** Strict Hyperliquid only: cached relative OI move; null means no prior valid sample. */
  openInterestRelativeChange?: number | null;
  orderBookImbalance: number;        // -1 to +1 (positive = more bids)
  keyReason: string;
  confluenceFactors: string[];
  patternType: string;
  listedOn: string[];
  validityMinutes: number;
  // Volume Profile
  poc: number;
  vah: number;
  val: number;
  vpBias: "bullish" | "bearish" | "neutral";
  vpScore: number;
  priceVsPoc: "above" | "below" | "at";
  // Social Sentiment
  sentimentScore: number;
  sentimentLabel: string;
  sentimentBias: "bullish" | "bearish" | "neutral";
  fearGreedValue: number;
  fearGreedLabel: string;
  isTrending: boolean;
  trendingRank: number | null;
  // Accuracy Engine
  entryQualityScore: number;
  entryQualityLabel: string;
  marketStructureTrend: string;
  liquiditySweep: boolean;
  fvgDetected: boolean;
  rsiDivergence: string | null;
  adx: number;
  vwapSignal: string;
  candlePattern: string;
  nearFibLevel: boolean;
  accuracyFactors: string[];
  // ML Engine
  mlConfidence?: number;           // 0-1 ML model confidence
  mlDirection?: "LONG" | "SHORT"; // ML model predicted direction
  mlModelVersion?: number;         // ML model version used
  mlAgreement?: boolean;           // Whether ML agrees with rule-based direction
  /** Execution safety metadata; automatic trading must only act on eligible signals. */
  technicalDirection?: "LONG" | "SHORT";
  microstructureDirection?: "LONG" | "SHORT";
  directionsAgree?: boolean;
  isExecutionEligible?: boolean;
  /** Evidence-ranking model; this score is not a promised win probability. */
  confidenceModel?: "evidence-confluence-v5-hl-microstructure-continuous";
  confidenceCalibratedProbability?: false;
  rawEvidenceScore?: number;
}

export interface ScanResult {
  best: SignalResult;
  runnerUps: Array<{ symbol: string; score: number; direction: "LONG" | "SHORT"; rsi: number; volatility: number }>;
  strategySelection: {
    requested: BestCoinStrategyPreference;
    applied: boolean;
    label: string;
    note: string;
  };
  attemptedCount: number;
  scannedCount: number;
  unavailableCount: number;
  exchangeCounts: Record<string, number>;
  scanDurationMs: number;
}

export function buildScanCoverageTelemetry(
  attemptedCount: number,
  scannedCount: number,
): Pick<ScanResult, "attemptedCount" | "scannedCount" | "unavailableCount"> {
  const attempted = Math.max(0, Math.trunc(attemptedCount));
  const scanned = Math.max(0, Math.min(attempted, Math.trunc(scannedCount)));
  return {
    attemptedCount: attempted,
    scannedCount: scanned,
    unavailableCount: attempted - scanned,
  };
}

/**
 * Determines whether a signal is strong enough for unattended execution. This is
 * deliberately stricter than display eligibility: the engine may surface a setup
 * to a user, but automation needs agreement across independent signal layers.
 */
export function isAutoTraderExecutionEligible(signal: Pick<SignalResult,
  "direction" | "technicalDirection" | "microstructureDirection" | "directionsAgree" |
  "technicalScore" | "microstructureScore" | "entryQualityLabel" |
  "marketStructureTrend" | "riskReward"
>): boolean {
  const directionsAgree = signal.directionsAgree
    ?? (signal.technicalDirection === signal.microstructureDirection);
  const trendAligned = (signal.direction === "LONG" && signal.marketStructureTrend !== "downtrend")
    || (signal.direction === "SHORT" && signal.marketStructureTrend !== "uptrend");

  return directionsAgree
    && signal.technicalScore >= 65
    && signal.microstructureScore >= 60
    && ["A+", "A"].includes(signal.entryQualityLabel)
    && signal.marketStructureTrend !== "ranging"
    && trendAligned
    && signal.riskReward >= 1.8;
}

// ─── Exchange API helpers ─────────────────────────────────────────────────────
// OKX is primary (no geo-block). Bybit is fallback for local dev.

const BYBIT = "https://api.bybit.com";
const OKX   = "https://www.okx.com";
const TIMEOUT = 8000;

async function okxGet(path: string, params: Record<string, string | number> = {}) {
  const r = await axios.get(`${OKX}${path}`, {
    params,
    timeout: TIMEOUT,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0)" },
  });
  return r.data;
}

async function bybitGet(path: string, params: Record<string, string | number> = {}) {
  const r = await axios.get(`${BYBIT}${path}`, {
    params,
    timeout: TIMEOUT,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0)" },
  });
  return r.data;
}

// Convert BTCUSDT → BTC-USDT-SWAP for OKX
function toOkxInstId(symbol: string): string {
  const base = symbol.replace(/USDT$/, '');
  return `${base}-USDT-SWAP`;
}

// ─── Candle fetch ─────────────────────────────────────────────────────────────

interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BYBIT_INTERVAL: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D",
};

const OKX_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D",
};

async function fetchCandlesOKX(symbol: string, interval: string, limit = 150): Promise<Candle[]> {
  try {
    const instId = toOkxInstId(symbol);
    const bar = OKX_INTERVAL[interval] ?? "1H";
    const d = await okxGet("/api/v5/market/candles", { instId, bar, limit });
    const list: string[][] = (d?.data ?? []).reverse();
    if (list.length < 10) return [];
    return list.map(c => ({
      ts: Number(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  } catch {
    return [];
  }
}

async function fetchCandlesBybit(symbol: string, interval: string, limit = 150): Promise<Candle[]> {
  try {
    const d = await bybitGet("/v5/market/kline", {
      category: "linear", symbol, interval: BYBIT_INTERVAL[interval] ?? "60", limit,
    });
    const list: string[][] = (d?.result?.list ?? []).reverse();
    if (list.length < 10) return [];
    return list.map(c => ({
      ts: Number(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  } catch {
    return [];
  }
}

// ─── Hyperliquid native candle API (always works, no geo-block) ──────────────

const HL_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
};

interface HLMicrostructureSnapshot {
  fundingRate: number;
  oiTrend: "rising" | "falling" | "stable";
  oiRelativeChange: number | null;
  orderBookImbalance: number;
  candleFlowBias: DirectionalFlowBias;
  candleFlowStrength: number;
}

interface HLCachedMarketContext {
  fetchedAt: number;
  fundingByCoin: Map<string, number>;
  oiTrendByCoin: Map<string, "rising" | "falling" | "stable">;
  oiRelativeChangeByCoin: Map<string, number | null>;
}

let hlMarketContextCache: HLCachedMarketContext | null = null;
let hlMarketContextInFlight: Promise<HLCachedMarketContext> | null = null;
let hlPreviousOpenInterestByCoin = new Map<string, number>();
const HL_MARKET_CONTEXT_TTL_MS = 60 * 1000;

async function getHyperliquidMarketContext(): Promise<HLCachedMarketContext> {
  if (hlMarketContextCache && Date.now() - hlMarketContextCache.fetchedAt < HL_MARKET_CONTEXT_TTL_MS) {
    return hlMarketContextCache;
  }
  if (hlMarketContextInFlight) return hlMarketContextInFlight;

  hlMarketContextInFlight = axios.post("https://api.hyperliquid.xyz/info", { type: "metaAndAssetCtxs" }, {
    headers: { "Content-Type": "application/json" }, timeout: 10000,
  }).then(response => {
    const [meta, contexts] = response.data as [{ universe?: Array<{ name: string }> }, Array<{ funding?: string; openInterest?: string }>];
    const fundingByCoin = new Map<string, number>();
    const oiTrendByCoin = new Map<string, "rising" | "falling" | "stable">();
    const oiRelativeChangeByCoin = new Map<string, number | null>();
    const currentOpenInterestByCoin = new Map<string, number>();
    (meta?.universe ?? []).forEach((asset, index) => {
      const coin = asset.name.toUpperCase();
      fundingByCoin.set(coin, parseFloat(contexts?.[index]?.funding ?? "0") || 0);
      const currentOpenInterest = parseFloat(contexts?.[index]?.openInterest ?? "");
      const previousOpenInterest = hlPreviousOpenInterestByCoin.get(coin);
      oiTrendByCoin.set(coin, deriveOpenInterestTrend(previousOpenInterest, currentOpenInterest));
      oiRelativeChangeByCoin.set(
        coin,
        Number.isFinite(previousOpenInterest) && (previousOpenInterest ?? 0) > 0
          && Number.isFinite(currentOpenInterest) && currentOpenInterest > 0
          ? (currentOpenInterest - previousOpenInterest!) / previousOpenInterest!
          : null,
      );
      if (Number.isFinite(currentOpenInterest) && currentOpenInterest > 0) {
        currentOpenInterestByCoin.set(coin, currentOpenInterest);
      }
    });
    hlPreviousOpenInterestByCoin = currentOpenInterestByCoin;
    hlMarketContextCache = {
      fetchedAt: Date.now(), fundingByCoin, oiTrendByCoin, oiRelativeChangeByCoin,
    };
    return hlMarketContextCache;
  }).catch(() => hlMarketContextCache ?? {
    fetchedAt: 0,
    fundingByCoin: new Map<string, number>(),
    oiTrendByCoin: new Map<string, "rising" | "falling" | "stable">(),
    oiRelativeChangeByCoin: new Map<string, number | null>(),
  })
    .finally(() => { hlMarketContextInFlight = null; });

  return hlMarketContextInFlight;
}

/**
 * Fetch execution-venue microstructure for auto-trader scans. Hyperliquid does
 * not provide a native long/short account ratio, so unknown inputs remain neutral
 * rather than being silently substituted with another venue's data.
 */
async function fetchHyperliquidMicrostructure(symbol: string, confirmationCandles: Candle[]): Promise<HLMicrostructureSnapshot> {
  const coin = symbol.replace(/USDT$|USDC$|USD$/, "");
  try {
    const [marketContext, bookResponse] = await Promise.all([
      getHyperliquidMarketContext(),
      axios.post("https://api.hyperliquid.xyz/info", { type: "l2Book", coin }, {
        headers: { "Content-Type": "application/json" }, timeout: 10000,
      }),
    ]);

    const normalizedCoin = coin.toUpperCase();
    const fundingRate = marketContext.fundingByCoin.get(normalizedCoin) ?? 0;
    const candleFlow = deriveCandleVolumeFlowStrength(confirmationCandles);
    const levels: [[{ px: string; sz: string }[]], [{ px: string; sz: string }[]]] | any = bookResponse.data?.levels ?? [];
    const bids = levels?.[0] ?? [];
    const asks = levels?.[1] ?? [];
    const bidNotional = bids.reduce((total: number, level: { px: string; sz: string }) => total + parseFloat(level.px) * parseFloat(level.sz), 0);
    const askNotional = asks.reduce((total: number, level: { px: string; sz: string }) => total + parseFloat(level.px) * parseFloat(level.sz), 0);
    const denominator = bidNotional + askNotional;
    return {
      fundingRate,
      oiTrend: marketContext.oiTrendByCoin.get(normalizedCoin) ?? "stable",
      oiRelativeChange: marketContext.oiRelativeChangeByCoin.get(normalizedCoin) ?? null,
      orderBookImbalance: denominator > 0 ? (bidNotional - askNotional) / denominator : 0,
      candleFlowBias: candleFlow.direction,
      candleFlowStrength: candleFlow.strength,
    };
  } catch {
    // An unavailable venue-native input must remain neutral, not fabricated.
    return {
      fundingRate: 0, oiTrend: "stable", oiRelativeChange: null,
      orderBookImbalance: 0, candleFlowBias: "neutral", candleFlowStrength: 0,
    };
  }
}

async function fetchCandlesHL(symbol: string, interval: string, limit = 150): Promise<Candle[]> {
  try {
    const coin = symbol.replace(/USDT$|USDC$|USD$/, "");
    const hlInterval = HL_INTERVAL[interval] ?? "1h";
    // Calculate startTime: go back enough candles
    const intervalMs: Record<string, number> = {
      "1m": 60_000, "5m": 300_000, "15m": 900_000,
      "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
    };
    const msPerCandle = intervalMs[interval] ?? 3_600_000;
    const startTime = Date.now() - (limit + 5) * msPerCandle;

    const res = await axios.post("https://api.hyperliquid.xyz/info", {
      type: "candleSnapshot",
      req: { coin, interval: hlInterval, startTime },
    }, { headers: { "Content-Type": "application/json" }, timeout: 12000 });

    const data: Array<{ t: number; o: string; h: string; l: string; c: string; v: string }> = res.data ?? [];
    if (data.length < 10) return [];
    // Take last `limit` candles, sorted by time ascending
    const sorted = data.sort((a, b) => a.t - b.t).slice(-limit);
    return sorted.map(c => ({
      ts: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
  } catch {
    return [];
  }
}

// Primary: OKX. Fallback 1: Bybit. Fallback 2: Hyperliquid native.
async function fetchCandles(symbol: string, interval: string, limit = 150, strictHyperliquid = false): Promise<Candle[]> {
  if (strictHyperliquid) {
    // Execution on Hyperliquid must be based on the same venue's market data.
    // Do not silently substitute a CEX candle series for a live HL order.
    return fetchCandlesHL(symbol, interval, limit);
  }
  const okx = await fetchCandlesOKX(symbol, interval, limit);
  if (okx.length >= 10) return okx;
  const bybit = await fetchCandlesBybit(symbol, interval, limit);
  if (bybit.length >= 10) return bybit;
  return fetchCandlesHL(symbol, interval, limit);
}

// ─── Technical indicators ─────────────────────────────────────────────────────

function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) ema.push(data[i] * k + ema[i - 1] * (1 - k));
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 2) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = changes.slice(0, period).filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  let avgLoss = changes.slice(0, period).filter(c => c < 0).map(c => -c).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
  }
  return 100 - 100 / (1 + avgGain / (avgLoss || 0.0001));
}

function calcMACD(closes: number[]): { histogram: number; signal: "bullish" | "bearish" | "neutral" } {
  if (closes.length < 35) return { histogram: 0, signal: "neutral" };
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]).slice(26);
  const signalLine = calcEMA(macdLine, 9);
  const histogram = macdLine.slice(9).map((v, i) => v - signalLine[i]);
  const last = histogram[histogram.length - 1];
  const prev = histogram[histogram.length - 2] ?? 0;
  const signal = last > 0 && last > prev ? "bullish" : last < 0 && last < prev ? "bearish" : "neutral";
  return { histogram: last, signal };
}

function calcBBPosition(closes: number[], period = 20): number {
  if (closes.length < period) return 50;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const current = closes[closes.length - 1];
  if (upper === lower) return 50;
  return Math.max(0, Math.min(100, ((current - lower) / (upper - lower)) * 100));
}

function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return (candles[candles.length - 1]?.close ?? 0) * 0.02;
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trSum += tr;
  }
  return trSum / period;
}

function calcVolatilityPct(closes: number[], period = 20): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  return Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period) / mean * 100;
}

// ─── Microstructure data ──────────────────────────────────────────────────────

async function fetchLongShortRatio(symbol: string): Promise<number> {
  // OKX long/short ratio (top traders)
  try {
    const instId = toOkxInstId(symbol);
    const d = await okxGet("/api/v5/rubik/stat/contracts/long-short-account-ratio-contract-top-trader", {
      instId, period: "1H", limit: "3",
    });
    const list: { longShortRatio: string }[] = d?.data ?? [];
    if (list.length) return parseFloat(list[0].longShortRatio ?? "1") || 1;
  } catch { /* fall through */ }
  // Bybit fallback
  try {
    const d = await bybitGet("/v5/market/account-ratio", {
      category: "linear", symbol, period: "1h", limit: 3,
    });
    const list = d?.result?.list ?? [];
    if (!list.length) return 1;
    const latest = list[0];
    const buy = parseFloat(latest.buyRatio ?? "0.5");
    const sell = parseFloat(latest.sellRatio ?? "0.5");
    return sell > 0 ? buy / sell : 1;
  } catch {
    return 1;
  }
}

async function fetchOITrend(symbol: string): Promise<{ trend: "rising" | "falling" | "stable"; oi: number }> {
  // OKX OI history
  try {
    const instId = toOkxInstId(symbol);
    const d = await okxGet("/api/v5/rubik/stat/contracts/open-interest-history", {
      instId, period: "1H", limit: "5",
    });
    const list: string[][] = d?.data ?? [];
    if (list.length >= 2) {
      const newest = parseFloat(list[0][1]);
      const oldest = parseFloat(list[list.length - 1][1]);
      const pctChange = (newest - oldest) / (oldest || 1) * 100;
      const trend = pctChange > 1.5 ? "rising" : pctChange < -1.5 ? "falling" : "stable";
      return { trend, oi: newest };
    }
  } catch { /* fall through */ }
  // Bybit fallback
  try {
    const d = await bybitGet("/v5/market/open-interest", {
      category: "linear", symbol, intervalTime: "1h", limit: 5,
    });
    const list: { openInterest: string; timestamp: string }[] = d?.result?.list ?? [];
    if (list.length < 2) return { trend: "stable", oi: 0 };
    const newest = parseFloat(list[0].openInterest);
    const oldest = parseFloat(list[list.length - 1].openInterest);
    const pctChange = (newest - oldest) / (oldest || 1) * 100;
    const trend = pctChange > 1.5 ? "rising" : pctChange < -1.5 ? "falling" : "stable";
    return { trend, oi: newest };
  } catch {
    return { trend: "stable", oi: 0 };
  }
}

async function fetchOrderBookImbalance(symbol: string): Promise<number> {
  // OKX order book
  try {
    const instId = toOkxInstId(symbol);
    const d = await okxGet("/api/v5/market/books", { instId, sz: "25" });
    const bids: string[][] = d?.data?.[0]?.bids ?? [];
    const asks: string[][] = d?.data?.[0]?.asks ?? [];
    const bidVol = bids.reduce((s, c) => s + parseFloat(c[1]), 0);
    const askVol = asks.reduce((s, c) => s + parseFloat(c[1]), 0);
    const total = bidVol + askVol;
    if (total === 0) return 0;
    return (bidVol - askVol) / total;
  } catch { /* fall through */ }
  // Bybit fallback
  try {
    const d = await bybitGet("/v5/market/orderbook", {
      category: "linear", symbol, limit: 25,
    });
    const bids: [string, string][] = d?.result?.b ?? [];
    const asks: [string, string][] = d?.result?.a ?? [];
    const bidVol = bids.reduce((s, [, qty]) => s + parseFloat(qty), 0);
    const askVol = asks.reduce((s, [, qty]) => s + parseFloat(qty), 0);
    const total = bidVol + askVol;
    if (total === 0) return 0;
    return (bidVol - askVol) / total;
  } catch {
    return 0;
  }
}

async function fetchCVDBias(symbol: string): Promise<"buy" | "sell" | "neutral"> {
  // OKX recent trades
  try {
    const instId = toOkxInstId(symbol);
    const d = await okxGet("/api/v5/market/trades", { instId, limit: "200" });
    const trades: { side: string; sz: string }[] = d?.data ?? [];
    let buyVol = 0, sellVol = 0;
    for (const t of trades) {
      const sz = parseFloat(t.sz);
      if (t.side === "buy") buyVol += sz;
      else sellVol += sz;
    }
    const total = buyVol + sellVol;
    if (total > 0) {
      const ratio = buyVol / total;
      return ratio > 0.55 ? "buy" : ratio < 0.45 ? "sell" : "neutral";
    }
  } catch { /* fall through */ }
  // Bybit fallback
  try {
    const d = await bybitGet("/v5/market/recent-trade", {
      category: "linear", symbol, limit: 200,
    });
    const trades: { side: string; size: string }[] = d?.result?.list ?? [];
    let buyVol = 0, sellVol = 0;
    for (const t of trades) {
      const sz = parseFloat(t.size);
      if (t.side === "Buy") buyVol += sz;
      else sellVol += sz;
    }
    const total = buyVol + sellVol;
    if (total === 0) return "neutral";
    const ratio = buyVol / total;
    return ratio > 0.55 ? "buy" : ratio < 0.45 ? "sell" : "neutral";
  } catch {
    return "neutral";
  }
}

async function fetchFundingRate(symbol: string): Promise<number> {
  // OKX funding rate
  try {
    const instId = toOkxInstId(symbol);
    const d = await okxGet("/api/v5/public/funding-rate", { instId });
    const item = d?.data?.[0];
    if (item) return parseFloat(item.fundingRate || "0");
  } catch { /* fall through */ }
  // Bybit fallback
  try {
    const d = await bybitGet("/v5/market/tickers", { category: "linear", symbol });
    const item = d?.result?.list?.[0];
    return item ? parseFloat(item.fundingRate || "0") : 0;
  } catch {
    return 0;
  }
}

// ─── Core scoring ─────────────────────────────────────────────────────────────

interface CoinAnalysis {
  symbol: string;
  candles1h: Candle[];
  candles15m: Candle[];
  rsi: number;
  macd: { histogram: number; signal: "bullish" | "bearish" | "neutral" };
  bbPos: number;
  ema20: number;
  ema50: number;
  atr: number;
  volatilityPct: number;
  fundingRate: number;
  lsRatio: number;
  oiTrend: "rising" | "falling" | "stable";
  oiRelativeChange: number | null;
  cvdBias: "buy" | "sell" | "neutral";
  candleFlowBias: DirectionalFlowBias;
  candleFlowStrength: number;
  microstructureFlowSource: "candle_volume_proxy" | "native_cvd";
  obImbalance: number;
  currentPrice: number;
  _primaryTf: string;
  _strictHyperliquid: boolean;
  // Volume Profile
  vp: VolumeProfileResult;
  // Social Sentiment
  sentiment: SentimentResult;
  // Accuracy Engine
  accuracy: AccuracyAnalysis | null;
}

// Map primary TF to a secondary (confirmation) TF
function getSecondaryTf(primaryTf: string): string {
  const map: Record<string, string> = {
    "5m": "1m", "15m": "5m", "1h": "15m", "4h": "1h", "1d": "4h",
  };
  return map[primaryTf] ?? "15m";
}

// Map primary TF to candle counts
function getCandleCounts(primaryTf: string): { primary: number; secondary: number } {
  const map: Record<string, { primary: number; secondary: number }> = {
    "5m":  { primary: 120, secondary: 60 },
    "15m": { primary: 100, secondary: 60 },
    "1h":  { primary: 100, secondary: 60 },
    "4h":  { primary: 80,  secondary: 60 },
    "1d":  { primary: 60,  secondary: 30 },
  };
  return map[primaryTf] ?? { primary: 100, secondary: 60 };
}

async function analyzeCoin(symbol: string, primaryTf = "1h", strictHyperliquid = false): Promise<CoinAnalysis | null> {
  const secondaryTf = getSecondaryTf(primaryTf);
  const counts = getCandleCounts(primaryTf);
  try {
    const [candles1h, candles15m] = await Promise.all([
      fetchCandles(symbol, primaryTf, counts.primary, strictHyperliquid),
      fetchCandles(symbol, secondaryTf, counts.secondary, strictHyperliquid),
    ]);

    if (candles1h.length < 30 || candles15m.length < 20) return null;

    const closes1h = candles1h.map(c => c.close);
    const closes15m = candles15m.map(c => c.close);

    const rsi = calcRSI(closes15m, 14);
    const macd = calcMACD(closes15m);
    const bbPos = calcBBPosition(closes15m, 20);
    const ema20Arr = calcEMA(closes1h, 20);
    const ema50Arr = calcEMA(closes1h, 50);
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];
    const atr = calcATR(candles1h, 14);
    const volatilityPct = calcVolatilityPct(closes1h, 20);
    const currentPrice = candles15m[candles15m.length - 1].close;

    // Use the execution venue's market data for HL auto-trader scans. Display-only
    // scans retain multi-exchange enrichment for broad market coverage.
    const [microstructure, sentiment] = await Promise.all([
      strictHyperliquid
        ? fetchHyperliquidMicrostructure(symbol, candles15m).then(snapshot => ({
            ...snapshot,
            lsRatio: 1,
            cvdBias: "neutral" as const,
            microstructureFlowSource: "candle_volume_proxy" as const,
          }))
        : Promise.all([
            fetchFundingRate(symbol),
            fetchLongShortRatio(symbol),
            fetchOITrend(symbol),
            fetchCVDBias(symbol),
            fetchOrderBookImbalance(symbol),
          ]).then(([fundingRate, lsRatio, oi, cvdBias, orderBookImbalance]) => ({
            fundingRate, lsRatio, oiTrend: oi.trend, cvdBias,
            oiRelativeChange: null,
            candleFlowBias: "neutral" as const,
            candleFlowStrength: 0,
            microstructureFlowSource: "native_cvd" as const,
            orderBookImbalance,
          })),
      fetchSocialSentiment(symbol),
    ]);
    const fundingRate = microstructure.fundingRate;
    const lsRatio = microstructure.lsRatio;
    const oiTrend = microstructure.oiTrend;
    const oiRelativeChange = microstructure.oiRelativeChange;
    const cvdBias = microstructure.cvdBias;
    const candleFlowBias = microstructure.candleFlowBias;
    const candleFlowStrength = microstructure.candleFlowStrength;
    const microstructureFlowSource = microstructure.microstructureFlowSource;
    const obImbalance = microstructure.orderBookImbalance;

    // Volume Profile — computed from candles (no extra API call)
    const vp = computeVolumeProfile(candles1h, 50);

    return {
      symbol, candles1h, candles15m,
      rsi, macd, bbPos, ema20, ema50, atr, volatilityPct,
      fundingRate, lsRatio, oiTrend, oiRelativeChange, cvdBias, candleFlowBias, candleFlowStrength,
      microstructureFlowSource, obImbalance, currentPrice,
      _primaryTf: primaryTf, _strictHyperliquid: strictHyperliquid,
      vp, sentiment, accuracy: null,
    };
  } catch {
    return null;
  }
}

function scoreDirection(a: CoinAnalysis): {
  direction: "LONG" | "SHORT";
  technicalDirection: "LONG" | "SHORT";
  microstructureDirection: "LONG" | "SHORT";
  directionsAgree: boolean;
  technicalScore: number;
  microstructureScore: number;
  volatilityScore: number;
  compositeScore: number;
  confluenceFactors: string[];
  patternType: string;
} {
  let bullTech = 0, bearTech = 0;
  let bullMicro = 0, bearMicro = 0;
  const factors: string[] = [];

  // ── Technical layer (weight 0.55) ────────────────────────────────────────

  // RSI — strong signal when extreme
  if (a.rsi < 30) { bullTech += 3; factors.push(`RSI Oversold (${a.rsi.toFixed(1)})`); }
  else if (a.rsi < 42) { bullTech += 2; factors.push(`RSI Bearish Zone (${a.rsi.toFixed(1)})`); }
  else if (a.rsi > 70) { bearTech += 3; factors.push(`RSI Overbought (${a.rsi.toFixed(1)})`); }
  else if (a.rsi > 58) { bearTech += 2; factors.push(`RSI Bullish Zone (${a.rsi.toFixed(1)})`); }
  else if (a.rsi < 50) { bullTech += 1; factors.push(`RSI Neutral-Low (${a.rsi.toFixed(1)})`); }
  else { bearTech += 1; factors.push(`RSI Neutral-High (${a.rsi.toFixed(1)})`); }

  // MACD
  if (a.macd.signal === "bullish") { bullTech += 2; factors.push("MACD Bullish Momentum"); }
  else if (a.macd.signal === "bearish") { bearTech += 2; factors.push("MACD Bearish Momentum"); }
  else { if (a.macd.histogram >= 0) bullTech += 1; else bearTech += 1; factors.push("MACD Neutral"); }

  // Bollinger Band position
  if (a.bbPos < 15) { bullTech += 3; factors.push(`BB Extreme Oversold (${a.bbPos.toFixed(0)}%)`); }
  else if (a.bbPos < 35) { bullTech += 2; factors.push(`BB Below Mean (${a.bbPos.toFixed(0)}%)`); }
  else if (a.bbPos > 85) { bearTech += 3; factors.push(`BB Extreme Overbought (${a.bbPos.toFixed(0)}%)`); }
  else if (a.bbPos > 65) { bearTech += 2; factors.push(`BB Above Mean (${a.bbPos.toFixed(0)}%)`); }
  else { if (a.bbPos < 50) bullTech += 1; else bearTech += 1; factors.push(`BB Mid Zone (${a.bbPos.toFixed(0)}%)`); }

  // EMA trend
  if (a.ema20 > a.ema50) { bullTech += 2; factors.push("EMA20 > EMA50 (Uptrend)"); }
  else { bearTech += 2; factors.push("EMA20 < EMA50 (Downtrend)"); }

  // Price vs EMA20
  if (a.currentPrice > a.ema20) { bullTech += 1; factors.push("Price Above EMA20"); }
  else { bearTech += 1; factors.push("Price Below EMA20"); }

  const totalTech = bullTech + bearTech || 1;
  const techDirection: "LONG" | "SHORT" = bullTech >= bearTech ? "LONG" : "SHORT";
  const technicalScore = Math.round((Math.max(bullTech, bearTech) / totalTech) * 100);

  // ── Microstructure layer (weight 0.35) ────────────────────────────────────
  // Strict Hyperliquid scans use continuous strengths from the very same L2
  // book, 1m confirmation candles, funding and cached OI context. Broad
  // display scans retain their existing generic discrete evidence model.
  let microEvidence: { direction: "LONG" | "SHORT" | null; score: number };
  if (a._strictHyperliquid) {
    const strict = scoreStrictHyperliquidMicrostructure({
      technicalDirection: techDirection,
      orderBookImbalance: a.obImbalance,
      candleFlow: { direction: a.candleFlowBias, strength: a.candleFlowStrength },
      fundingRate: a.fundingRate,
      openInterestRelativeChange: a.oiRelativeChange,
    });
    const strictScale = 6 / 100;
    if (strict.direction === "LONG") {
      bullMicro = strict.alignedStrength * strictScale;
      bearMicro = strict.opposingStrength * strictScale;
    } else if (strict.direction === "SHORT") {
      bearMicro = strict.alignedStrength * strictScale;
      bullMicro = strict.opposingStrength * strictScale;
    }
    if (strict.components.orderBook > 0) {
      factors.push(`L2 ${a.obImbalance >= 0 ? "Bid" : "Ask"} Strength ${Math.round(strict.components.orderBook)}/50`);
    }
    if (strict.components.candleFlow > 0) {
      factors.push(`1m Candle-Flow Proxy ${a.candleFlowBias} ${Math.round(strict.components.candleFlow)}/35`);
    }
    if (strict.components.funding > 0) {
      factors.push(`Funding Contrarian Strength ${Math.round(strict.components.funding)}/10`);
    }
    if (strict.components.openInterest > 0) {
      factors.push(`OI Rising (Technical Direction Confirming) ${Math.round(strict.components.openInterest)}/5`);
    } else if (a.oiTrend === "falling") {
      factors.push("OI Falling (Neutral Exhaustion Context)");
    }
    microEvidence = strict;
  } else {
    // Long/short ratio — contrarian: too many longs = bearish, too many shorts = bullish
    if (a.lsRatio < 0.7) { bullMicro += 2; factors.push(`L/S Ratio ${a.lsRatio.toFixed(2)} (Crowd Short → Bullish)`); }
    else if (a.lsRatio < 0.9) { bullMicro += 1; factors.push(`L/S Ratio ${a.lsRatio.toFixed(2)} (Slightly Short)`); }
    else if (a.lsRatio > 1.4) { bearMicro += 2; factors.push(`L/S Ratio ${a.lsRatio.toFixed(2)} (Crowd Long → Bearish)`); }
    else if (a.lsRatio > 1.1) { bearMicro += 1; factors.push(`L/S Ratio ${a.lsRatio.toFixed(2)} (Slightly Long)`); }

    // OI trend — a material rising snapshot confirms the existing direction.
    if (a.oiTrend === "rising") {
      if (techDirection === "LONG") bullMicro += 1; else bearMicro += 1;
      factors.push("OI Rising (Trend Confirming)");
    } else if (a.oiTrend === "falling") {
      factors.push("OI Falling (Possible Reversal)");
    }

    if (a.cvdBias === "buy") { bullMicro += 2; factors.push("CVD Buy Pressure"); }
    else if (a.cvdBias === "sell") { bearMicro += 2; factors.push("CVD Sell Pressure"); }

    if (a.obImbalance > 0.15) { bullMicro += 2; factors.push(`Order Book Bid Heavy (+${(a.obImbalance * 100).toFixed(0)}%)`); }
    else if (a.obImbalance < -0.15) { bearMicro += 2; factors.push(`Order Book Ask Heavy (${(a.obImbalance * 100).toFixed(0)}%)`); }

    const fundingPct = a.fundingRate * 100;
    if (fundingPct < -0.02) { bullMicro += 2; factors.push(`Funding Negative (${fundingPct.toFixed(4)}% → Short Pressure)`); }
    else if (fundingPct > 0.04) { bearMicro += 2; factors.push(`Funding High (${fundingPct.toFixed(4)}% → Long Pressure)`); }
    else if (fundingPct > 0.02) { bearMicro += 1; factors.push(`Funding Elevated (${fundingPct.toFixed(4)}%)`); }
    else { factors.push(`Funding Neutral (${fundingPct.toFixed(4)}%)`); }
    microEvidence = scoreMicrostructureEvidence(bullMicro, bearMicro, false);
  }
  // Preserve the existing non-null SignalResult shape, but a missing/tied
  // microstructure direction must explicitly fail the agreement gate.
  const microDirection: "LONG" | "SHORT" = microEvidence.direction
    ?? (techDirection === "LONG" ? "SHORT" : "LONG");
  const microstructureScore = microEvidence.score;
  const directionsAgree = microEvidence.direction !== null && techDirection === microEvidence.direction;

  // ── Volatility layer (weight 0.10) ────────────────────────────────────────
  // Ideal volatility: 0.5–3% for clean entries; too low = no move, too high = risky
  const volScore = a.volatilityPct >= 0.3 && a.volatilityPct <= 4.0
    ? Math.round(70 + Math.min(30, a.volatilityPct * 8))
    : a.volatilityPct > 4.0 ? 40 : 20;

  // ── Final direction: tech (55%) + micro (35%) + vol (10%) ─────────────────
  // ── Volume Profile layer (weight 0.10) ────────────────────────────────────
  let bullVP = 0, bearVP = 0;
  if (a.vp.vpBias === "bullish") { bullVP += 2; factors.push(`VP Bullish (price ${a.vp.priceVsPoc} POC)`); }
  else if (a.vp.vpBias === "bearish") { bearVP += 2; factors.push(`VP Bearish (price ${a.vp.priceVsPoc} POC)`); }
  if (a.vp.priceVsPoc === "above") { bullVP += 1; }
  else if (a.vp.priceVsPoc === "below") { bearVP += 1; }

  // ── Social Sentiment layer (weight 0.10) ──────────────────────────────────
  let bullSent = 0, bearSent = 0;
  if (a.sentiment.sentimentBias === "bullish") {
    bullSent += a.sentiment.sentimentScore >= 70 ? 3 : 2;
    factors.push(`Sentiment Bullish (${a.sentiment.sentimentLabel}, F&G: ${a.sentiment.fearGreedValue})`);
  } else if (a.sentiment.sentimentBias === "bearish") {
    bearSent += a.sentiment.sentimentScore <= 30 ? 3 : 2;
    factors.push(`Sentiment Bearish (${a.sentiment.sentimentLabel}, F&G: ${a.sentiment.fearGreedValue})`);
  }
  if (a.sentiment.isTrending) {
    if (techDirection === "LONG") bullSent += 1;
    else bearSent += 1;
    factors.push(`Trending #${a.sentiment.trendingRank} on CoinGecko`);
  }

  // ── Final direction: tech (45%) + micro (30%) + VP (10%) + sentiment (10%) + vol (5%)
  const bullComposite = bullTech * 0.45 + bullMicro * 0.30 + bullVP * 0.10 + bullSent * 0.10;
  const bearComposite = bearTech * 0.45 + bearMicro * 0.30 + bearVP * 0.10 + bearSent * 0.10;
  const direction: "LONG" | "SHORT" = bullComposite >= bearComposite ? "LONG" : "SHORT";

  const dominantComposite = Math.max(bullComposite, bearComposite);
  const totalComposite = bullComposite + bearComposite || 1;
  const compositeScore = Math.round(
    (dominantComposite / totalComposite) * 65 +  // direction strength
    (volScore / 100) * 10 +                       // volatility quality
    (technicalScore / 100) * 15 +                 // technical clarity
    (a.vp.vpScore / 100) * 5 +                    // VP conviction
    (a.sentiment.sentimentScore / 100) * 5        // sentiment conviction
  );

  // Pattern type label
  let patternType = "Momentum RSI";
  if (a.rsi < 30 || a.rsi > 70) patternType = "RSI Extreme";
  else if (a.bbPos < 15 || a.bbPos > 85) patternType = "Bollinger Squeeze";
  else if (a.macd.signal !== "neutral" && (a.ema20 > a.ema50) === (direction === "LONG")) patternType = "MACD + EMA Confluence";
  else if (Math.abs(a.obImbalance) > 0.2) patternType = "Order Book Imbalance";
  else if (a._strictHyperliquid && a.candleFlowBias !== "neutral") patternType = "1m Candle Flow";
  else if (a.cvdBias !== "neutral") patternType = "CVD Divergence";

  return {
    direction,
    technicalDirection: techDirection,
    microstructureDirection: microDirection,
    directionsAgree,
    technicalScore,
    microstructureScore,
    volatilityScore: volScore,
    compositeScore,
    confluenceFactors: factors,
    patternType,
  };
}

function buildSignal(a: CoinAnalysis, scored: ReturnType<typeof scoreDirection>): SignalResult {
  const { direction, technicalDirection, microstructureDirection, directionsAgree, technicalScore, microstructureScore, volatilityScore, compositeScore, confluenceFactors, patternType } = scored;

  const atr = a.atr;
  const price = a.currentPrice;

  // ATR-based TP/SL — tighter for higher volatility
  const atrMult = a.volatilityPct > 2.5 ? 1.2 : 1.5;
  const tpMult = a.volatilityPct > 2.5 ? 2.0 : 3.0;
  const tp2Mult = tpMult * 1.5;

  const stopLoss = direction === "LONG" ? price - atr * atrMult : price + atr * atrMult;
  const takeProfit = direction === "LONG" ? price + atr * tpMult : price - atr * tpMult;
  const tp2 = direction === "LONG" ? price + atr * tp2Mult : price - atr * tp2Mult;
  const riskReward = Math.abs(takeProfit - price) / Math.abs(price - stopLoss);

  // Accuracy engine — run on primary candles with final direction
  const accuracy = a.accuracy ?? runAccuracyAnalysis(a.candles1h, direction);
  const isExecutionEligible = isAutoTraderExecutionEligible({
    direction,
    technicalDirection,
    microstructureDirection,
    directionsAgree,
    technicalScore,
    microstructureScore,
    entryQualityLabel: accuracy.entryQualityLabel,
    marketStructureTrend: accuracy.marketStructure.trend,
    riskReward,
  });
  const confidenceResult = calculateEvidenceConfidence({
    compositeScore,
    technicalScore,
    microstructureScore,
    volatilityScore,
    entryQualityScore: accuracy.entryQualityScore,
    entryQualityLabel: accuracy.entryQualityLabel,
    directionsAgree,
    isExecutionEligible,
  });
  const confidence = confidenceResult.confidence;

  // Signal validity: based on primary TF and volatility
  const tfBaseMinutes: Record<string, number> = {
    "5m": 30, "15m": 60, "1h": 120, "4h": 480, "1d": 1440,
  };
  const tfBase = tfBaseMinutes[a._primaryTf ?? "1h"] ?? 120;
  const validityMinutes = a.volatilityPct > 3 ? Math.round(tfBase * 0.5) : a.volatilityPct > 1.5 ? tfBase : Math.round(tfBase * 2);

  // Key reason
  const topFactors = confluenceFactors.slice(0, 3);
  const sentimentNote = a.sentiment.sentimentBias !== "neutral"
    ? ` Sentiment ${a.sentiment.sentimentLabel} (F&G: ${a.sentiment.fearGreedValue}).`
    : "";
  const vpNote = a.vp.vpBias !== "neutral"
    ? ` VP: price ${a.vp.priceVsPoc} POC (${a.vp.vpBias}).`
    : "";
  const flowReason = a._strictHyperliquid
    ? (a.candleFlowBias !== "neutral" ? `1m candle-flow proxy shows ${a.candleFlowBias} pressure. ` : "")
    : (a.cvdBias !== "neutral" ? `CVD shows ${a.cvdBias} pressure. ` : "");
  const keyReason = `${direction === "LONG" ? "Bullish" : "Bearish"} confluence: ${topFactors.join(", ")}. ${
    flowReason
  }${Math.abs(a.obImbalance) > 0.1 ? `Order book ${a.obImbalance > 0 ? "bid" : "ask"} heavy. ` : ""}${sentimentNote}${vpNote}`;

  const decimals = price > 1000 ? 2 : price > 10 ? 3 : price > 1 ? 4 : 6;
  const round = (n: number) => parseFloat(n.toFixed(decimals));

  return {
    symbol: a.symbol,
    direction,
    entryPrice: round(price),
    stopLoss: round(stopLoss),
    takeProfit: round(takeProfit),
    tp2: round(tp2),
    riskReward: parseFloat(riskReward.toFixed(2)),
    confidence,
    compositeScore,
    technicalScore,
    microstructureScore,
    volatilityScore,
    atr1h: parseFloat(atr.toFixed(decimals)),
    rsi: parseFloat(a.rsi.toFixed(1)),
    macdSignal: a.macd.signal,
    bbPosition: parseFloat(a.bbPos.toFixed(1)),
    fundingRate: a.fundingRate,
    longShortRatio: parseFloat(a.lsRatio.toFixed(3)),
    oiTrend: a.oiTrend,
    cvdBias: a.cvdBias,
    microstructureFlowSource: a.microstructureFlowSource,
    candleFlowStrength: a._strictHyperliquid ? parseFloat(a.candleFlowStrength.toFixed(3)) : undefined,
    openInterestRelativeChange: a._strictHyperliquid ? a.oiRelativeChange : undefined,
    orderBookImbalance: parseFloat(a.obImbalance.toFixed(3)),
    keyReason: keyReason.trim(),
    confluenceFactors: [...confluenceFactors, ...accuracy.accuracyFactors],
    patternType: accuracy.candlePattern.name !== "No Pattern" ? accuracy.candlePattern.name : patternType,
    listedOn: a._strictHyperliquid ? ["hyperliquid"] : ["bybit"], validityMinutes,
    // Volume Profile
    poc: a.vp.poc,
    vah: a.vp.vah,
    val: a.vp.val,
    vpBias: a.vp.vpBias,
    vpScore: a.vp.vpScore,
    priceVsPoc: a.vp.priceVsPoc,
    // Social Sentiment
    sentimentScore: a.sentiment.sentimentScore,
    sentimentLabel: a.sentiment.sentimentLabel,
    sentimentBias: a.sentiment.sentimentBias,
    fearGreedValue: a.sentiment.fearGreedValue,
    fearGreedLabel: a.sentiment.fearGreedLabel,
    isTrending: a.sentiment.isTrending,
    trendingRank: a.sentiment.trendingRank,
    // Accuracy Engine
    entryQualityScore: accuracy.entryQualityScore,
    entryQualityLabel: accuracy.entryQualityLabel,
    marketStructureTrend: accuracy.marketStructure.trend,
    liquiditySweep: accuracy.liquiditySweep.detected,
    fvgDetected: accuracy.fvg.detected,
    rsiDivergence: accuracy.rsiDivergence.detected ? accuracy.rsiDivergence.type : null,
    adx: accuracy.adx.adx,
    vwapSignal: accuracy.vwap.signal,
    candlePattern: accuracy.candlePattern.name,
    nearFibLevel: accuracy.fibonacci.nearFib,
    accuracyFactors: accuracy.accuracyFactors,
    technicalDirection,
    microstructureDirection,
    directionsAgree,
    isExecutionEligible,
    confidenceModel: confidenceResult.model,
    confidenceCalibratedProbability: confidenceResult.calibratedProbability,
    rawEvidenceScore: confidenceResult.rawEvidenceScore,
  };
}

// ─── Top symbols ──────────────────────────────────────────────────────────────

const CORE_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT",
  "MATICUSDT", "NEARUSDT", "APTUSDT", "SUIUSDT", "ARBUSDT",
  "OPUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "WIFUSDT",
];

async function getTopSymbols(n = 20): Promise<string[]> {
  // OKX: get top USDT-SWAP pairs by USD turnover
  try {
    const d = await okxGet("/api/v5/market/tickers", { instType: "SWAP" });
    const list: { instId: string; volCcy24h: string; last: string }[] = d?.data ?? [];
    const sorted = list
      .filter(t => t.instId.endsWith("-USDT-SWAP"))
      .sort((a, b) => {
        const aVol = parseFloat(a.volCcy24h || "0") * parseFloat(a.last || "1");
        const bVol = parseFloat(b.volCcy24h || "0") * parseFloat(b.last || "1");
        return bVol - aVol;
      })
      .slice(0, n)
      .map(t => t.instId.replace("-USDT-SWAP", "USDT")); // BTC-USDT-SWAP → BTCUSDT
    if (sorted.length >= 10) return sorted;
  } catch { /* fall through to Bybit */ }
  // Bybit fallback
  try {
    const d = await bybitGet("/v5/market/tickers", { category: "linear" });
    const list: { symbol: string; turnover24h: string }[] = d?.result?.list ?? [];
    const sorted = list
      .filter(t => t.symbol.endsWith("USDT") && !t.symbol.includes("-"))
      .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
      .slice(0, n)
      .map(t => t.symbol);
    if (sorted.length >= 10) return sorted;
  } catch { /* fall through */ }
  return CORE_SYMBOLS.slice(0, n);
}

// ─── Main scan function ───────────────────────────────────────────────────────

// ─── Inverse Protocol Types ─────────────────────────────────────────────────

export interface UserSymbolPatternInput {
  symbol: string;
  confidenceAdjustment: number;   // -25 to +25
  action: 'BOOST' | 'SUPPRESS' | 'NEUTRAL';
  winRate: number;
  wins: number;
  losses: number;
  bias: string;
  summary: string;
}

export interface UserInversePatternInput {
  patternType: 'LONG_FAILURE' | 'SHORT_FAILURE' | 'FOMO_ENTRY' | 'PANIC_SELL';
  confidence: number;
  action: 'INVERT_LONG' | 'INVERT_SHORT' | 'WAIT';
}

export interface UserPatternsInput {
  symbolPatterns?: UserSymbolPatternInput[];
  globalPatterns?: UserInversePatternInput[];
}

/**
 * Apply inverse protocol adjustments to a signal result.
 * Symbol-level adjustments are applied first (more specific),
 * then global directional patterns provide an additional layer.
 */
function applyInverseProtocol(
  signal: SignalResult,
  patterns: UserPatternsInput
): SignalResult & { inverseRationale: string; symbolRationale: string } {
  let confidence = signal.confidence;
  let direction = signal.direction;
  let inverseRationale = '';
  let symbolRationale = '';

  const normSym = signal.symbol.toUpperCase().replace(/[/\-.:]/, '').replace(/PERP$/, '').replace(/\.P$/, '');

  // 1. Symbol-level adjustment (most specific)
  if (patterns.symbolPatterns && patterns.symbolPatterns.length > 0) {
    const sp = patterns.symbolPatterns
      .filter(p => p.symbol.toUpperCase() === normSym)
      .sort((a, b) => a.confidenceAdjustment - b.confidenceAdjustment)[0];
    if (sp && sp.action !== 'NEUTRAL') {
      const adj = sp.confidenceAdjustment;
      confidence = applyPrivatePatternAdjustment(confidence, adj);
      symbolRationale = `${Math.min(0, adj)}pts: Private ${sp.symbol} history (${sp.wins}W/${sp.losses}L) is used only as a conservative suppression filter.`;
    }
  }

  // 2. Global directional pattern (INVERT_LONG / INVERT_SHORT)
  if (patterns.globalPatterns && patterns.globalPatterns.length > 0) {
    // Personal execution history is not independent market evidence: suppress risk,
    // but never flip direction or promote a signal into the execution band.
    const invertPattern = patterns.globalPatterns.find(p =>
      (direction === 'LONG' && p.action === 'INVERT_LONG') ||
      (direction === 'SHORT' && p.action === 'INVERT_SHORT')
    );
    if (invertPattern && invertPattern.confidence >= 70) {
      confidence = applyPrivatePatternAdjustment(confidence, -3);
      inverseRationale = `Private risk filter: ${invertPattern.confidence}% failure evidence reduced confidence; market direction was not flipped.`;
    }
  }

  // Recalculate TP/SL if direction was flipped
  let entryPrice = signal.entryPrice;
  let stopLoss = signal.stopLoss;
  let takeProfit = signal.takeProfit;
  let tp2 = signal.tp2;
  if (direction !== signal.direction) {
    const atr = signal.atr1h;
    const price = entryPrice;
    const atrMult = 1.5;
    const tpMult = 3.0;
    stopLoss = direction === 'LONG' ? price - atr * atrMult : price + atr * atrMult;
    takeProfit = direction === 'LONG' ? price + atr * tpMult : price - atr * tpMult;
    tp2 = direction === 'LONG' ? price + atr * tpMult * 1.5 : price - atr * tpMult * 1.5;
  }

  return {
    ...signal,
    direction,
    confidence: Math.round(confidence),
    stopLoss,
    takeProfit,
    tp2,
    inverseRationale,
    symbolRationale,
  };
}

export async function runSignalScan(topN = 20, primaryTf = "1h", userPatterns?: UserPatternsInput, customSymbols?: string[], strictHyperliquid = false, strategyPreference: BestCoinStrategyPreference = "ai_best_pick"): Promise<ScanResult> {
  const startMs = Date.now();

  const symbols = customSymbols ?? await getTopSymbols(topN);

  // Analyze coins in batches of 5 to avoid rate limits
  const BATCH = 5;
  const analyses: CoinAnalysis[] = [];

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(s => analyzeCoin(s, primaryTf, strictHyperliquid)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) analyses.push(r.value);
    }
    // Small delay between batches
    if (i + BATCH < symbols.length) await new Promise(res => setTimeout(res, 200));
  }

  // Score all coins
  const scored = analyses.map(a => ({
    analysis: a,
    scored: scoreDirection(a),
  }));

  // Sort by composite score descending
  scored.sort((a, b) => b.scored.compositeScore - a.scored.compositeScore);

  // Best signal
  const best = scored[0];
  if (!best) {
    // Absolute fallback: use BTC with basic MomentumRSI logic
    const btcCandles = await fetchCandles("BTCUSDT", primaryTf, 100);
    const closes = btcCandles.map(c => c.close);
    const rsi = calcRSI(closes, 14);
    const direction: "LONG" | "SHORT" = rsi < 50 ? "LONG" : "SHORT";
    // Get live BTC price from OKX if candles failed
    let price = btcCandles[btcCandles.length - 1]?.close ?? 0;
    if (!price) {
      try {
        const td = await okxGet("/api/v5/market/ticker", { instId: "BTC-USDT-SWAP" });
        price = parseFloat(td?.data?.[0]?.last ?? "0");
      } catch { /* price stays 0 */ }
    }
    const atr = calcATR(btcCandles, 14);
    return {
      best: {
        symbol: "BTCUSDT", direction, entryPrice: price,
        stopLoss: direction === "LONG" ? price - atr * 1.5 : price + atr * 1.5,
        takeProfit: direction === "LONG" ? price + atr * 3 : price - atr * 3,
        tp2: direction === "LONG" ? price + atr * 4.5 : price - atr * 4.5,
        riskReward: 2, confidence: 60, compositeScore: 60,
        technicalScore: 60, microstructureScore: 50, volatilityScore: 60,
        atr1h: atr, rsi, macdSignal: "neutral", bbPosition: 50,
        fundingRate: 0, longShortRatio: 1, oiTrend: "stable",
        cvdBias: "neutral", orderBookImbalance: 0,
        keyReason: "BTC fallback signal — momentum RSI direction",
        confluenceFactors: [`RSI ${rsi.toFixed(1)}`],
        patternType: "Momentum RSI Fallback",
        listedOn: ["bybit"], validityMinutes: 120,
        poc: price, vah: price * 1.01, val: price * 0.99,
        vpBias: "neutral" as const, vpScore: 50, priceVsPoc: "at" as const,
        sentimentScore: 50, sentimentLabel: "Neutral", sentimentBias: "neutral" as const,
        fearGreedValue: 50, fearGreedLabel: "Neutral", isTrending: false, trendingRank: null,
        entryQualityScore: 50, entryQualityLabel: "C", marketStructureTrend: "ranging",
        liquiditySweep: false, fvgDetected: false, rsiDivergence: null,
        adx: 20, vwapSignal: "neutral", candlePattern: "No Pattern",
        nearFibLevel: false, accuracyFactors: [],
      },
      runnerUps: [],
      strategySelection: {
        requested: strategyPreference,
        applied: strategyPreference === "ai_best_pick",
        label: strategyPreference === "momentum_rsi" ? "AI Best Pick (Momentum RSI Preference Unavailable)" : "AI Best Pick (5-Layer Confluence)",
        note: "Fallback scan returned the conservative server default; no Momentum RSI candidate set was available.",
      },
      ...buildScanCoverageTelemetry(symbols.length, 0),
      exchangeCounts: { bybit: 0 },
      scanDurationMs: Date.now() - startMs,
    };
  }

  // The raw confluence leader can be a counter-trend or low-quality setup. Prefer
  // the strongest candidate that independently passes the execution-quality gate;
  // if none pass, still return the leader for display but mark it ineligible.
  const candidates = scored.map(candidate => buildSignal(candidate.analysis, candidate.scored));
  const strategySelection = selectSignalForStrategy(candidates, strategyPreference);
  let bestSignal = strategySelection.signal;

  // ── ML Engine Layer — boost/filter confidence based on trained model ──────
  try {
    const mlFeatures = await generateFeatures(bestSignal.symbol);
    const mlPrediction = await predictSignal(mlFeatures);
    if (mlPrediction) {
      bestSignal.mlConfidence = mlPrediction.confidence;
      bestSignal.mlDirection = mlPrediction.direction;
      bestSignal.mlModelVersion = mlPrediction.modelVersion;
      bestSignal.mlAgreement = mlPrediction.direction === bestSignal.direction;

      // Agreement is recorded but cannot raise confidence until the model has a
      // leakage-resistant out-of-sample calibration record. Disagreement may
      // still reduce confidence after a minimum real-data sample.
      const hasEnoughTraining = mlPrediction.trainingSamples >= 50;
      if (bestSignal.mlAgreement && mlPrediction.confidence > 0.6) {
        bestSignal.confluenceFactors = [
          `ML Model v${mlPrediction.modelVersion} agrees (${(mlPrediction.confidence * 100).toFixed(0)}% raw); confidence not raised pending out-of-sample calibration`,
          ...bestSignal.confluenceFactors,
        ];
      } else if (!bestSignal.mlAgreement && mlPrediction.confidence > 0.65 && hasEnoughTraining) {
        const penalty = Math.round((mlPrediction.confidence - 0.5) * 8); // 0-4 penalty
        bestSignal.confidence = Math.max(55, bestSignal.confidence - penalty);
        bestSignal.confluenceFactors = [
          `ML Model v${mlPrediction.modelVersion} disagrees (${mlPrediction.direction} @ ${(mlPrediction.confidence * 100).toFixed(0)}%)`,
          ...bestSignal.confluenceFactors,
        ];
      } else if (!bestSignal.mlAgreement && !hasEnoughTraining) {
        // Model untrained — log disagreement but don't penalize
        bestSignal.confluenceFactors = [
          `ML Model v${mlPrediction.modelVersion} disagrees but insufficient training (${mlPrediction.trainingSamples} samples)`,
          ...bestSignal.confluenceFactors,
        ];
      }
    }
  } catch (mlErr: any) {
    console.warn("[Signal Engine] ML prediction skipped:", mlErr.message);
  }

  // Apply inverse protocol if user patterns are provided
  if (userPatterns && (userPatterns.symbolPatterns?.length || userPatterns.globalPatterns?.length)) {
    const adjusted = applyInverseProtocol(bestSignal, userPatterns);
    bestSignal = {
      ...adjusted,
      keyReason: adjusted.inverseRationale
        ? `[Inverse Protocol] ${adjusted.inverseRationale} ${bestSignal.keyReason}`
        : adjusted.symbolRationale
        ? `[Personal Edge] ${adjusted.symbolRationale} ${bestSignal.keyReason}`
        : bestSignal.keyReason,
      confluenceFactors: [
        ...(adjusted.inverseRationale ? [`Inverse Protocol: ${adjusted.inverseRationale}`] : []),
        ...(adjusted.symbolRationale ? [`Symbol Pattern: ${adjusted.symbolRationale}`] : []),
        ...bestSignal.confluenceFactors,
      ],
    };
  }

  // Runner-ups must use the same final evidence-score semantics as the primary
  // result. Raw composite scores are intentionally kept out of this list so the
  // UI never compares unlike values (for example, evidence 66 vs raw 90).
  const scoredBySymbol = new Map(scored.map(candidate => [candidate.analysis.symbol, candidate]));
  const runnerUps = rankSignalsByEvidence(candidates)
    .filter(candidate => candidate.symbol !== bestSignal.symbol)
    .slice(0, 3)
    .map(candidate => ({
      symbol: candidate.symbol,
      score: candidate.confidence,
      direction: candidate.direction,
      rsi: parseFloat(candidate.rsi.toFixed(1)),
      volatility: parseFloat((scoredBySymbol.get(candidate.symbol)?.analysis.volatilityPct ?? 0).toFixed(2)),
    }));

  return {
    best: bestSignal,
    runnerUps,
    strategySelection,
    ...buildScanCoverageTelemetry(symbols.length, analyses.length),
    exchangeCounts: { bybit: analyses.length },
    scanDurationMs: Date.now() - startMs,
  };
}

/**
 * Analyze a single specific coin by symbol.
 * Used by the manual scanCoin procedure.
 */
export async function runSingleCoinScan(symbol: string, primaryTf = "1h", userPatterns?: UserPatternsInput): Promise<SignalResult> {
  // Normalize symbol
  const sym = symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").toUpperCase();

  const analysis = await analyzeCoin(sym, primaryTf);

  if (!analysis) {
    // Fallback: minimal signal from OKX ticker (Bybit may be geo-blocked)
    try {
      const instId = toOkxInstId(sym);
      let price = 0;
      try {
        const od = await okxGet("/api/v5/market/ticker", { instId });
        price = parseFloat(od?.data?.[0]?.last ?? "0");
      } catch { /* fall through to Bybit */ }
      if (!price) {
        const bd = await bybitGet("/v5/market/tickers", { category: "linear", symbol: sym });
        price = parseFloat(bd?.result?.list?.[0]?.lastPrice ?? "0");
      }
      const atr = price * 0.02;
      return {
        symbol: sym,
        direction: "LONG",
        entryPrice: price,
        stopLoss: price - atr * 1.5,
        takeProfit: price + atr * 3,
        tp2: price + atr * 4.5,
        riskReward: 2,
        confidence: 60,
        compositeScore: 60,
        technicalScore: 60,
        microstructureScore: 50,
        volatilityScore: 50,
        atr1h: atr,
        rsi: 50,
        macdSignal: "neutral",
        bbPosition: 50,
        fundingRate: 0,
        longShortRatio: 1,
        oiTrend: "stable",
        cvdBias: "neutral",
        orderBookImbalance: 0,
        keyReason: `${sym} — insufficient candle data, using price-only fallback`,
        confluenceFactors: ["Insufficient data"],
        patternType: "Fallback",
        listedOn: ["bybit"],
        validityMinutes: 60,
        poc: price, vah: price * 1.01, val: price * 0.99,
        vpBias: "neutral" as const, vpScore: 50, priceVsPoc: "at" as const,
        sentimentScore: 50, sentimentLabel: "Neutral", sentimentBias: "neutral" as const,
        fearGreedValue: 50, fearGreedLabel: "Neutral", isTrending: false, trendingRank: null,
        entryQualityScore: 50, entryQualityLabel: "C", marketStructureTrend: "ranging",
        liquiditySweep: false, fvgDetected: false, rsiDivergence: null,
        adx: 20, vwapSignal: "neutral", candlePattern: "No Pattern",
        nearFibLevel: false, accuracyFactors: [],
      };
    } catch {
      const price = 0;
      return {
        symbol: sym, direction: "LONG", entryPrice: price,
        stopLoss: 0, takeProfit: 0, tp2: 0, riskReward: 2,
        confidence: 55, compositeScore: 55, technicalScore: 55,
        microstructureScore: 50, volatilityScore: 50, atr1h: 0,
        rsi: 50, macdSignal: "neutral", bbPosition: 50,
        fundingRate: 0, longShortRatio: 1, oiTrend: "stable",
        cvdBias: "neutral", orderBookImbalance: 0,
        keyReason: `${sym} — data unavailable`,
        confluenceFactors: [], patternType: "Fallback",
        listedOn: ["bybit"], validityMinutes: 60,
        poc: 0, vah: 0, val: 0,
        vpBias: "neutral" as const, vpScore: 50, priceVsPoc: "at" as const,
        sentimentScore: 50, sentimentLabel: "Neutral", sentimentBias: "neutral" as const,
        fearGreedValue: 50, fearGreedLabel: "Neutral", isTrending: false, trendingRank: null,
        entryQualityScore: 50, entryQualityLabel: "C", marketStructureTrend: "ranging",
        liquiditySweep: false, fvgDetected: false, rsiDivergence: null,
        adx: 20, vwapSignal: "neutral", candlePattern: "No Pattern",
        nearFibLevel: false, accuracyFactors: [],
      };
    }
  }

  const scored = scoreDirection(analysis);
  let signal = buildSignal(analysis, scored);

  // ── ML Engine Layer — boost/filter confidence based on trained model ──────
  try {
    const mlFeatures = await generateFeatures(sym);
    const mlPrediction = await predictSignal(mlFeatures);
    if (mlPrediction) {
      signal.mlConfidence = mlPrediction.confidence;
      signal.mlDirection = mlPrediction.direction;
      signal.mlModelVersion = mlPrediction.modelVersion;
      signal.mlAgreement = mlPrediction.direction === signal.direction;

      // Agreement remains diagnostic until leakage-resistant calibration exists;
      // trained disagreement can still reduce confidence conservatively.
      const hasEnoughTraining = mlPrediction.trainingSamples >= 50;
      if (signal.mlAgreement && mlPrediction.confidence > 0.6) {
        signal.confluenceFactors = [
          `ML Model v${mlPrediction.modelVersion} agrees (${(mlPrediction.confidence * 100).toFixed(0)}% raw); confidence not raised pending out-of-sample calibration`,
          ...signal.confluenceFactors,
        ];
      } else if (!signal.mlAgreement && mlPrediction.confidence > 0.65 && hasEnoughTraining) {
        const penalty = Math.round((mlPrediction.confidence - 0.5) * 8);
        signal.confidence = Math.max(55, signal.confidence - penalty);
        signal.confluenceFactors = [
          `ML Model v${mlPrediction.modelVersion} disagrees (${mlPrediction.direction} @ ${(mlPrediction.confidence * 100).toFixed(0)}%)`,
          ...signal.confluenceFactors,
        ];
      } else if (!signal.mlAgreement && !hasEnoughTraining) {
        signal.confluenceFactors = [
          `ML Model v${mlPrediction.modelVersion} disagrees but insufficient training (${mlPrediction.trainingSamples} samples)`,
          ...signal.confluenceFactors,
        ];
      }
    }
  } catch (mlErr: any) {
    console.warn("[Signal Engine] ML prediction skipped:", mlErr.message);
  }

  // Apply inverse protocol if user patterns are provided
  if (userPatterns && (userPatterns.symbolPatterns?.length || userPatterns.globalPatterns?.length)) {
    const adjusted = applyInverseProtocol(signal, userPatterns);
    return {
      ...adjusted,
      keyReason: adjusted.inverseRationale
        ? `[Inverse Protocol] ${adjusted.inverseRationale} ${signal.keyReason}`
        : adjusted.symbolRationale
        ? `[Personal Edge] ${adjusted.symbolRationale} ${signal.keyReason}`
        : signal.keyReason,
      confluenceFactors: [
        ...(adjusted.inverseRationale ? [`Inverse Protocol: ${adjusted.inverseRationale}`] : []),
        ...(adjusted.symbolRationale ? [`Symbol Pattern: ${adjusted.symbolRationale}`] : []),
        ...signal.confluenceFactors,
      ],
    };
  }

  return signal;
}
