/**
 * AI Trade Analyzer — XRYPT.NET
 * Expert futures analysis: multi-timeframe RSI/MACD/BB, funding rate, OI trend,
 * volume delta, liquidation distance, and LLM-powered hold/reduce/exit advice.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTrades } from "@/contexts/TradeContext";
import { InverseEngine } from "@/lib/inverseEngine";
import Navbar from "@/components/Navbar";
import TradeTakenButton from "@/components/TradeTakenButton";
import { Streamdown } from "streamdown";
import {
  Activity, AlertTriangle, BarChart2, Brain, CheckCircle2, ChevronDown,
  ChevronUp, Loader2, RefreshCw, ShieldAlert, TrendingDown, TrendingUp,
  XCircle, Zap, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Position {
  symbol: string;
  side: "long" | "short";
  size: number | string;
  entryPrice: number | string;
  markPrice: number | string;
  unrealizedPnl: number | string;
  leverage: number | string;
  exchange: string;
}

interface AnalysisResult {
  success: boolean;
  analysis: string;
  healthScore: number;
  riskLevel: "SAFE" | "CAUTION" | "DANGER" | "EXIT NOW";
  decision: "HOLD" | "ADD" | "REDUCE" | "EXIT";
  pnlPct: number;
  leveragedPnlPct: number;
  distanceToLiq: number;
  liqPrice?: number;
  cautionPrice?: number | null;
  hardStopPrice?: number | null;
  recoveryPrice?: number | null;
  error?: string;
}

type TFIndicator = {
  rsi: number;
  macd: { line: number; signal: number; histogram: number; crossing: string };
  bollingerBands: { upper: number; mid: number; lower: number; position: number; width: number };
  volumeTrend: string;
  volumeDelta: number;
  emaTrend: string;
  ema20: number;
  ema50: number;
  currentPrice: number;
  candleCount: number;
} | null;

type IndicatorsData = {
  timeframes: { "15m": TFIndicator; "1h": TFIndicator; "4h": TFIndicator; "1d": TFIndicator };
  fundingRate: number | null;
  fundingTrend: "positive" | "negative" | "neutral";
  oiTrend: "increasing" | "decreasing" | "stable";
  oiChange: number | null;
  confluenceScore: number;
  confluenceBias: "bullish" | "bearish" | "neutral";
  volumeProfile?: { poc: number; vah: number; val: number; vpBias: string; vpScore: number; priceVsPoc: string } | null;
  sentiment?: { sentimentScore: number; sentimentLabel: string; sentimentBias: string; fearGreedValue: number; fearGreedLabel: string; isTrending: boolean; trendingRank: number | null } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function toNum(v: number | string | undefined | null): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}

function riskColor(level: string) {
  if (level === "SAFE") return "text-emerald-400";
  if (level === "CAUTION") return "text-yellow-400";
  if (level === "DANGER") return "text-orange-400";
  return "text-red-500";
}

function riskBg(level: string) {
  if (level === "SAFE") return "bg-emerald-500/10 border-emerald-500/20";
  if (level === "CAUTION") return "bg-yellow-500/10 border-yellow-500/20";
  if (level === "DANGER") return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function decisionIcon(d: string) {
  if (d === "HOLD") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (d === "ADD") return <TrendingUp className="w-4 h-4 text-blue-400" />;
  if (d === "REDUCE") return <ChevronDown className="w-4 h-4 text-yellow-400" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function healthBarColor(score: number) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

function exchangeLabel(ex: string) {
  const map: Record<string, string> = {
    binance: "Binance", bybit: "Bybit", okx: "OKX",
    mexc: "MEXC", kucoin: "KuCoin", gateio: "Gate.io", bitget: "Bitget",
    hyperliquid: "Hyperliquid", asterdex: "AsterDEX",
  };
  return map[ex.toLowerCase()] ?? ex;
}

function rsiSignal(rsi: number, side: "long" | "short") {
  if (side === "long") {
    if (rsi >= 70) return { label: "Overbought — reversal risk", color: "text-red-400", icon: "⚠" };
    if (rsi <= 30) return { label: "Oversold — bounce likely", color: "text-emerald-400", icon: "✓" };
    if (rsi >= 55) return { label: "Bullish momentum", color: "text-emerald-400", icon: "▲" };
    return { label: "Weak — below midline", color: "text-yellow-400", icon: "→" };
  } else {
    if (rsi <= 30) return { label: "Oversold — reversal risk", color: "text-red-400", icon: "⚠" };
    if (rsi >= 70) return { label: "Overbought — drop likely", color: "text-emerald-400", icon: "✓" };
    if (rsi <= 45) return { label: "Bearish momentum", color: "text-emerald-400", icon: "▼" };
    return { label: "Weak — above midline", color: "text-yellow-400", icon: "→" };
  }
}

// ── Multi-Timeframe Indicators Panel ─────────────────────────────────────────
function IndicatorsPanel({ symbol, side }: { symbol: string; side: "long" | "short" }) {
  const { data, isLoading, isError } = trpc.tradeAnalyzer.indicators.useQuery(
    { symbol },
    { refetchInterval: 60_000, retry: false }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-zinc-600 text-xs py-4">
        <Loader2 className="w-3 h-3 animate-spin" />
        Fetching multi-timeframe indicators for {symbol}…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-zinc-600 text-xs py-4">
        Live indicators unavailable for {symbol} — Binance Futures API may not list this pair.
      </div>
    );
  }

  const d = data as IndicatorsData;
  const tfs = ["15m", "1h", "4h", "1d"] as const;
  const tfLabels = { "15m": "15 Min", "1h": "1 Hour", "4h": "4 Hour", "1d": "Daily" };

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Confluence summary */}
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border ${
        d.confluenceBias === "bullish" ? "bg-emerald-500/8 border-emerald-500/20" :
        d.confluenceBias === "bearish" ? "bg-red-500/8 border-red-500/20" :
        "bg-white/4 border-white/8"
      }`}>
        <div>
          <div className="text-xs font-semibold text-zinc-300 mb-0.5">Multi-Timeframe Confluence</div>
          <div className={`text-sm font-bold capitalize ${
            d.confluenceBias === "bullish" ? "text-emerald-400" :
            d.confluenceBias === "bearish" ? "text-red-400" : "text-zinc-400"
          }`}>
            {d.confluenceBias === "bullish" ? "▲ Bullish" : d.confluenceBias === "bearish" ? "▼ Bearish" : "→ Neutral"} alignment
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500 mb-0.5">Score</div>
          <div className={`text-lg font-bold font-mono ${
            d.confluenceScore > 0 ? "text-emerald-400" : d.confluenceScore < 0 ? "text-red-400" : "text-zinc-400"
          }`}>{d.confluenceScore > 0 ? "+" : ""}{d.confluenceScore}</div>
        </div>
      </div>

      {/* Funding rate + OI row */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="bg-white/4 rounded-lg p-3 border border-white/6">
          <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Funding Rate</div>
          {d.fundingRate !== null ? (
            <>
              <div className={`text-sm font-bold font-mono ${
                d.fundingTrend === "positive" ? "text-red-400" :
                d.fundingTrend === "negative" ? "text-emerald-400" : "text-zinc-300"
              }`}>
                {d.fundingRate > 0 ? "+" : ""}{d.fundingRate}%
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                {d.fundingTrend === "positive" ? "Longs paying — bearish pressure" :
                 d.fundingTrend === "negative" ? "Shorts paying — bullish pressure" : "Neutral"}
              </div>
            </>
          ) : <div className="text-xs text-zinc-600">N/A</div>}
        </div>
        <div className="bg-white/4 rounded-lg p-3 border border-white/6">
          <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Open Interest (8h)</div>
          {d.oiChange !== null ? (
            <>
              <div className={`text-sm font-bold font-mono ${
                d.oiTrend === "increasing" ? "text-emerald-400" :
                d.oiTrend === "decreasing" ? "text-red-400" : "text-zinc-300"
              }`}>
                {d.oiChange > 0 ? "+" : ""}{d.oiChange}%
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                {d.oiTrend === "increasing" ? "New money entering" :
                 d.oiTrend === "decreasing" ? "Positions closing" : "Stable positioning"}
              </div>
            </>
          ) : <div className="text-xs text-zinc-600">N/A</div>}
        </div>
      </div>

      {/* Volume Profile + Sentiment row */}
      {(d as any).volumeProfile || (d as any).sentiment ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {(d as any).volumeProfile && (
            <div className="bg-white/4 rounded-lg p-3 border border-white/6">
              <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Volume Profile</div>
              <div className={`text-sm font-bold capitalize ${
                (d as any).volumeProfile.vpBias === "bullish" ? "text-emerald-400" :
                (d as any).volumeProfile.vpBias === "bearish" ? "text-red-400" : "text-zinc-300"
              }`}>
                {(d as any).volumeProfile.vpBias === "bullish" ? "▲ Bullish" :
                 (d as any).volumeProfile.vpBias === "bearish" ? "▼ Bearish" : "→ Neutral"}
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                Price {(d as any).volumeProfile.priceVsPoc} POC · VP Score {(d as any).volumeProfile.vpScore}/100
              </div>
            </div>
          )}
          {(d as any).sentiment && (
            <div className="bg-white/4 rounded-lg p-3 border border-white/6">
              <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Market Sentiment</div>
              <div className={`text-sm font-bold ${
                (d as any).sentiment.sentimentBias === "bullish" ? "text-emerald-400" :
                (d as any).sentiment.sentimentBias === "bearish" ? "text-red-400" : "text-zinc-300"
              }`}>
                {(d as any).sentiment.sentimentLabel}
                {(d as any).sentiment.isTrending && <span className="ml-1 text-yellow-400 text-[10px]">🔥 #{(d as any).sentiment.trendingRank}</span>}
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                Fear &amp; Greed: {(d as any).sentiment.fearGreedValue} · {(d as any).sentiment.fearGreedLabel}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Per-timeframe breakdown */}
      <div className="space-y-2">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Timeframe Breakdown</div>
        {tfs.map(tf => {
          const ind = d.timeframes[tf];
          if (!ind) return (
            <div key={tf} className="flex items-center justify-between py-1.5 border-b border-white/4">
              <span className="text-xs text-zinc-600 w-14">{tfLabels[tf]}</span>
              <span className="text-xs text-zinc-700">No data</span>
            </div>
          );
          const sig = rsiSignal(ind.rsi, side);
          const macdBull = ind.macd.histogram > 0;
          const bbPos = ind.bollingerBands.position;
          const bbLabel = bbPos >= 80 ? "Upper band" : bbPos <= 20 ? "Lower band" : "Mid-range";
          return (
            <div key={tf} className="bg-white/3 rounded-lg p-3 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-300">{tfLabels[tf]}</span>
                <span className={`text-xs font-semibold ${ind.emaTrend === "bullish" ? "text-emerald-400" : ind.emaTrend === "bearish" ? "text-red-400" : "text-zinc-500"}`}>
                  EMA: {ind.emaTrend}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-0.5">RSI</div>
                  <div className={`text-xs font-bold font-mono ${sig.color}`}>{ind.rsi}</div>
                  <div className={`text-[9px] ${sig.color}`}>{sig.icon} {sig.label.split(" — ")[0]}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 mb-0.5">MACD</div>
                  <div className={`text-xs font-bold ${macdBull ? "text-emerald-400" : "text-red-400"}`}>
                    {macdBull ? "▲ Bull" : "▼ Bear"}
                  </div>
                  <div className={`text-[9px] font-mono ${ind.macd.histogram >= 0 ? "text-emerald-500/70" : "text-red-500/70"}`}>
                    {ind.macd.histogram >= 0 ? "+" : ""}{ind.macd.histogram.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 mb-0.5">BB Position</div>
                  <div className={`text-xs font-bold ${bbPos >= 80 ? "text-red-400" : bbPos <= 20 ? "text-emerald-400" : "text-zinc-400"}`}>
                    {bbPos.toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-zinc-600">{bbLabel}</div>
                </div>
              </div>
              {/* Volume delta */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/4">
                <span className="text-[10px] text-zinc-600">Volume delta</span>
                <span className={`text-[10px] font-semibold ${ind.volumeDelta > 10 ? "text-emerald-400" : ind.volumeDelta < -10 ? "text-red-400" : "text-zinc-500"}`}>
                  {ind.volumeDelta > 0 ? "+" : ""}{ind.volumeDelta}% {ind.volumeDelta > 10 ? "buy pressure" : ind.volumeDelta < -10 ? "sell pressure" : "balanced"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Position Card ─────────────────────────────────────────────────────────────
function PositionCard({
  position,
  onAnalyze,
  isAnalyzing,
  result,
}: {
  position: Position;
  onAnalyze: (p: Position) => void;
  isAnalyzing: boolean;
  result?: AnalysisResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [closeConfirmStep, setCloseConfirmStep] = useState<0 | 1 | 2>(0); // 0=idle, 1=first confirm, 2=executing
  const closePositionMutation = trpc.closePosition.execute.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message ?? "Position closed successfully");
      } else {
        toast.error(data.error ?? "Failed to close position");
      }
      setCloseConfirmStep(0);
    },
    onError: (err) => {
      toast.error(`Close failed: ${err.message}`);
      setCloseConfirmStep(0);
    },
  });

  const entry = toNum(position.entryPrice);
  const mark = toNum(position.markPrice);
  const pnl = toNum(position.unrealizedPnl);
  const lev = toNum(position.leverage);
  const pnlPct = entry > 0 ? ((mark - entry) / entry * 100 * (position.side === "long" ? 1 : -1)) : 0;
  const leveragedPnl = pnlPct * lev;
  const isProfit = pnl >= 0;

  // Liquidation price (isolated margin, 0.5% maintenance margin rate)
  // Formula: LONG liq = entry × (1 − (1 − MMR) / leverage)
  //          SHORT liq = entry × (1 + (1 − MMR) / leverage)
  const MMR = 0.005;
  const liqPrice = lev > 0
    ? position.side === "long"
      ? entry * (1 - (1 - MMR) / lev)
      : entry * (1 + (1 - MMR) / lev)
    : 0;
  const distToLiq = liqPrice > 0 ? Math.abs((mark - liqPrice) / mark * 100) : 100;
  const liqCritical = distToLiq < 5;
  const liqWarning = distToLiq < 15 && !liqCritical;

  return (
    <div className={`border rounded-lg overflow-hidden bg-[#0d0f11] min-w-0 ${
      liqCritical ? "border-red-500/50" : liqWarning ? "border-orange-500/30" : "border-white/8"
    }`}>
      {/* Liquidation warning banner */}
      {liqCritical && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300 font-medium">
            LIQUIDATION RISK: Only {distToLiq.toFixed(1)}% from liquidation (~${liqPrice.toFixed(2)}) — consider closing now
          </span>
        </div>
      )}
      {liqWarning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/8 border-b border-orange-500/15">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
          <span className="text-xs text-orange-300">
            Approaching liquidation: {distToLiq.toFixed(1)}% away (~${liqPrice.toFixed(2)})
          </span>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 flex-wrap">
        {/* Direction stripe */}
        <div className={`w-2 h-10 rounded-full flex-shrink-0 ${position.side === "long" ? "bg-emerald-500" : "bg-red-500"}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-base font-mono">{position.symbol}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              position.side === "long" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}>
              {position.side.toUpperCase()} {lev}x
            </span>
            <span className="text-xs text-zinc-500 border border-white/8 px-2 py-0.5 rounded">
              {exchangeLabel(position.exchange)}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400 font-mono flex-wrap">
            <span>Entry <span className="text-white">${entry.toFixed(4)}</span></span>
            <span>Mark <span className="text-white">${mark.toFixed(4)}</span></span>
            <span>Size <span className="text-white">{toNum(position.size).toFixed(4)}</span></span>
            {liqPrice > 0 && (
              <span className={liqCritical ? "text-red-400 font-semibold" : "text-zinc-600"}>
                Liq ~${liqPrice.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* PnL */}
        <div className="text-left sm:text-right flex-shrink-0">
          <div className={`font-bold font-mono text-base ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
            {isProfit ? "+" : ""}{pnl.toFixed(2)} USDT
          </div>
          <div className={`text-xs font-mono ${isProfit ? "text-emerald-500/70" : "text-red-500/70"}`}>
            {isProfit ? "+" : ""}{leveragedPnl.toFixed(2)}% leveraged
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            title="Multi-Timeframe Indicators"
            className={`flex items-center gap-1 px-2.5 py-2 border rounded-lg text-xs transition-colors ${
              showIndicators
                ? "bg-zinc-500/15 border-zinc-500/30 text-zinc-300"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-zinc-400 hover:text-white"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Indicators</span>
          </button>
          <button
            onClick={() => { onAnalyze(position); setExpanded(true); }}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            {isAnalyzing ? "Analyzing..." : "AI Analyze"}
          </button>
          <TradeTakenButton
            signalId={0}
            symbol={position.symbol}
            direction={position.side === "long" ? "LONG" : "SHORT"}
            entryPrice={entry}
          />
          {/* Close Position — double confirmation */}
          {closeConfirmStep === 0 && (
            <button
              onClick={() => setCloseConfirmStep(1)}
              title="Close this position at market"
              className="flex items-center gap-1 px-2.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-xs font-semibold text-red-400 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Close</span>
            </button>
          )}
          {closeConfirmStep === 1 && (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-red-500/40 rounded-lg p-2.5 shadow-lg">
              <div className="flex flex-col gap-0.5 mr-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Close at Market</span>
                <div className={`text-xs font-bold font-mono ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                  {isProfit ? "+" : ""}{pnl.toFixed(2)} USDT ({isProfit ? "+" : ""}{leveragedPnl.toFixed(2)}%)
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  Entry ${entry.toFixed(4)} → Mark ${mark.toFixed(4)}
                </div>
              </div>
              <button
                onClick={() => {
                  setCloseConfirmStep(2);
                  closePositionMutation.mutate({
                    symbol: position.symbol,
                    side: position.side,
                    size: String(toNum(position.size)),
                    exchange: position.exchange,
                  });
                }}
                className="flex items-center gap-1 px-2.5 py-2 bg-red-600 hover:bg-red-500 border border-red-500 rounded-lg text-xs font-bold text-white transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                CLOSE
              </button>
              <button
                onClick={() => setCloseConfirmStep(0)}
                className="px-2 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
          {closeConfirmStep === 2 && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Closing...
            </div>
          )}
        </div>

        {result && (
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-zinc-500 hover:text-white transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Multi-timeframe indicators panel */}
      {showIndicators && (
        <div className="border-t border-white/6 px-3 sm:px-4 py-4 bg-[#0a0c0e] max-h-[70svh] overflow-y-auto overscroll-contain">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Live Indicators — 15m / 1H / 4H / 1D
            </span>
          </div>
          <IndicatorsPanel symbol={position.symbol} side={position.side} />
        </div>
      )}

      {/* AI Analysis result */}
      {result && expanded && (
        <div className="border-t border-white/8 p-4 space-y-4">
          {/* Score + Risk + Decision */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#111316] rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">Health Score</div>
              <div className="text-2xl font-bold font-mono text-white">
                {result.healthScore}<span className="text-sm text-zinc-500">/100</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${healthBarColor(result.healthScore)}`} style={{ width: `${result.healthScore}%` }} />
              </div>
            </div>

            <div className={`rounded-lg p-3 border ${riskBg(result.riskLevel)}`}>
              <div className="text-xs text-zinc-500 mb-1">Risk Level</div>
              <div className={`text-lg font-bold ${riskColor(result.riskLevel)}`}>{result.riskLevel}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {result.riskLevel === "SAFE" && "Trade is healthy"}
                {result.riskLevel === "CAUTION" && "Monitor closely"}
                {result.riskLevel === "DANGER" && "Consider reducing"}
                {result.riskLevel === "EXIT NOW" && "Close immediately"}
              </div>
            </div>

            <div className="bg-[#111316] rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">AI Decision</div>
              <div className="flex items-center gap-2">
                {decisionIcon(result.decision)}
                <span className="text-lg font-bold text-white">{result.decision}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1 font-mono">
                Liq: ~{result.distanceToLiq.toFixed(1)}% away
              </div>
            </div>
          </div>

          {/* Critical price levels (if extracted) */}
          {(result.cautionPrice || result.hardStopPrice || result.recoveryPrice) && (
            <div className="grid grid-cols-3 gap-2">
              {result.cautionPrice && (
                <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-yellow-500/70 mb-0.5">Caution Level</div>
                  <div className="text-sm font-bold font-mono text-yellow-400">${result.cautionPrice.toFixed(2)}</div>
                </div>
              )}
              {result.hardStopPrice && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-red-500/70 mb-0.5">Hard Stop</div>
                  <div className="text-sm font-bold font-mono text-red-400">${result.hardStopPrice.toFixed(2)}</div>
                </div>
              )}
              {result.recoveryPrice && (
                <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-emerald-500/70 mb-0.5">Recovery Confirm</div>
                  <div className="text-sm font-bold font-mono text-emerald-400">${result.recoveryPrice.toFixed(2)}</div>
                </div>
              )}
            </div>
          )}

          {/* Full AI analysis */}
          <div className="bg-[#0a0c0e] border border-white/6 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Expert Analysis</span>
            </div>
            <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none">
              <Streamdown>{result.analysis}</Streamdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TradeAnalyzer() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({});
  const [analyzingKey, setAnalyzingKey] = useState<string | null>(null);
  const [manualPosition, setManualPosition] = useState({
    symbol: "", side: "long" as "long" | "short",
    entryPrice: "", currentPrice: "", leverage: "10",
    size: "1", exchange: "manual",
  });
  const [showManual, setShowManual] = useState(false);

  // Fetch positions from all connected exchanges
  const binanceRaw = trpc.binance.getPositions.useQuery(undefined, { retry: false });
  const bybitPositions = trpc.bybit.getPositions.useQuery(undefined, { retry: false });
  const okxPositions = trpc.okx.getPositions.useQuery(undefined, { retry: false });
  const mexcPositions = trpc.mexc.getPositions.useQuery(undefined, { retry: false });
  const kucoinPositions = trpc.kucoin.getPositions.useQuery(undefined, { retry: false });
  const gateioPositions = trpc.gateio.getPositions.useQuery(undefined, { retry: false });
  const bitgetPositions = trpc.bitget.getPositions.useQuery(undefined, { retry: false });
  const asterdexPositions = trpc.asterdex.getPositions.useQuery(undefined, { retry: false });
  const hyperliquidAccount = trpc.hyperliquid.getAccount.useQuery(undefined, { retry: false });

  // Binance returns { positions: [] } wrapper; others return flat arrays
  const binanceData: Position[] = Array.isArray(binanceRaw.data)
    ? binanceRaw.data as Position[]
    : ((binanceRaw.data as any)?.positions ?? []) as Position[];

  const analyzePosition = trpc.tradeAnalyzer.analyze.useMutation();
  const { symbolPatterns: userSymbolPatterns } = useTrades();
  const _inverseEngine = new InverseEngine([]);

  useEffect(() => {
    const all: Position[] = [
      ...binanceData,
      ...((bybitPositions.data ?? []) as Position[]),
      ...((okxPositions.data ?? []) as Position[]),
      ...((mexcPositions.data ?? []) as Position[]),
      ...((kucoinPositions.data ?? []) as Position[]),
      ...((gateioPositions.data ?? []) as Position[]),
      ...((bitgetPositions.data ?? []) as Position[]),
    ];
    // AsterDEX positions — normalize Binance-style positionRisk
    if (asterdexPositions.data?.positions) {
      for (const p of asterdexPositions.data.positions as Record<string, string | number>[]) {
        all.push({
          symbol: String(p.symbol ?? ""),
          side: parseFloat(String(p.positionAmt ?? "0")) > 0 ? "long" : "short",
          size: Math.abs(parseFloat(String(p.positionAmt ?? "0"))),
          entryPrice: parseFloat(String(p.entryPrice ?? "0")),
          markPrice: parseFloat(String(p.markPrice ?? "0")),
          unrealizedPnl: parseFloat(String(p.unrealizedProfit ?? "0")),
          leverage: parseFloat(String(p.leverage ?? "1")),
          exchange: "asterdex",
        });
      }
    }
    // Hyperliquid positions — normalize from getAccount response (USDC-denominated)
    if (hyperliquidAccount.data?.positions) {
      for (const p of hyperliquidAccount.data.positions) {
        all.push({
          symbol: `${p.symbol}/USDC`,
          side: p.side === "LONG" ? "long" : "short",
          size: Math.abs(parseFloat(p.size)),
          entryPrice: parseFloat(p.entryPx),
          markPrice: parseFloat((p as any).markPrice ?? p.entryPx),
          unrealizedPnl: parseFloat(p.unrealizedPnl),
          leverage: parseFloat((p as any).leverage ?? "1"),
          exchange: "hyperliquid",
        });
      }
    }
    setPositions(all);
  }, [
    binanceRaw.data, bybitPositions.data, okxPositions.data,
    mexcPositions.data, kucoinPositions.data, gateioPositions.data, bitgetPositions.data,
    asterdexPositions.data, hyperliquidAccount.data,
  ]);

  const isLoadingAny = binanceRaw.isLoading || bybitPositions.isLoading || okxPositions.isLoading;

  function positionKey(p: Position) {
    return `${p.exchange}-${p.symbol}-${p.side}`;
  }

  async function handleAnalyze(p: Position) {
    const key = positionKey(p);
    setAnalyzingKey(key);
    try {
      // Inject user's personal symbol pattern as context for the LLM
      const sp = _inverseEngine.getSymbolPattern(p.symbol, userSymbolPatterns);
      const symbolPatternContext = sp
        ? sp.summary
        : undefined;

      const result = await analyzePosition.mutateAsync({
        symbol: p.symbol,
        side: p.side,
        entryPrice: toNum(p.entryPrice),
        currentPrice: toNum(p.markPrice),
        leverage: toNum(p.leverage),
        size: toNum(p.size),
        unrealizedPnl: toNum(p.unrealizedPnl),
        exchange: p.exchange,
        symbolPatternContext,
      });
      setAnalyses(prev => ({ ...prev, [key]: result as AnalysisResult }));
    } catch {
      toast.error("Analysis failed. Please try again.");
    } finally {
      setAnalyzingKey(null);
    }
  }

  async function handleManualAnalyze() {
    if (!manualPosition.symbol || !manualPosition.entryPrice || !manualPosition.currentPrice) {
      toast.error("Please fill in symbol, entry price, and current price.");
      return;
    }
    const p: Position = {
      symbol: manualPosition.symbol.toUpperCase(),
      side: manualPosition.side,
      entryPrice: parseFloat(manualPosition.entryPrice),
      markPrice: parseFloat(manualPosition.currentPrice),
      leverage: parseFloat(manualPosition.leverage) || 1,
      size: parseFloat(manualPosition.size) || 1,
      unrealizedPnl: 0,
      exchange: manualPosition.exchange,
    };
    await handleAnalyze(p);
  }

  function refetchAll() {
    binanceRaw.refetch();
    bybitPositions.refetch();
    okxPositions.refetch();
    mexcPositions.refetch();
    kucoinPositions.refetch();
    gateioPositions.refetch();
    bitgetPositions.refetch();
    asterdexPositions.refetch();
    hyperliquidAccount.refetch();
  }

  const exchangeStatuses = [
    { label: "Binance", q: binanceRaw, count: binanceData.length },
    { label: "Bybit", q: bybitPositions, count: bybitPositions.data?.length ?? 0 },
    { label: "OKX", q: okxPositions, count: okxPositions.data?.length ?? 0 },
    { label: "MEXC", q: mexcPositions, count: mexcPositions.data?.length ?? 0 },
    { label: "KuCoin", q: kucoinPositions, count: kucoinPositions.data?.length ?? 0 },
    { label: "Gate.io", q: gateioPositions, count: gateioPositions.data?.length ?? 0 },
    { label: "Bitget", q: bitgetPositions, count: bitgetPositions.data?.length ?? 0 },
    { label: "AsterDEX", q: asterdexPositions, count: asterdexPositions.data?.positions?.length ?? 0 },
    { label: "Hyperliquid", q: hyperliquidAccount, count: hyperliquidAccount.data?.positions?.length ?? 0 },
  ];

  // Sort positions: liquidation risk first, then by PnL (worst first)
  const sortedPositions = [...positions].sort((a, b) => {
    const liqDist = (p: Position) => {
      const entry = toNum(p.entryPrice);
      const mark = toNum(p.markPrice);
      const lev = toNum(p.leverage);
      if (lev <= 0) return 100;
      const liq = p.side === "long" ? entry * (1 - (1 - 0.005) / lev) : entry * (1 + (1 - 0.005) / lev);
      return Math.abs((mark - liq) / mark * 100);
    };
    return liqDist(a) - liqDist(b);
  });

  return (
    <div className="min-h-screen bg-[#080a0c] text-white font-sans">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Brain className="w-6 h-6 text-zinc-300" />
                <h1 className="text-2xl font-bold text-white">AI Trade Analyzer</h1>
              </div>
              <p className="text-zinc-400 text-sm max-w-2xl">
                Expert futures analysis across all connected exchanges. Multi-timeframe RSI/MACD/BB, funding rate, open interest, volume delta, and AI-powered hold/reduce/exit recommendations.
              </p>
            </div>
            <button
              onClick={refetchAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh All
            </button>
          </div>
        </div>

        {/* Exchange status bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          {exchangeStatuses.map(({ label, q, count }) => (
            <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
              q.isLoading ? "border-white/10 text-zinc-600" :
              q.isError ? "border-red-500/20 text-red-400 bg-red-500/5" :
              count > 0 ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" :
              "border-white/8 text-zinc-600"
            }`}>
              {q.isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> :
               q.isError ? <XCircle className="w-3 h-3" /> :
               count > 0 ? <CheckCircle2 className="w-3 h-3" /> :
               <Activity className="w-3 h-3" />}
              {label}
              {!q.isLoading && !q.isError && count > 0 && (
                <span className="font-bold">{count}</span>
              )}
            </div>
          ))}
        </div>

        {/* Positions list */}
        {isLoadingAny ? (
          <div className="flex items-center gap-3 py-12 justify-center text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Fetching positions from connected exchanges…</span>
          </div>
        ) : sortedPositions.length > 0 ? (
          <div className="space-y-3 mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                {sortedPositions.length} Open Position{sortedPositions.length !== 1 ? "s" : ""} — sorted by liquidation proximity
              </h2>
            </div>
            {sortedPositions.map(p => (
              <PositionCard
                key={positionKey(p)}
                position={p}
                onAnalyze={handleAnalyze}
                isAnalyzing={analyzingKey === positionKey(p)}
                result={analyses[positionKey(p)]}
              />
            ))}
          </div>
        ) : (
          <div className="border border-white/8 rounded-lg p-8 text-center mb-8 bg-[#0d0f11]">
            <Activity className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium mb-1">No open positions found</p>
            <p className="text-zinc-600 text-sm mb-4">
              Connect your exchange API keys in{" "}
              <a href="/binance-setup" className="text-zinc-400 hover:text-white underline">Exchange Setup</a>{" "}
              to auto-pull positions, or enter a trade manually below.
            </p>
          </div>
        )}

        {/* Manual entry */}
        <div className="border border-white/8 rounded-lg overflow-hidden bg-[#0d0f11]">
          <button
            onClick={() => setShowManual(!showManual)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/3 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-zinc-400" />
              <span className="font-semibold text-white text-sm">Analyze a Trade Manually</span>
              <span className="text-xs text-zinc-500">— no API keys required</span>
            </div>
            {showManual ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {showManual && (
            <div className="border-t border-white/8 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Symbol", key: "symbol", placeholder: "BTCUSDT", type: "text" },
                  { label: "Entry Price", key: "entryPrice", placeholder: "65000", type: "number" },
                  { label: "Current Price", key: "currentPrice", placeholder: "67000", type: "number" },
                  { label: "Leverage", key: "leverage", placeholder: "10", type: "number" },
                  { label: "Size (contracts)", key: "size", placeholder: "1", type: "number" },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={manualPosition[key as keyof typeof manualPosition]}
                      onChange={e => setManualPosition(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/25"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Direction</label>
                  <select
                    value={manualPosition.side}
                    onChange={e => setManualPosition(prev => ({ ...prev, side: e.target.value as "long" | "short" }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
                  >
                    <option value="long">LONG</option>
                    <option value="short">SHORT</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleManualAnalyze}
                disabled={analyzingKey === `manual-${manualPosition.symbol}-${manualPosition.side}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/8 hover:bg-white/12 border border-white/15 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {analyzingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                Analyze This Trade
              </button>

              {/* Show manual result */}
              {(() => {
                const key = `manual-${manualPosition.symbol.toUpperCase()}-${manualPosition.side}`;
                const r = analyses[key];
                if (!r) return null;
                return (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#111316] rounded-lg p-3">
                        <div className="text-xs text-zinc-500 mb-1">Health Score</div>
                        <div className="text-2xl font-bold font-mono text-white">{r.healthScore}<span className="text-sm text-zinc-500">/100</span></div>
                        <div className="mt-2 h-1.5 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${healthBarColor(r.healthScore)}`} style={{ width: `${r.healthScore}%` }} />
                        </div>
                      </div>
                      <div className={`rounded-lg p-3 border ${riskBg(r.riskLevel)}`}>
                        <div className="text-xs text-zinc-500 mb-1">Risk Level</div>
                        <div className={`text-lg font-bold ${riskColor(r.riskLevel)}`}>{r.riskLevel}</div>
                      </div>
                      <div className="bg-[#111316] rounded-lg p-3">
                        <div className="text-xs text-zinc-500 mb-1">Decision</div>
                        <div className="flex items-center gap-2">
                          {decisionIcon(r.decision)}
                          <span className="text-lg font-bold text-white">{r.decision}</span>
                        </div>
                      </div>
                    </div>
                    {(r.cautionPrice || r.hardStopPrice || r.recoveryPrice) && (
                      <div className="grid grid-cols-3 gap-2">
                        {r.cautionPrice && (
                          <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-lg p-2.5 text-center">
                            <div className="text-[10px] text-yellow-500/70 mb-0.5">Caution Level</div>
                            <div className="text-sm font-bold font-mono text-yellow-400">${r.cautionPrice.toFixed(2)}</div>
                          </div>
                        )}
                        {r.hardStopPrice && (
                          <div className="bg-red-500/8 border border-red-500/20 rounded-lg p-2.5 text-center">
                            <div className="text-[10px] text-red-500/70 mb-0.5">Hard Stop</div>
                            <div className="text-sm font-bold font-mono text-red-400">${r.hardStopPrice.toFixed(2)}</div>
                          </div>
                        )}
                        {r.recoveryPrice && (
                          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                            <div className="text-[10px] text-emerald-500/70 mb-0.5">Recovery Confirm</div>
                            <div className="text-sm font-bold font-mono text-emerald-400">${r.recoveryPrice.toFixed(2)}</div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="bg-[#0a0c0e] border border-white/6 rounded-lg p-4">
                      <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                        <Streamdown>{r.analysis}</Streamdown>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 flex items-start gap-3 p-4 bg-[#0d0f11] border border-white/6 rounded-lg">
          <ShieldAlert className="w-5 h-5 text-zinc-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 leading-relaxed">
            AI analysis is based on leverage mechanics, multi-timeframe technical indicators, funding rate dynamics, and risk/reward mathematics. It is not financial advice. Always use your own judgment and never risk more than you can afford to lose. High-leverage futures trading carries significant risk of liquidation.
          </p>
        </div>
      </div>
    </div>
  );
}
