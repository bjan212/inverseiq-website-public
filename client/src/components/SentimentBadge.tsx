/**
 * SentimentBadge
 *
 * Displays a compact AI sentiment indicator for a perpetual futures pair.
 * Shows label (STRONG BULL / BULL / NEUTRAL / BEAR / STRONG BEAR),
 * a score bar, and a tooltip with per-factor breakdown.
 *
 * Usage:
 *   <SentimentBadge symbol="BTCUSDT" exchange="binance" />
 *   <SentimentBadge symbol="ETHUSDT" size="lg" showBar />
 */

import { trpc } from "@/lib/trpc";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type SentimentLabel =
  | "STRONG_BULL"
  | "BULL"
  | "NEUTRAL"
  | "BEAR"
  | "STRONG_BEAR";

interface SentimentFactor {
  name: string;
  value: number;
  score: number;
  weight: number;
  label: string;
}

interface SentimentResult {
  symbol: string;
  exchange: string;
  score: number;
  label: SentimentLabel;
  factors: SentimentFactor[];
  summary: string;
  computedAt: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const LABEL_CONFIG: Record<
  SentimentLabel,
  {
    text: string;
    short: string;
    color: string;
    bg: string;
    border: string;
    barColor: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  STRONG_BULL: {
    text: "STRONG BULL",
    short: "S.BULL",
    color: "text-emerald-400",
    bg: "bg-emerald-950/60",
    border: "border-emerald-500/40",
    barColor: "bg-emerald-400",
    Icon: TrendingUp,
  },
  BULL: {
    text: "BULLISH",
    short: "BULL",
    color: "text-green-400",
    bg: "bg-green-950/60",
    border: "border-green-500/40",
    barColor: "bg-green-400",
    Icon: TrendingUp,
  },
  NEUTRAL: {
    text: "NEUTRAL",
    short: "NEUT",
    color: "text-yellow-400",
    bg: "bg-yellow-950/40",
    border: "border-yellow-500/30",
    barColor: "bg-yellow-400",
    Icon: Minus,
  },
  BEAR: {
    text: "BEARISH",
    short: "BEAR",
    color: "text-orange-400",
    bg: "bg-orange-950/60",
    border: "border-orange-500/40",
    barColor: "bg-orange-400",
    Icon: TrendingDown,
  },
  STRONG_BEAR: {
    text: "STRONG BEAR",
    short: "S.BEAR",
    color: "text-red-400",
    bg: "bg-red-950/60",
    border: "border-red-500/40",
    barColor: "bg-red-400",
    Icon: TrendingDown,
  },
};

// ─── Score bar ───────────────────────────────────────────────────────────────

function ScoreBar({
  score,
  barColor,
}: {
  score: number;
  barColor: string;
}) {
  return (
    <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", barColor)}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

// ─── Tooltip breakdown ───────────────────────────────────────────────────────

function FactorRow({ factor }: { factor: SentimentFactor }) {
  const pct = Math.round(factor.score);
  const barColor =
    pct >= 60 ? "bg-emerald-400" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-white/70">{factor.name}</span>
        <span className="text-white/90 font-mono">{pct}</span>
      </div>
      <div className="w-full h-0.5 rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-white/40 leading-tight">{factor.label}</p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface SentimentBadgeProps {
  symbol: string;
  exchange?: string;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
  showScore?: boolean;
  className?: string;
  /** If provided, use this data instead of fetching */
  data?: SentimentResult;
  /** Auto-refresh interval in ms (default 30000). Set 0 to disable. */
  refreshInterval?: number;
}

export function SentimentBadge({
  symbol,
  exchange = "binance",
  size = "md",
  showBar = false,
  showScore = false,
  className,
  data: externalData,
  refreshInterval = 30000,
}: SentimentBadgeProps) {
  const [refetchKey, setRefetchKey] = useState(0);

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval || externalData) return;
    const id = setInterval(() => setRefetchKey((k) => k + 1), refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, externalData]);

  const { data, isLoading, error, refetch } = trpc.sentiment.get.useQuery(
    { symbol, exchange },
    {
      enabled: !externalData,
      staleTime: 25000,
      refetchInterval: refreshInterval || false,
    }
  );

  const result = externalData ?? data;

  // ── Loading state ──
  if (!result && isLoading) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono",
          "bg-white/5 border-white/10 text-white/30 animate-pulse",
          className
        )}
      >
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        AI…
      </span>
    );
  }

  // ── Error / no data fallback ──
  if (!result || error) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono",
          "bg-white/5 border-white/10 text-white/20 cursor-pointer",
          className
        )}
        onClick={() => refetch()}
        title="Click to retry"
      >
        <Minus className="w-2.5 h-2.5" />
        N/A
      </span>
    );
  }

  const cfg = LABEL_CONFIG[result.label];
  const { Icon } = cfg;

  const sizeClasses = {
    sm: "text-[9px] px-1 py-0.5 gap-0.5",
    md: "text-[10px] px-1.5 py-0.5 gap-1",
    lg: "text-xs px-2 py-1 gap-1",
  };

  const iconSize = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("space-y-0.5", className)}>
            <span
              className={cn(
                "inline-flex items-center rounded border font-mono font-semibold cursor-default select-none",
                cfg.bg,
                cfg.border,
                cfg.color,
                sizeClasses[size]
              )}
            >
              <Icon className={iconSize[size]} />
              {size === "sm" ? cfg.short : cfg.text}
              {showScore && (
                <span className="ml-1 opacity-60">{result.score}</span>
              )}
            </span>
            {showBar && (
              <ScoreBar score={result.score} barColor={cfg.barColor} />
            )}
          </div>
        </TooltipTrigger>

        <TooltipContent
          side="top"
          className="w-64 p-3 bg-[#0d1117] border border-white/10 text-white shadow-2xl"
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-white">
                  AI Sentiment · {result.symbol.replace("USDT", "/USDT")}
                </p>
                <p className={cn("text-[11px] font-semibold mt-0.5", cfg.color)}>
                  {cfg.text} — {result.score}/100
                </p>
              </div>
              <button
                onClick={() => refetch()}
                className="text-white/30 hover:text-white/70 transition-colors"
                title="Refresh sentiment"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {/* Score bar */}
            <ScoreBar score={result.score} barColor={cfg.barColor} />

            {/* Summary */}
            <p className="text-[11px] text-white/60 leading-snug">
              {result.summary}
            </p>

            {/* Factors */}
            <div className="space-y-2 pt-1 border-t border-white/10">
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">
                Factor Breakdown
              </p>
              {result.factors.map((f) => (
                <FactorRow key={f.name} factor={f} />
              ))}
            </div>

            {/* Footer */}
            <p className="text-[9px] text-white/20 pt-1 border-t border-white/5">
              Updated {new Date(result.computedAt).toLocaleTimeString()} ·{" "}
              {result.exchange}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Inline row variant (for tables) ─────────────────────────────────────────

export function SentimentInline({
  symbol,
  exchange = "binance",
  className,
}: {
  symbol: string;
  exchange?: string;
  className?: string;
}) {
  return (
    <SentimentBadge
      symbol={symbol}
      exchange={exchange}
      size="sm"
      showBar
      className={className}
    />
  );
}

// ─── Card variant (for signal cards) ─────────────────────────────────────────

export function SentimentCard({
  symbol,
  exchange = "binance",
  className,
}: {
  symbol: string;
  exchange?: string;
  className?: string;
}) {
  return (
    <SentimentBadge
      symbol={symbol}
      exchange={exchange}
      size="md"
      showBar
      showScore
      className={className}
    />
  );
}

export default SentimentBadge;
