/**
 * XRYPT.NET — Live Scanner & Deep Scanner (Tool Set 1)
 *
 * Two modes in one page:
 *
 * AUTO MODE  — "Find Best Trade Now"
 *   AI scans the top 20 USDT-margined perps by 24h volume across Binance Futures,
 *   ranks each by RSI/MACD/BB/funding/OI/sentiment conviction score, and surfaces
 *   the single highest-probability trade to enter RIGHT NOW. Includes runner-up
 *   candidates, multi-timeframe indicators, AI sentiment, validity countdown, and
 *   1-click execute via PreExecutionModal.
 *
 * MANUAL MODE — "Deep Scan a Coin"
 *   User searches any perpetual pair. The engine runs the same full multi-timeframe
 *   analysis (15m/1H/4H/1D RSI, MACD, BB, volume trend, funding rate, OI, ATR) and
 *   returns a directional verdict with entry/TP1/TP2/SL, R:R, validity window, and
 *   AI sentiment badge.
 *
 * All spot trading is handled by the Gem Finder (/gem-finder).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useTrades } from "@/contexts/TradeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Search, X, RefreshCw, AlertTriangle,
  Brain, Activity, ChevronDown, ChevronUp, Clock, Target, ShieldAlert,
  Zap, BarChart2, CheckCircle2, Radar, Crosshair, Layers, Bot,
} from "lucide-react";
import { toast } from "sonner";
import PreExecutionModal, { PreExecutionConfig, OrderSubmitPayload } from "@/components/PreExecutionModal";

// import { SentimentBadge } from "@/components/SentimentBadge"; // dormant — re-enable when needed
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AutoTradesTab from "@/components/AutoTradesTab";

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction  = "LONG" | "SHORT";
type Confidence = "HIGH" | "MEDIUM" | "LOW";
type ScanMode   = "auto" | "manual" | "history" | "autoTrade";

interface ScanResult {
  success: boolean;
  symbol: string;
  currentPrice: number;
  direction: Direction;
  confidence: Confidence;
  confidenceNum?: number; // comparable base evidence score, 55-100
  executionEvidenceScore?: number; // final score after conservative safety adjustments
  isBadEntry: boolean;
  badEntryReason: string | null;
  entry: number | null;
  tp1: number | null;
  tp2: number | null;
  sl: number | null;
  rrTp1: string | null;
  rrTp2: string | null;
  validity: string | null;
  validitySeconds?: number;
  keyReason: string;
  analysis: string;
  indicators: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }[];
  fundingRate: string;
  oiChange: string;
  atr: number;
  error?: string;
  runnerUps?: { symbol: string; direction: Direction; score: number; rsi1h: number }[];
  top20Scanned?: number;
  // Multi-exchange metadata
  listedOnExchanges?: string[];
  bestExchange?: string;
  exchangeCounts?: Record<string, number>;
  totalPairsScanned?: number;
  // New microstructure fields from signalEngine
  longShortRatio?: number;
  cvdBias?: string;
  orderBookImbalance?: number;
  technicalScore?: number;
  microstructureScore?: number;
  volatilityScore?: number;
  patternType?: string;
  confluenceScore?: number;
  // Volume Profile + Sentiment
  vpBias?: string;
  vpScore?: number;
  priceVsPoc?: string;
  sentimentLabel?: string;
  sentimentBias?: string;
  fearGreedValue?: number;
  fearGreedLabel?: string;
  isTrending?: boolean;
  trendingRank?: number | null;
  // Accuracy Engine
  entryQualityScore?: number;
  entryQualityLabel?: string;
  marketStructureTrend?: string;
  liquiditySweep?: boolean;
  fvgDetected?: boolean;
  rsiDivergence?: string | null;
  adx?: number;
  vwapSignal?: string;
  candlePattern?: string;
  nearFibLevel?: boolean;
  accuracyFactors?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const confidenceBadge = (c: Confidence) =>
  c === "HIGH"   ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
  c === "MEDIUM" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"   :
                   "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

const rsiColor = (rsi: number) =>
  rsi >= 70 ? "text-red-400" : rsi <= 30 ? "text-emerald-400" : "text-zinc-300";

function parseValiditySeconds(validity: string | null): number {
  if (!validity) return 4 * 3600;
  const h = validity.match(/(\d+(?:\.\d+)?)\s*h/i);
  const m = validity.match(/(\d+)\s*min/i);
  let secs = 0;
  if (h) secs += parseFloat(h[1]) * 3600;
  if (m) secs += parseInt(m[1]) * 60;
  const range = validity.match(/(\d+)\s*[-–]\s*(\d+)\s*h/i);
  if (range) secs = ((parseInt(range[1]) + parseInt(range[2])) / 2) * 3600;
  return secs > 0 ? secs : 4 * 3600;
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return "EXPIRED";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelRow({ label, price, color, rr }: { label: string; price: number | null; color: string; rr?: string | null }) {
  if (!price) return null;
  // Derive a subtle bg tint from the color class for the row highlight
  const bgTint = color.includes("emerald") ? "bg-emerald-500/5 border-l-2 border-emerald-500/40"
    : color.includes("red") ? "bg-red-500/5 border-l-2 border-red-500/40"
    : "bg-cyan-500/5 border-l-2 border-cyan-500/40";
  return (
    <div className={`flex items-center justify-between px-2 py-2 rounded-md mb-1 last:mb-0 ${bgTint}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold uppercase tracking-widest w-10 ${color}`}>{label}</span>
        {rr && <span className="text-xs text-zinc-500 font-mono">R:R {rr}</span>}
      </div>
      <span className={`font-mono text-sm font-bold ${color}`}>
        ${price < 1 ? price.toFixed(6) : price < 100 ? price.toFixed(4) : price.toFixed(2)}
      </span>
    </div>
  );
}

function IndicatorRow({ tf, rsi, macdBias, bbPos, volTrend }: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 border-b border-zinc-800/30 last:border-0 text-xs">
      <span className="font-mono text-zinc-300 font-bold w-8 shrink-0">{tf}</span>
      <span className="text-zinc-500">RSI <span className={`font-mono font-bold ${rsiColor(rsi)}`}>{rsi}</span></span>
      <span className="text-zinc-500">MACD <span className={macdBias === "bullish" ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{macdBias}</span></span>
      <span className="text-zinc-500">BB <span className="text-zinc-400 font-mono">{bbPos}%</span></span>
      <span className="text-zinc-500">Vol <span className={volTrend === "rising" ? "text-emerald-400 font-bold" : volTrend === "falling" ? "text-red-400 font-bold" : "text-zinc-500"}>{volTrend}</span></span>
    </div>
  );
}

function ValidityCountdown({ validity, validitySeconds, onExpired }: { validity: string | null; validitySeconds?: number; onExpired: () => void }) {
  // Prefer server-computed precise seconds; fall back to parsing the LLM string
  const totalSecs = validitySeconds ?? parseValiditySeconds(validity);
  const [secs, setSecs] = useState(totalSecs);
  const pct = Math.max(0, (secs / totalSecs) * 100);
  const barColor = pct > 60 ? "bg-emerald-500" : pct > 25 ? "bg-yellow-500" : "bg-red-500";
  const textColor = pct > 60 ? "text-emerald-400" : pct > 25 ? "text-yellow-400" : "text-red-400";

  useEffect(() => {
    if (secs <= 0) { onExpired(); return; }
    const t = setInterval(() => setSecs(s => { if (s <= 1) { onExpired(); clearInterval(t); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-zinc-500" />
          <span className="text-xs text-zinc-500 uppercase tracking-widest">Signal Validity</span>
        </div>
        <span className={`font-mono text-sm font-bold ${textColor}`}>{formatCountdown(secs)}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-zinc-600 mt-1">Based on: {validity ?? "4h window"}</p>
    </div>
  );
}

// ─── Runner-up card ───────────────────────────────────────────────────────────
function RunnerUpCard({ r, onSelect }: { r: { symbol: string; direction: Direction; score: number; rsi1h: number }; onSelect: (sym: string) => void }) {
  const isLong = r.direction === "LONG";
  return (
    <button
      onClick={() => onSelect(r.symbol)}
      className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-800/40 transition-all text-left w-full"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold text-white">{r.symbol.replace("USDT", "")}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isLong ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-red-400 border-red-500/30 bg-red-500/5"}`}>
          {isLong ? "▲ LONG" : "▼ SHORT"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-mono ${rsiColor(r.rsi1h)}`}>RSI {r.rsi1h}</span>
        <span className="text-[10px] font-mono text-zinc-500">Base {r.score}/100</span>
        <Search className="w-3 h-3 text-zinc-600" />
      </div>
    </button>
  );
}

// ─── "I Took This Trade" Button ────────────────────────────────────────────────
function ITookThisTradeButton({ result }: { result: ScanResult }) {
  const [taken, setTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const takeTradeMutation = trpc.activeTrades.take.useMutation();

  const handleTakeTrade = async () => {
    if (taken || loading) return;
    setLoading(true);
    try {
      await takeTradeMutation.mutateAsync({
        symbol: result.symbol,
        direction: result.direction,
        entryPrice: String(result.entry!),
        takeProfit: String(result.tp1!),
        stopLoss: String(result.sl!),
        takeProfit2: result.tp2 ? String(result.tp2) : undefined,
        exchange: result.listedOnExchanges?.[0] ?? "bybit",
      });
      setTaken(true);
      toast.success("Trade recorded! Track it in Active Trades.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record trade";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (taken) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-sm font-bold">
        <CheckCircle2 className="w-4 h-4" />
        Trade Recorded — <a href="/active-trades" className="underline hover:text-emerald-300">View Active Trades</a>
      </div>
    );
  }

  return (
    <button
      onClick={handleTakeTrade}
      disabled={loading}
      className="w-full py-3 mt-2 rounded-xl font-bold text-sm tracking-wider transition-all border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/60 disabled:opacity-50"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2"><Activity className="w-4 h-4 animate-spin" /> Recording...</span>
      ) : (
        <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> I TOOK THIS TRADE</span>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveScanner() {
  const { symbolPatterns } = useTrades();

  // Mode
  const [mode, setMode] = useState<ScanMode>("auto");

  // Timeframe selector
  const [selectedTf, setSelectedTf] = useState<"5m" | "15m" | "1h" | "4h" | "1d">("1h");
  const handleTfChange = (tf: "5m" | "15m" | "1h" | "4h" | "1d") => {
    setSelectedTf(tf);
    // Reset results so user knows they need to re-scan for the new TF
    setAutoResult(null);
    setAutoExpired(false);
    setManualResult(null);
    setManualExpired(false);
  };
  const TF_OPTIONS: { value: "5m" | "15m" | "1h" | "4h" | "1d"; label: string; desc: string }[] = [
    { value: "5m",  label: "5m",  desc: "Scalp" },
    { value: "15m", label: "15m", desc: "Short" },
    { value: "1h",  label: "1H",  desc: "Swing" },
    { value: "4h",  label: "4H",  desc: "Position" },
    { value: "1d",  label: "1D",  desc: "Macro" },
  ];

  // Auto mode state
  const [autoResult, setAutoResult] = useState<ScanResult | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoExpired, setAutoExpired] = useState(false);
  const [autoLastUpdated, setAutoLastUpdated] = useState<Date | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Market alerts
  const { data: marketAlertsData } = trpc.marketAlerts.getActive.useQuery(undefined, { refetchInterval: 60_000 });

  // Manual mode state
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualResult, setManualResult] = useState<ScanResult | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualExpired, setManualExpired] = useState(false);
  const [manualLastUpdated, setManualLastUpdated] = useState<Date | null>(null);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Execute modal
  const [execOpen, setExecOpen] = useState(false);
  const [execConfig, setExecConfig] = useState<PreExecutionConfig | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Scan history
  const { data: scanHistoryData, refetch: refetchHistory } = trpc.scanHistory.list.useQuery({ limit: 50 });
  const clearHistoryMutation = trpc.scanHistory.clear.useMutation({ onSuccess: () => { refetchHistory(); toast.success("History cleared"); } });

  // API key availability
  const { data: binanceKeyData } = trpc.binance.hasApiKey.useQuery();
  const { data: bybitKeyData }   = trpc.bybit.hasApiKey.useQuery();
  const { data: okxKeyData }     = trpc.okx.hasApiKey.useQuery();
  const { data: hlKeyData }      = trpc.hyperliquid.hasKey.useQuery();
  const hasBinanceKey = binanceKeyData?.hasKey ?? false;
  const hasBybitKey   = bybitKeyData?.hasKey ?? false;
  const hasOkxKey     = okxKeyData?.hasKey ?? false;
  const hasHlKey      = hlKeyData?.hasKey ?? false;

  // Order placement mutations
  const binancePlaceOrder = trpc.binance.placeOrder.useMutation();
  const bybitPlaceOrder   = trpc.bybit.placeOrder.useMutation();
  const okxPlaceOrder     = trpc.okx.placeOrder.useMutation();
  const hlPlaceOrder      = trpc.hyperliquid.placeOrder.useMutation();

  // Dynamic symbol list from all exchanges — fetched server-side
  const { data: universeData } = trpc.scanner.getAllSymbols.useQuery(
    { search: symbolSearch.length >= 1 ? symbolSearch : undefined },
    { staleTime: 60_000, refetchOnWindowFocus: false }
  );
  const filteredSymbols = (universeData?.symbols ?? []).slice(0, 30);

  // tRPC mutations
  const bestCoinMutation = trpc.scanner.bestCoinNow.useMutation();
  const scanCoinMutation = trpc.scanner.scanCoin.useMutation();
  const saveHistoryMutation = trpc.scanHistory.save.useMutation();

  // Build pattern context map for personalization
  const patternContextMap: Record<string, string> = {};
  if (symbolPatterns && symbolPatterns.length > 0) {
    symbolPatterns.forEach((p: { symbol?: string; description?: string; action?: string; confidence?: number }) => {
      if (p.symbol) {
        patternContextMap[p.symbol] = `${p.description ?? ""} → ${p.action ?? ""} (confidence: ${p.confidence ?? 50}%)`;
      }
    });
  }

  // ── AUTO SCAN ────────────────────────────────────────────────────────────────
  const handleAutoScan = useCallback(async () => {
    setAutoLoading(true);
    setAutoResult(null);
    setAutoExpired(false);
    try {
      const res = await bestCoinMutation.mutateAsync({ symbolPatternContextMap: patternContextMap, primaryTf: selectedTf });
      const result = res as unknown as ScanResult;
      setAutoResult(result);
      setAutoLastUpdated(new Date());
      if (result.success && !result.isBadEntry && result.confidence !== "LOW") {
        saveHistoryMutation.mutateAsync({
          scanType: "best" as const,
          symbol: result.symbol,
          direction: result.direction,
          confidence: result.confidence,
          entryPrice: result.entry != null ? String(result.entry) : undefined,
          tp1: result.tp1 != null ? String(result.tp1) : undefined,
          sl: result.sl != null ? String(result.sl) : undefined,
          currentPrice: String(result.currentPrice),
        }).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      toast.error(msg);
    } finally {
      setAutoLoading(false);
    }
  }, [bestCoinMutation, patternContextMap]);

  // ── AUTO-REFRESH (every 120s after first scan) ──────────────────────────────
  const AUTO_REFRESH_INTERVAL = 120; // seconds
  useEffect(() => {
    // Start auto-refresh only after first result is received and auto-refresh is enabled
    if (!autoResult || !autoRefreshEnabled || autoLoading) {
      if (autoRefreshRef.current) { clearInterval(autoRefreshRef.current); autoRefreshRef.current = null; }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      return;
    }
    // Start countdown
    setNextRefreshIn(AUTO_REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) return AUTO_REFRESH_INTERVAL;
        return prev - 1;
      });
    }, 1000);
    // Start auto-refresh interval
    autoRefreshRef.current = setInterval(() => {
      handleAutoScan();
    }, AUTO_REFRESH_INTERVAL * 1000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoResult, autoRefreshEnabled, handleAutoScan]);

  // ── MANUAL SCAN ──────────────────────────────────────────────────────────────
  const handleManualScan = useCallback(async (sym?: string) => {
    const target = (sym ?? manualSymbol).toUpperCase().replace("/", "").replace("-PERP", "").replace(":USDT", "");
    if (!target) { toast.error("Enter a symbol first"); return; }
    setManualLoading(true);
    setManualResult(null);
    setManualExpired(false);
    setShowDropdown(false);
    try {
      // Use scanCoin (same engine as AUTO mode) for consistent results
      const res = await scanCoinMutation.mutateAsync({
        symbol: target,
        symbolPatternContext: patternContextMap[target],
        primaryTf: selectedTf,
      });
      const mapped = res as unknown as ScanResult;
      setManualResult(mapped);
      setManualLastUpdated(new Date());
      setManualSymbol(target);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      toast.error(msg);
    } finally {
      setManualLoading(false);
    }
  }, [manualSymbol, scanCoinMutation, patternContextMap]);

  // ── EXECUTE ──────────────────────────────────────────────────────────────────
  const openExecute = (result: ScanResult) => {
    const winRate = symbolPatterns.find((p: { symbol?: string }) => p.symbol === result.symbol) as { winRate?: number } | undefined;
    setExecConfig({
      symbol:     result.symbol,
      direction:  result.direction,
      entryPrice: result.entry ?? result.currentPrice,
        tp1:        result.tp1 ?? null,
      tp2:        result.tp2 ?? null,
      sl:         result.sl ?? null,
      rrTp1:      result.rrTp1 ?? null,
      confidence: result.confidence,
      winRate:    winRate?.winRate,
    });
    setExecOpen(true);
  };

  const handleOrderSubmit = async (payload: OrderSubmitPayload) => {
    setIsExecuting(true);
    try {
      if (payload.exchange === "binance") {
        const res = await binancePlaceOrder.mutateAsync({ symbol: payload.symbol, side: payload.side, quantity: payload.quantity, leverage: payload.leverage, orderType: payload.orderType === "limit" ? "LIMIT" : "MARKET", price: payload.orderType === "limit" ? payload.limitPrice : undefined, takeProfit: payload.takeProfit, stopLoss: payload.stopLoss });
        if (res.success) {
          if (res.protection?.status === "failed") toast.warning(`⚠️ Binance entry placed, but TP/SL protection failed: ${res.protection.error ?? "verify on exchange"}`);
          else toast.success(`⚡ ${payload.side} ${payload.symbol} placed on Binance${res.protection?.status === "active" ? " · TP/SL active" : ""}`);
        }
        else toast.error(`Binance order failed: ${res.error}`);
      } else if (payload.exchange === "bybit") {
        const res = await bybitPlaceOrder.mutateAsync({ symbol: payload.symbol, side: payload.side === "BUY" ? "Buy" : "Sell", qty: payload.quantity.toString(), leverage: payload.leverage, orderType: payload.orderType === "limit" ? "Limit" : "Market", price: payload.orderType === "limit" ? String(payload.limitPrice ?? "") : undefined, takeProfit: payload.takeProfit, stopLoss: payload.stopLoss });
        if (res.success) {
          if (res.protection?.status === "failed") toast.warning(`⚠️ Bybit entry placed, but TP/SL protection failed: ${res.protection.error ?? "verify on exchange"}`);
          else toast.success(`⚡ ${payload.side} ${payload.symbol} placed on Bybit${res.protection?.status === "active" ? " · TP/SL active" : ""}`);
        }
        else toast.error(`Bybit order failed: ${(res as { error?: string }).error ?? "Unknown"}`);
      } else if (payload.exchange === "okx") {
        const res = await okxPlaceOrder.mutateAsync({ symbol: payload.symbol, side: payload.side === "BUY" ? "buy" : "sell", sz: payload.quantity.toString(), leverage: payload.leverage, ordType: payload.orderType === "limit" ? "limit" : "market", px: payload.orderType === "limit" ? String(payload.limitPrice ?? "") : undefined, takeProfit: payload.takeProfit, stopLoss: payload.stopLoss });
        if (res.success) {
          if (res.protection?.status === "failed") toast.warning(`⚠️ OKX entry placed, but TP/SL protection failed: ${res.protection.error ?? "verify on exchange"}`);
          else toast.success(`⚡ ${payload.side} ${payload.symbol} placed on OKX${res.protection?.status === "active" ? " · TP/SL active" : ""}`);
        }
        else toast.error(`OKX order failed: ${(res as { error?: string }).error ?? "Unknown"}`);
      } else if (payload.exchange === "hyperliquid") {
        const hlSymbol = payload.symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "");
        const isLimit = payload.orderType === "limit";
        const res = await hlPlaceOrder.mutateAsync({
          symbol: hlSymbol,
          isBuy: payload.side === "BUY",
          size: payload.quantity,
          price: isLimit ? (payload.limitPrice ?? payload.entryPrice) : payload.entryPrice,
          orderType: isLimit ? "limit" : "market",
          reduceOnly: false,
          leverage: payload.leverage,
          takeProfit: payload.takeProfit,
          stopLoss: payload.stopLoss,
        });
        const tpSlMsg = (res as any).tpSlResults
          ? ` | TP: ${(res as any).tpSlResults.tp ?? "—"} | SL: ${(res as any).tpSlResults.sl ?? "—"}`
          : "";
        if (res.success) toast.success(`⚡ ${isLimit ? "Limit " : ""}${payload.side} ${payload.symbol} placed on Hyperliquid${tpSlMsg}`);
        else toast.error(`HL order failed: ${(res as { error?: string }).error ?? "Unknown"}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Order failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const activeResult = mode === "auto" ? autoResult : manualResult;
  const isLoading = mode === "auto" ? autoLoading : manualLoading;
  const isExpired = mode === "auto" ? autoExpired : manualExpired;
  const setExpired = mode === "auto" ? setAutoExpired : setManualExpired;

  const dir = activeResult?.direction ?? "LONG";
  const isLong = dir === "LONG";
  const dirColor = isLong ? "text-emerald-400" : "text-red-400";
  const dirBg = isLong ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5";

  return (
    <div className="min-h-screen flex flex-col bg-[#080a0f] text-white">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-28 pb-20 max-w-5xl">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Radar className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-black tracking-tight text-white">
              LIVE SCANNER
            </h1>
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-cyan-400/40 bg-cyan-400/10 text-cyan-400 uppercase tracking-widest">
              PERP FUTURES
            </span>
          </div>
          <p className="text-sm text-zinc-500 max-w-xl">
            Continuously studies the live market to surface the single highest-probability perpetual futures trade to enter right now. All spot trades are on the{" "}
            <a href="/gem-finder" className="text-cyan-400 hover:underline">Gem Finder</a>.
          </p>
        </div>

        {/* ── Mode toggle ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900/60 border border-zinc-800/60 rounded-xl mb-8 w-full sm:w-fit">
          <button
            onClick={() => setMode("auto")}
            className={`flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === "auto"
                ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="hidden xs:inline">AUTO — </span>Best Trade Now
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === "manual"
                ? "bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span className="hidden xs:inline">MANUAL — </span>Deep Scan
          </button>
          <button
            onClick={() => { setMode("history"); refetchHistory(); }}
            className={`flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === "history"
                ? "bg-zinc-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="hidden xs:inline">HISTORY</span>
          </button>
          <button
            onClick={() => setMode("autoTrade")}
            className={`flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === "autoTrade"
                ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Bot className="w-4 h-4" />
            <span className="hidden xs:inline">AUTO </span>TRADES
          </button>
        </div>

        {/* ── AUTO TRADES MODE ────────────────────────────────────────── */}
        {mode === "autoTrade" && <AutoTradesTab />}

        {/* ── Timeframe Selector ─────────────────────────────────────────── */}
        {mode !== "history" && mode !== "autoTrade" && <div className="flex items-center gap-3 mb-6">
          <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest shrink-0">Analyze on</span>
          <div className="flex items-center gap-1 p-1 bg-zinc-900/60 border border-zinc-800/60 rounded-xl">
            {TF_OPTIONS.map(tf => (
              <button
                key={tf.value}
                onClick={() => handleTfChange(tf.value)}
                className={`relative flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedTf === tf.value
                    ? "bg-zinc-700 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <span>{tf.label}</span>
                <span className={`text-[9px] font-normal ${
                  selectedTf === tf.value ? "text-zinc-400" : "text-zinc-700"
                }`}>{tf.desc}</span>
              </button>
            ))}
          </div>
          <span className="text-[10px] text-zinc-600 font-mono hidden sm:inline">
            {selectedTf === "5m" ? "Scalp signals · ~30m validity" :
             selectedTf === "15m" ? "Short-term signals · ~1h validity" :
             selectedTf === "1h" ? "Swing signals · ~2h validity" :
             selectedTf === "4h" ? "Position signals · ~8h validity" :
             "Macro signals · ~24h validity"}
          </span>
        </div>}

        {/* ── HISTORY MODE ────────────────────────────────────────────────── */}
        {mode === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Scan History</h2>
              {scanHistoryData && scanHistoryData.length > 0 && (
                <button
                  onClick={() => clearHistoryMutation.mutate()}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors font-mono"
                >
                  Clear all
                </button>
              )}
            </div>
            {!scanHistoryData || scanHistoryData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                <Layers className="w-10 h-10 text-zinc-700 mb-4" />
                <p className="text-sm text-zinc-500">No scan history yet.</p>
                <p className="text-xs text-zinc-600 mt-1">Run a scan to see results here. Login required to save history.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scanHistoryData.map((h) => {
                  const isLongH = h.direction === "LONG";
                  const conf = (h.confidence ?? "LOW") as Confidence;
                  return (
                    <div
                      key={h.id}
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border ${
                        isLongH ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      {/* Symbol + direction */}
                      <div className="flex items-center gap-2 min-w-[140px]">
                        {isLongH
                          ? <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                          : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
                        <span className="font-mono font-bold text-sm text-white">{h.symbol}</span>
                        <span className={`text-xs font-bold ${isLongH ? "text-emerald-400" : "text-red-400"}`}>{h.direction}</span>
                      </div>
                      {/* Confidence */}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${confidenceBadge(conf)}`}>{conf}</span>
                      {/* Entry / TP / SL */}
                      <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 flex-1">
                        {h.entryPrice && <span>Entry <span className="text-white">{parseFloat(h.entryPrice) < 1 ? parseFloat(h.entryPrice).toFixed(5) : parseFloat(h.entryPrice).toFixed(2)}</span></span>}
                        {h.tp1 && <span>TP1 <span className="text-emerald-400">{parseFloat(h.tp1) < 1 ? parseFloat(h.tp1).toFixed(5) : parseFloat(h.tp1).toFixed(2)}</span></span>}
                        {h.sl && <span>SL <span className="text-red-400">{parseFloat(h.sl) < 1 ? parseFloat(h.sl).toFixed(5) : parseFloat(h.sl).toFixed(2)}</span></span>}
                      </div>
                      {/* Scan type + date */}
                      <div className="flex items-center gap-2 text-xs text-zinc-600 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono">{h.scanType === "best" ? "AUTO" : "MANUAL"}</span>
                        <span>{new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── AUTO MODE ───────────────────────────────────────────────────── */}
        {mode === "auto" && (
          <div className="space-y-5">

            {/* Market Alerts Banner */}
            {marketAlertsData && marketAlertsData.length > 0 && (
              <div className="space-y-2">
                {marketAlertsData.slice(0, 3).map((alert) => (
                  <div key={alert.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
                    alert.severity === "critical" ? "border-red-500/40 bg-red-500/10" :
                    alert.severity === "high" ? "border-orange-500/40 bg-orange-500/10" :
                    alert.severity === "medium" ? "border-yellow-500/40 bg-yellow-500/10" :
                    "border-zinc-700/40 bg-zinc-800/30"
                  }`}>
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                      alert.severity === "critical" ? "text-red-400" :
                      alert.severity === "high" ? "text-orange-400" :
                      alert.severity === "medium" ? "text-yellow-400" : "text-zinc-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white">{alert.title}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{alert.message}</p>
                      {alert.affectedSymbols && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {alert.affectedSymbols.split(",").slice(0, 5).map(s => (
                            <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{s.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                      {new Date(alert.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Auto-refresh indicator */}
            {autoResult && !autoLoading && autoRefreshEnabled && (
              <div className="flex items-center justify-between px-4 py-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] text-zinc-400 font-mono">AUTO-REFRESH ACTIVE</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-500 font-mono">Next scan in <span className="text-cyan-400 font-bold">{nextRefreshIn}s</span></span>
                  <button
                    onClick={() => setAutoRefreshEnabled(false)}
                    className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    PAUSE
                  </button>
                </div>
              </div>
            )}
            {autoResult && !autoLoading && !autoRefreshEnabled && (
              <div className="flex items-center justify-between px-4 py-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="text-[11px] text-zinc-500 font-mono">AUTO-REFRESH PAUSED</span>
                </div>
                <button
                  onClick={() => setAutoRefreshEnabled(true)}
                  className="text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                >
                  RESUME
                </button>
              </div>
            )}

            {/* Scan button */}
            {!autoResult && !autoLoading && (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-6">
                  <Radar className="w-8 h-8 text-cyan-400" />
                </div>
                <h2 className="text-xl font-black text-white mb-2">Find the Best Trade Right Now</h2>
                <p className="text-sm text-zinc-500 text-center max-w-sm mb-8">
                  AI scans perpetual futures pairs across Binance, Bybit, OKX, and Hyperliquid — no API key needed. Ranks every pair by RSI · MACD · BB · Funding · OI · Sentiment and surfaces the single highest-conviction setup.
                </p>
                <Button
                  onClick={handleAutoScan}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-black text-base px-10 py-6 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  SCAN LIVE MARKET NOW
                </Button>
                <p className="text-xs text-zinc-600 mt-4 font-mono">Scans Binance · Bybit · OKX · Hyperliquid · ~15–25 seconds</p>
              </div>
            )}

            {/* Loading */}
            {autoLoading && (
              <div className="flex flex-col items-center justify-center py-20 border border-zinc-800/60 rounded-2xl bg-zinc-900/20">
                <div className="relative w-16 h-16 mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full border-2 border-cyan-500/40 animate-ping" style={{ animationDelay: "0.3s" }} />
                  <div className="absolute inset-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                  </div>
                </div>
                <p className="text-white font-bold text-lg mb-1">Scanning Live Market…</p>
                <p className="text-zinc-500 text-sm">Fetching live universe from Binance · Bybit · OKX · Hyperliquid…</p>
                <div className="flex items-center gap-3 mt-4">
                  {["Binance","Bybit","OKX","Hyperliquid"].map((ex) => (
                    <span key={ex} className="text-[10px] font-mono px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 animate-pulse">{ex}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {autoResult && !autoLoading && (
              <AutoResult
                result={autoResult}
                expired={autoExpired}
                lastUpdated={autoLastUpdated}
                onExpired={() => setAutoExpired(true)}
                onRescan={handleAutoScan}
                onExecute={openExecute}
                onSelectRunnerUp={(sym) => { setMode("manual"); setManualSymbol(sym); handleManualScan(sym); }}
              />
            )}
          </div>
        )}

        {/* ── MANUAL MODE ─────────────────────────────────────────────────── */}
        {mode === "manual" && (
          <div className="space-y-5">
            {/* Search bar */}
            <div className="relative">
              <div className="flex items-center gap-3 p-3 bg-zinc-900/60 border border-zinc-700/60 rounded-xl focus-within:border-violet-500/60 transition-colors">
                <Crosshair className="w-5 h-5 text-zinc-500 shrink-0" />
                <input
                  ref={searchRef}
                  value={symbolSearch}
                  onChange={e => { setSymbolSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={e => { if (e.key === "Enter") { handleManualScan(symbolSearch.toUpperCase().replace("/", "") + (symbolSearch.toUpperCase().includes("USDT") ? "" : "USDT")); setShowDropdown(false); } }}
                  placeholder="Search any perpetual pair… e.g. BTC, ETHUSDT, SOL"
                  className="flex-1 bg-transparent text-white placeholder:text-zinc-600 text-sm font-mono outline-none"
                />
                {symbolSearch && (
                  <button onClick={() => { setSymbolSearch(""); setManualResult(null); }} className="text-zinc-600 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <Button
                  onClick={() => handleManualScan()}
                  disabled={manualLoading}
                  className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2 rounded-lg text-sm shrink-0"
                >
                  {manualLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1.5" />Deep Scan</>}
                </Button>
              </div>

              {/* Dropdown */}
              {showDropdown && filteredSymbols.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700/60 rounded-xl overflow-hidden z-50 shadow-2xl max-h-80 overflow-y-auto">
                  {filteredSymbols.map(item => {
                    const pairName = `${item.symbol}USDT`;
                    return (
                      <button
                        key={item.symbol}
                        onClick={() => { setSymbolSearch(pairName); setShowDropdown(false); handleManualScan(pairName); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/60 transition-colors text-left"
                      >
                        <span className="font-mono text-sm text-white font-bold">{item.symbol}</span>
                        <span className="text-xs text-zinc-600">PERP</span>
                        <span className="ml-auto flex gap-1">
                          {item.exchanges.map(ex => (
                            <span key={ex} className={`text-[9px] px-1 py-0.5 rounded border ${
                              ex === "binance" ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/5" :
                              ex === "bybit" ? "text-orange-400 border-orange-400/30 bg-orange-400/5" :
                              ex === "okx" ? "text-sky-400 border-sky-400/30 bg-sky-400/5" :
                              "text-violet-400 border-violet-400/30 bg-violet-400/5"
                            }`}>{ex === "hyperliquid" ? "HL" : ex.charAt(0).toUpperCase() + ex.slice(1, 3)}</span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                  {universeData && (
                    <div className="px-4 py-2 text-[10px] text-zinc-600 border-t border-zinc-800">
                      {universeData.totalPairs} pairs across {Object.keys(universeData.exchangeCounts).length} exchanges
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Loading */}
            {manualLoading && (
              <div className="flex flex-col items-center justify-center py-16 border border-zinc-800/60 rounded-2xl bg-zinc-900/20">
                <div className="relative w-14 h-14 mb-5">
                  <div className="absolute inset-0 rounded-full border-2 border-violet-500/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full border-2 border-violet-500/40 animate-ping" style={{ animationDelay: "0.3s" }} />
                  <div className="absolute inset-4 rounded-full bg-violet-500/20 flex items-center justify-center">
                    <Crosshair className="w-4 h-4 text-violet-400 animate-pulse" />
                  </div>
                </div>
                <p className="text-white font-bold mb-1">Running Deep Scan…</p>
                <p className="text-zinc-500 text-sm">15m · 1H · 4H · 1D indicators · Funding · OI · Sentiment</p>
                <div className="flex items-center gap-2 mt-3">
                  {["RSI","MACD","BB","OI","FR"].map((ind, i) => (
                    <span key={ind} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-violet-500/20 bg-violet-500/5 text-violet-400 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}>{ind}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!manualResult && !manualLoading && (
              <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                <Layers className="w-10 h-10 text-zinc-700 mb-4" />
                <p className="text-zinc-500 text-sm text-center max-w-xs">
                  Search any perpetual futures pair and run a full multi-timeframe deep scan with AI directional verdict, entry/TP/SL levels, and 1-click execute.
                </p>
              </div>
            )}

            {/* Result */}
            {manualResult && !manualLoading && (
              <ScanResultCard
                result={manualResult}
                expired={manualExpired}
                lastUpdated={manualLastUpdated}
                onExpired={() => setManualExpired(true)}
                onRescan={() => handleManualScan()}
                onExecute={openExecute}
                accentColor="violet"
              />
            )}
          </div>
        )}
      </main>

      <Footer />

      {/* Pre-execution modal */}
      <PreExecutionModal
        open={execOpen}
        onClose={() => { setExecOpen(false); setExecConfig(null); }}
        config={execConfig}
        hasBinanceKey={hasBinanceKey}
        hasBybitKey={hasBybitKey}
        hasOkxKey={hasOkxKey}
        hasHyperliquidKey={hasHlKey}
        onSubmit={handleOrderSubmit}
        isSubmitting={isExecuting}
      />
    </div>
  );
}

// ─── Auto Result (full layout with runner-ups) ────────────────────────────────
function AutoResult({
  result, expired, lastUpdated, onExpired, onRescan, onExecute, onSelectRunnerUp,
}: {
  result: ScanResult;
  expired: boolean;
  lastUpdated?: Date | null;
  onExpired: () => void;
  onRescan: () => void;
  onExecute: (r: ScanResult) => void;
  onSelectRunnerUp: (sym: string) => void;
}) {
  const isLong = result.direction === "LONG";
  const dirColor = isLong ? "text-emerald-400" : "text-red-400";
  const dirBg = isLong ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5";
  const baseEvidenceScore = result.confidenceNum ?? (result.confidence === "HIGH" ? 82 : result.confidence === "MEDIUM" ? 67 : 55);
  const executionEvidenceScore = result.executionEvidenceScore ?? baseEvidenceScore;

  // For LOW confidence / bad entry, show the result with a prominent warning banner
  // rather than blocking the user entirely
  const showWarningBanner = result.confidence === "LOW" || result.isBadEntry;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Main verdict */}
      <div className="lg:col-span-2 space-y-4">
        {/* Warning banner for LOW confidence */}
        {showWarningBanner && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-yellow-400 mb-0.5">Lower Confidence Setup</p>
              <p className="text-xs text-zinc-400">{result.badEntryReason ?? "Market conditions are mixed. This is the best available setup — consider waiting for a stronger signal or using reduced size."}</p>
            </div>
            <Button onClick={onRescan} size="sm" variant="outline" className="shrink-0 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 text-xs h-7 px-2">
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        )}
        {/* Header card */}
          <div className={`border rounded-2xl p-4 sm:p-6 ${dirBg} ${expired ? "opacity-50" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Best Trade Right Now</span>
                {result.top20Scanned && (
                  <span className="text-[9px] font-mono text-zinc-600">· scanned top {result.top20Scanned}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isLong ? <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" /> : <TrendingDown className="w-8 h-8 sm:w-10 sm:h-10 text-red-400" />}
                <div>
                  <span className={`text-4xl sm:text-5xl font-black tracking-tight ${dirColor}`}>{result.direction}</span>
                  <p className="text-lg sm:text-xl font-bold text-white font-mono">{result.symbol.replace("USDT", "")}<span className="text-zinc-600 text-sm">USDT</span></p>
                </div>
              </div>
            </div>
            <div className="text-right space-y-2 shrink-0">
              <div className="flex flex-col items-end gap-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Base Evidence</p>
                <p className={`font-black text-3xl leading-none ${
                  result.confidence === "HIGH" ? "text-emerald-400" :
                  result.confidence === "MEDIUM" ? "text-yellow-400" : "text-zinc-400"
                }`}>{baseEvidenceScore}/100</p>
                <Badge className={`text-[9px] border ${confidenceBadge(result.confidence)}`}>{result.confidence}</Badge>
                {executionEvidenceScore !== baseEvidenceScore && (
                  <p className="text-[9px] text-zinc-500">Auto Trader after safeguards: {executionEvidenceScore}/100</p>
                )}
                {executionEvidenceScore < 88 && <p className="text-[9px] text-zinc-500">Below Auto Trader 88/100 gate</p>}
              </div>
              <p className="text-xs text-zinc-500 font-mono">${result.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
            </div>
          </div>

          {/* Best Exchange Recommendation */}
          {result.bestExchange && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Best Exchange</span>
              <span className="text-sm font-black text-violet-300 capitalize">{result.bestExchange === "hyperliquid" ? "Hyperliquid" : result.bestExchange === "okx" ? "OKX" : result.bestExchange === "binance" ? "Binance" : "Bybit"}</span>
              <span className="text-[9px] text-zinc-500 font-mono">(highest 24h volume)</span>
            </div>
          )}

          {/* Last Updated timestamp */}
          {lastUpdated && (
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="w-3 h-3 text-zinc-600" />
              <span className="text-[10px] font-mono text-zinc-500">Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="text-[10px] text-zinc-700">·</span>
              <span className="text-[10px] text-emerald-500/80 font-mono">LIVE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          )}

          {result.keyReason && (
            <div className="bg-black/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Key Reason</p>
              <p className="text-sm text-zinc-200 leading-relaxed">{result.keyReason}</p>
            </div>
          )}

          {/* 3-column ENTRY / TARGET / STOP grid */}
          {(result.entry || result.tp1 || result.sl) && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-cyan-500/10 p-3 rounded-lg border border-cyan-500/30 text-center">
                <span className="text-[10px] text-cyan-400/70 font-bold uppercase tracking-widest block mb-1">ENTRY</span>
                <span className="font-mono text-sm font-bold text-cyan-300">
                  ${result.entry ? (result.entry < 1 ? result.entry.toFixed(6) : result.entry < 100 ? result.entry.toFixed(4) : result.entry.toFixed(2)) : "—"}
                </span>
              </div>
              <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/30 text-center">
                <span className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-widest block mb-1">TARGET</span>
                <span className="font-mono text-sm font-bold text-emerald-300">
                  ${result.tp1 ? (result.tp1 < 1 ? result.tp1.toFixed(6) : result.tp1 < 100 ? result.tp1.toFixed(4) : result.tp1.toFixed(2)) : "—"}
                </span>
                {result.rrTp1 && <span className="text-[9px] text-emerald-600 font-mono block mt-0.5">R:R {result.rrTp1}</span>}
              </div>
              <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 text-center">
                <span className="text-[10px] text-red-400/70 font-bold uppercase tracking-widest block mb-1">STOP</span>
                <span className="font-mono text-sm font-bold text-red-300">
                  ${result.sl ? (result.sl < 1 ? result.sl.toFixed(6) : result.sl < 100 ? result.sl.toFixed(4) : result.sl.toFixed(2)) : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Execute button */}
          {!expired ? (
            <button
              onClick={() => onExecute(result)}
              className={`w-full py-4 rounded-xl font-black text-base tracking-wider transition-all shadow-lg ${
                isLong
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_25px_rgba(52,211,153,0.4)]"
                  : "bg-red-500 hover:bg-red-400 text-white shadow-[0_0_25px_rgba(239,68,68,0.4)]"
              }`}
            >
              <Zap className="w-5 h-5 inline mr-2" />
              EXECUTE {result.direction} — 1-CLICK TRADE
            </button>
          ) : (
            <button onClick={onRescan} className="w-full py-4 rounded-xl font-black text-base bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all border border-zinc-700">
              <RefreshCw className="w-4 h-4 inline mr-2" /> Signal Expired — Scan Again
            </button>
          )}

          {/* I Took This Trade button */}
          {!expired && result.entry && (
            <ITookThisTradeButton result={result} />
          )}
        </div>

        {/* Trade levels */}
        {(result.entry || result.tp1 || result.sl) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Target className="w-3.5 h-3.5" /> Trade Levels
            </p>
            <LevelRow label="Entry"  price={result.entry}  color="text-cyan-400" />
            <LevelRow label="TP1"    price={result.tp1}    color="text-emerald-400" rr={result.rrTp1} />
            <LevelRow label="TP2"    price={result.tp2}    color="text-emerald-300" rr={result.rrTp2} />
            <LevelRow label="SL"     price={result.sl}     color="text-red-400" />
            {result.atr > 0 && <p className="text-xs text-zinc-600 mt-2 font-mono">ATR (1H): {result.atr.toFixed(4)}</p>}
          </div>
        )}

        {/* Validity countdown */}
        {!expired && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <ValidityCountdown validity={result.validity} validitySeconds={result.validitySeconds} onExpired={onExpired} />
          </div>
        )}

        {/* Multi-TF indicators */}
        {result.indicators.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5" /> Multi-Timeframe Indicators
            </p>
            <div className="grid grid-cols-5 gap-2 mb-2 text-[9px] text-zinc-600 uppercase tracking-widest">
              {["TF", "RSI", "MACD", "BB%", "Volume"].map(h => <span key={h}>{h}</span>)}
            </div>
            {result.indicators.map(ind => <IndicatorRow key={ind.tf} {...ind} />)}
            {/* Microstructure data row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-zinc-800">
              {result.fundingRate && (
                <div>
                  <p className="text-xs text-zinc-500">Funding Rate</p>
                  <p className={`text-xs font-mono font-bold ${result.fundingRate.includes("longs paying") ? "text-red-400" : result.fundingRate.includes("shorts paying") ? "text-emerald-400" : "text-zinc-400"}`}>{result.fundingRate}</p>
                </div>
              )}
              {result.oiChange && (
                <div>
                  <p className="text-xs text-zinc-500">OI Trend</p>
                  <p className={`text-xs font-mono font-bold ${result.oiChange.includes("rising") ? "text-emerald-400" : result.oiChange.includes("falling") ? "text-red-400" : "text-zinc-400"}`}>{result.oiChange}</p>
                </div>
              )}
              {result.longShortRatio !== undefined && (
                <div>
                  <p className="text-xs text-zinc-500">L/S Ratio</p>
                  <p className={`text-xs font-mono font-bold ${result.longShortRatio > 1.2 ? "text-emerald-400" : result.longShortRatio < 0.8 ? "text-red-400" : "text-zinc-400"}`}>{result.longShortRatio.toFixed(3)}</p>
                </div>
              )}
              {result.cvdBias && (
                <div>
                  <p className="text-xs text-zinc-500">CVD Bias</p>
                  <p className={`text-xs font-mono font-bold ${result.cvdBias === "bullish" ? "text-emerald-400" : result.cvdBias === "bearish" ? "text-red-400" : "text-zinc-400"}`}>{result.cvdBias}</p>
                </div>
              )}
              {result.orderBookImbalance !== undefined && (
                <div>
                  <p className="text-xs text-zinc-500">OB Imbalance</p>
                  <p className={`text-xs font-mono font-bold ${result.orderBookImbalance > 0.05 ? "text-emerald-400" : result.orderBookImbalance < -0.05 ? "text-red-400" : "text-zinc-400"}`}>{result.orderBookImbalance > 0 ? "+" : ""}{(result.orderBookImbalance * 100).toFixed(1)}%</p>
                </div>
              )}
              {result.patternType && (
                <div>
                  <p className="text-xs text-zinc-500">Pattern</p>
                  <p className="text-xs font-mono font-bold text-violet-400">{result.patternType}</p>
                </div>
              )}
            </div>
            {/* Score bars */}
            {(result.technicalScore !== undefined || result.microstructureScore !== undefined) && (
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-zinc-800">
                {result.technicalScore !== undefined && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Technical</p>
                      <p className="text-[9px] font-mono text-zinc-400">{result.technicalScore}/100</p>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${result.technicalScore >= 70 ? "bg-emerald-500" : result.technicalScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${result.technicalScore}%` }} />
                    </div>
                  </div>
                )}
                {result.microstructureScore !== undefined && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Microstructure</p>
                      <p className="text-[9px] font-mono text-zinc-400">{result.microstructureScore}/100</p>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${result.microstructureScore >= 70 ? "bg-emerald-500" : result.microstructureScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${result.microstructureScore}%` }} />
                    </div>
                  </div>
                )}
                {result.volatilityScore !== undefined && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Volatility</p>
                      <p className="text-[9px] font-mono text-zinc-400">{result.volatilityScore}/100</p>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${result.volatilityScore >= 70 ? "bg-emerald-500" : result.volatilityScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${result.volatilityScore}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Accuracy Engine Section */}
        {(result.entryQualityScore !== undefined || result.marketStructureTrend) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <span className="text-blue-400">⬡</span> Accuracy Engine
              </p>
              {result.entryQualityScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Entry Quality</span>
                  <span className={`text-sm font-black font-mono px-2 py-0.5 rounded ${
                    result.entryQualityScore >= 80 ? "bg-emerald-500/20 text-emerald-300" :
                    result.entryQualityScore >= 60 ? "bg-yellow-500/20 text-yellow-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>{result.entryQualityLabel ?? "—"}</span>
                  <span className="text-xs font-mono text-zinc-400">{result.entryQualityScore}/100</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {result.marketStructureTrend && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Market Structure</span>
                  <span className={`font-mono capitalize ${
                    result.marketStructureTrend === "uptrend" ? "text-emerald-400" :
                    result.marketStructureTrend === "downtrend" ? "text-red-400" : "text-zinc-400"
                  }`}>{result.marketStructureTrend}</span>
                </div>
              )}
              {result.adx !== undefined && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">ADX (Trend Strength)</span>
                  <span className={`font-mono ${result.adx > 25 ? "text-emerald-400" : "text-zinc-400"}`}>
                    {result.adx.toFixed(1)} {result.adx > 25 ? "· Trending" : "· Ranging"}
                  </span>
                </div>
              )}
              {result.liquiditySweep !== undefined && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Liquidity Sweep</span>
                  <span className={`font-mono ${result.liquiditySweep ? "text-emerald-400" : "text-zinc-600"}`}>
                    {result.liquiditySweep ? "✓ Detected" : "None"}
                  </span>
                </div>
              )}
              {result.fvgDetected !== undefined && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Fair Value Gap</span>
                  <span className={`font-mono ${result.fvgDetected ? "text-blue-400" : "text-zinc-600"}`}>
                    {result.fvgDetected ? "✓ Detected" : "None"}
                  </span>
                </div>
              )}
              {result.rsiDivergence && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">RSI Divergence</span>
                  <span className={`font-mono capitalize ${
                    result.rsiDivergence === "bullish" ? "text-emerald-400" : "text-red-400"
                  }`}>{result.rsiDivergence}</span>
                </div>
              )}
              {result.vwapSignal && result.vwapSignal !== "neutral" && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">VWAP Signal</span>
                  <span className={`font-mono capitalize ${
                    result.vwapSignal.includes("above") ? "text-emerald-400" :
                    result.vwapSignal.includes("below") ? "text-red-400" : "text-zinc-400"
                  }`}>{result.vwapSignal}</span>
                </div>
              )}
              {result.candlePattern && result.candlePattern !== "No Pattern" && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Candle Pattern</span>
                  <span className="font-mono text-violet-400">{result.candlePattern}</span>
                </div>
              )}
              {result.nearFibLevel && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Fibonacci</span>
                  <span className="font-mono text-amber-400">Near Key Level</span>
                </div>
              )}
            </div>
            {result.accuracyFactors && result.accuracyFactors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">Accuracy Signals</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.accuracyFactors.map((f, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Analysis */}
        {result.analysis && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-violet-400" /> AI Analysis
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed">{result.analysis}</p>
          </div>
        )}
      </div>

      {/* Right: runner-ups + rescan */}
      <div className="space-y-4">
        {/* Runner-ups */}
        {result.runnerUps && result.runnerUps.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" /> Runner-Up Setups
            </p>
            <div className="space-y-2">
              {result.runnerUps.map(r => (
                <RunnerUpCard key={r.symbol} r={r} onSelect={onSelectRunnerUp} />
              ))}
            </div>
            <p className="text-[9px] text-zinc-600 mt-3">Base evidence is comparable across this list. Auto Trader applies final ML/private safety suppression before execution.</p>
            <p className="text-[9px] text-zinc-600 mt-3">Click any pair to run a full deep scan</p>
          </div>
        )}

        {/* Rescan */}
        <button
          onClick={onRescan}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-700/60 bg-zinc-900/40 hover:border-zinc-500 hover:bg-zinc-800/40 text-zinc-400 hover:text-white text-sm font-bold transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Re-Scan Market
        </button>

        {/* Market context */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Scan Context</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-zinc-500">Data Source</span><span className="text-zinc-300 font-mono">Binance · Bybit · OKX · HL</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Market</span><span className="text-zinc-300 font-mono">USDT-M Perps</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Universe</span><span className="text-zinc-300 font-mono">{result.totalPairsScanned ? `Top ${result.totalPairsScanned} by Volume` : "Top 40 by Volume"}</span></div>
            {result.listedOnExchanges && result.listedOnExchanges.length > 0 && (
              <div className="flex justify-between"><span className="text-zinc-500">Listed On</span><span className="text-zinc-300 font-mono capitalize">{result.listedOnExchanges.join(" · ")}</span></div>
            )}
            {result.bestExchange && (
              <div className="flex justify-between"><span className="text-zinc-500">Recommended</span><span className="text-violet-300 font-mono font-bold capitalize">{result.bestExchange === "hyperliquid" ? "Hyperliquid" : result.bestExchange === "okx" ? "OKX" : result.bestExchange === "binance" ? "Binance" : "Bybit"}</span></div>
            )}
            <div className="flex justify-between"><span className="text-zinc-500">Timeframes</span><span className="text-zinc-300 font-mono">15m · 1H · 4H · 1D</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manual / Deep Scan Result Card ──────────────────────────────────────────
function ScanResultCard({
  result, expired, lastUpdated, onExpired, onRescan, onExecute, accentColor,
}: {
  result: ScanResult;
  expired: boolean;
  lastUpdated?: Date | null;
  onExpired: () => void;
  onRescan: () => void;
  onExecute: (r: ScanResult) => void;
  accentColor: "cyan" | "violet";
}) {
  const isLong = result.direction === "LONG";
  const dirColor = isLong ? "text-emerald-400" : "text-red-400";
  const dirBg = isLong ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5";
  const evidenceScore = result.executionEvidenceScore ?? result.confidenceNum ?? (result.confidence === "HIGH" ? 82 : result.confidence === "MEDIUM" ? 67 : 55);
  const accent = accentColor === "violet" ? "bg-violet-500 hover:bg-violet-400 text-white shadow-[0_0_25px_rgba(139,92,246,0.4)]" : "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_25px_rgba(6,182,212,0.4)]";

  if (result.isBadEntry) {
    return (
      <div className="border border-yellow-500/20 rounded-2xl p-8 bg-yellow-500/5 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-yellow-500 mx-auto" />
        <h3 className="text-lg font-bold text-white">Not an Ideal Entry</h3>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">{result.badEntryReason ?? "Current price is not at an optimal entry point. Refresh in a few minutes."}</p>
        <Button onClick={onRescan} variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`border rounded-2xl p-4 sm:p-6 ${dirBg} ${expired ? "opacity-50" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1 font-mono truncate">Deep Scan — {result.symbol}</p>
            <div className="flex items-center gap-3">
              {isLong ? <TrendingUp className="w-8 h-8 sm:w-9 sm:h-9 text-emerald-400" /> : <TrendingDown className="w-8 h-8 sm:w-9 sm:h-9 text-red-400" />}
              <span className={`text-3xl sm:text-4xl font-black tracking-tight ${dirColor}`}>{result.direction}</span>
            </div>
          </div>
          <div className="text-right space-y-2 shrink-0">
            <div className="flex flex-col items-end gap-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Final Evidence Score</p>
              <p className={`font-black text-3xl leading-none ${
                result.confidence === "HIGH" ? "text-emerald-400" :
                result.confidence === "MEDIUM" ? "text-yellow-400" : "text-zinc-400"
              }`}>{evidenceScore}/100</p>
              <Badge className={`text-[9px] border ${confidenceBadge(result.confidence)}`}>{result.confidence}</Badge>
              {evidenceScore < 88 && <p className="text-[9px] text-zinc-500">Below Auto Trader 88/100 gate</p>}
            </div>
            <p className="text-xs text-zinc-500 font-mono">${result.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
          </div>
        </div>

        {/* Best Exchange Recommendation */}
        {result.bestExchange && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Best Exchange</span>
            <span className="text-sm font-black text-violet-300 capitalize">{result.bestExchange === "hyperliquid" ? "Hyperliquid" : result.bestExchange === "okx" ? "OKX" : result.bestExchange === "binance" ? "Binance" : "Bybit"}</span>
            <span className="text-[9px] text-zinc-500 font-mono">(highest 24h volume)</span>
          </div>
        )}

        {/* Last Updated timestamp */}
        {lastUpdated && (
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="w-3 h-3 text-zinc-600" />
            <span className="text-[10px] font-mono text-zinc-500">Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className="text-[10px] text-zinc-700">·</span>
            <span className="text-[10px] text-emerald-500/80 font-mono">LIVE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}

        {result.keyReason && (
          <div className="bg-black/30 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Key Reason</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{result.keyReason}</p>
          </div>
        )}

        {/* 3-column ENTRY / TARGET / STOP grid */}
        {(result.entry || result.tp1 || result.sl) && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-cyan-500/10 p-3 rounded-lg border border-cyan-500/30 text-center">
              <span className="text-[10px] text-cyan-400/70 font-bold uppercase tracking-widest block mb-1">ENTRY</span>
              <span className="font-mono text-sm font-bold text-cyan-300">
                ${result.entry ? (result.entry < 1 ? result.entry.toFixed(6) : result.entry < 100 ? result.entry.toFixed(4) : result.entry.toFixed(2)) : "—"}
              </span>
            </div>
            <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/30 text-center">
              <span className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-widest block mb-1">TARGET</span>
              <span className="font-mono text-sm font-bold text-emerald-300">
                ${result.tp1 ? (result.tp1 < 1 ? result.tp1.toFixed(6) : result.tp1 < 100 ? result.tp1.toFixed(4) : result.tp1.toFixed(2)) : "—"}
              </span>
              {result.rrTp1 && <span className="text-[9px] text-emerald-600 font-mono block mt-0.5">R:R {result.rrTp1}</span>}
            </div>
            <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 text-center">
              <span className="text-[10px] text-red-400/70 font-bold uppercase tracking-widest block mb-1">STOP</span>
              <span className="font-mono text-sm font-bold text-red-300">
                ${result.sl ? (result.sl < 1 ? result.sl.toFixed(6) : result.sl < 100 ? result.sl.toFixed(4) : result.sl.toFixed(2)) : "—"}
              </span>
            </div>
          </div>
        )}

        {!expired ? (
          <button onClick={() => onExecute(result)} className={`w-full py-4 rounded-xl font-black text-base tracking-wider transition-all ${accent}`}>
            <Zap className="w-5 h-5 inline mr-2" />
            EXECUTE {result.direction} — 1-CLICK TRADE
          </button>
        ) : (
          <button onClick={onRescan} className="w-full py-4 rounded-xl font-black text-base bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all border border-zinc-700">
            <RefreshCw className="w-4 h-4 inline mr-2" /> Signal Expired — Re-Scan
          </button>
        )}
      </div>

      {/* Levels + Countdown + Indicators in a grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(result.entry || result.tp1 || result.sl) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Target className="w-3.5 h-3.5" /> Trade Levels
            </p>
            <LevelRow label="Entry" price={result.entry} color="text-cyan-400" />
            <LevelRow label="TP1"   price={result.tp1}   color="text-emerald-400" rr={result.rrTp1} />
            <LevelRow label="TP2"   price={result.tp2}   color="text-emerald-300" rr={result.rrTp2} />
            <LevelRow label="SL"    price={result.sl}    color="text-red-400" />
          </div>
        )}
        {!expired && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <ValidityCountdown validity={result.validity} validitySeconds={result.validitySeconds} onExpired={onExpired} />
          </div>
        )}
      </div>

      {result.indicators.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5" /> Multi-Timeframe Indicators
          </p>
          <div className="grid grid-cols-5 gap-2 mb-2 text-[9px] text-zinc-600 uppercase tracking-widest">
            {["TF", "RSI", "MACD", "BB%", "Volume"].map(h => <span key={h}>{h}</span>)}
          </div>
          {result.indicators.map(ind => <IndicatorRow key={ind.tf} {...ind} />)}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-zinc-800">
            {result.fundingRate && (
              <div>
                <p className="text-xs text-zinc-500">Funding Rate</p>
                <p className={`text-xs font-mono font-bold ${result.fundingRate.includes("longs paying") ? "text-red-400" : result.fundingRate.includes("shorts paying") ? "text-emerald-400" : "text-zinc-400"}`}>{result.fundingRate}</p>
              </div>
            )}
            {result.oiChange && (
              <div>
                <p className="text-xs text-zinc-500">OI Trend</p>
                <p className={`text-xs font-mono font-bold ${result.oiChange.includes("rising") ? "text-emerald-400" : result.oiChange.includes("falling") ? "text-red-400" : "text-zinc-400"}`}>{result.oiChange}</p>
              </div>
            )}
            {result.longShortRatio !== undefined && (
              <div>
                <p className="text-xs text-zinc-500">L/S Ratio</p>
                <p className={`text-xs font-mono font-bold ${result.longShortRatio > 1.2 ? "text-emerald-400" : result.longShortRatio < 0.8 ? "text-red-400" : "text-zinc-400"}`}>{result.longShortRatio.toFixed(3)}</p>
              </div>
            )}
            {result.cvdBias && (
              <div>
                <p className="text-xs text-zinc-500">CVD Bias</p>
                <p className={`text-xs font-mono font-bold ${result.cvdBias === "bullish" ? "text-emerald-400" : result.cvdBias === "bearish" ? "text-red-400" : "text-zinc-400"}`}>{result.cvdBias}</p>
              </div>
            )}
            {result.orderBookImbalance !== undefined && (
              <div>
                <p className="text-xs text-zinc-500">OB Imbalance</p>
                <p className={`text-xs font-mono font-bold ${result.orderBookImbalance > 0.05 ? "text-emerald-400" : result.orderBookImbalance < -0.05 ? "text-red-400" : "text-zinc-400"}`}>{result.orderBookImbalance > 0 ? "+" : ""}{(result.orderBookImbalance * 100).toFixed(1)}%</p>
              </div>
            )}
            {result.patternType && (
              <div>
                <p className="text-xs text-zinc-500">Pattern</p>
                <p className="text-xs font-mono font-bold text-violet-400">{result.patternType}</p>
              </div>
            )}
          </div>
          {(result.technicalScore !== undefined || result.microstructureScore !== undefined) && (
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-zinc-800">
              {result.technicalScore !== undefined && (
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Technical</p>
                    <p className="text-[9px] font-mono text-zinc-400">{result.technicalScore}/100</p>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${result.technicalScore >= 70 ? "bg-emerald-500" : result.technicalScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${result.technicalScore}%` }} />
                  </div>
                </div>
              )}
              {result.microstructureScore !== undefined && (
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Microstructure</p>
                    <p className="text-[9px] font-mono text-zinc-400">{result.microstructureScore}/100</p>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${result.microstructureScore >= 70 ? "bg-emerald-500" : result.microstructureScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${result.microstructureScore}%` }} />
                  </div>
                </div>
              )}
              {result.volatilityScore !== undefined && (
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Volatility</p>
                    <p className="text-[9px] font-mono text-zinc-400">{result.volatilityScore}/100</p>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${result.volatilityScore >= 70 ? "bg-emerald-500" : result.volatilityScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${result.volatilityScore}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accuracy Engine */}
      {(result.entryQualityScore !== undefined || result.marketStructureTrend) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <span className="text-blue-400">⬡</span> Accuracy Engine
            </p>
            {result.entryQualityScore !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">Entry Quality</span>
                <span className={`text-sm font-black font-mono px-2 py-0.5 rounded ${
                  result.entryQualityScore >= 80 ? "bg-emerald-500/20 text-emerald-300" :
                  result.entryQualityScore >= 60 ? "bg-yellow-500/20 text-yellow-300" :
                  "bg-red-500/20 text-red-300"
                }`}>{result.entryQualityLabel ?? "—"}</span>
                <span className="text-xs font-mono text-zinc-400">{result.entryQualityScore}/100</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {result.marketStructureTrend && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Market Structure</span>
                <span className={`font-mono capitalize ${
                  result.marketStructureTrend === "uptrend" ? "text-emerald-400" :
                  result.marketStructureTrend === "downtrend" ? "text-red-400" : "text-zinc-400"
                }`}>{result.marketStructureTrend}</span>
              </div>
            )}
            {result.adx !== undefined && (
              <div className="flex justify-between">
                <span className="text-zinc-500">ADX</span>
                <span className={`font-mono ${result.adx > 25 ? "text-emerald-400" : "text-zinc-400"}`}>
                  {result.adx.toFixed(1)} {result.adx > 25 ? "· Trending" : "· Ranging"}
                </span>
              </div>
            )}
            {result.liquiditySweep !== undefined && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Liquidity Sweep</span>
                <span className={`font-mono ${result.liquiditySweep ? "text-emerald-400" : "text-zinc-600"}`}>
                  {result.liquiditySweep ? "✓ Detected" : "None"}
                </span>
              </div>
            )}
            {result.fvgDetected !== undefined && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Fair Value Gap</span>
                <span className={`font-mono ${result.fvgDetected ? "text-blue-400" : "text-zinc-600"}`}>
                  {result.fvgDetected ? "✓ Detected" : "None"}
                </span>
              </div>
            )}
            {result.rsiDivergence && (
              <div className="flex justify-between">
                <span className="text-zinc-500">RSI Divergence</span>
                <span className={`font-mono capitalize ${
                  result.rsiDivergence === "bullish" ? "text-emerald-400" : "text-red-400"
                }`}>{result.rsiDivergence}</span>
              </div>
            )}
            {result.vwapSignal && result.vwapSignal !== "neutral" && (
              <div className="flex justify-between">
                <span className="text-zinc-500">VWAP Signal</span>
                <span className={`font-mono capitalize ${
                  result.vwapSignal.includes("above") ? "text-emerald-400" :
                  result.vwapSignal.includes("below") ? "text-red-400" : "text-zinc-400"
                }`}>{result.vwapSignal}</span>
              </div>
            )}
            {result.candlePattern && result.candlePattern !== "No Pattern" && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Candle Pattern</span>
                <span className="font-mono text-violet-400">{result.candlePattern}</span>
              </div>
            )}
            {result.nearFibLevel && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Fibonacci</span>
                <span className="font-mono text-amber-400">Near Key Level</span>
              </div>
            )}
          </div>
          {result.accuracyFactors && result.accuracyFactors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">Accuracy Signals</p>
              <div className="flex flex-wrap gap-1.5">
                {result.accuracyFactors.map((f, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result.analysis && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-violet-400" /> AI Analysis
          </p>
          <p className="text-sm text-zinc-300 leading-relaxed">{result.analysis}</p>
        </div>
      )}

      <button onClick={onRescan} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-700/60 bg-zinc-900/40 hover:border-zinc-500 text-zinc-400 hover:text-white text-sm font-bold transition-all">
        <RefreshCw className="w-4 h-4" /> Re-Scan
      </button>
    </div>
  );
}
