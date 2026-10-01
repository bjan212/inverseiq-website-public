/**
 * SentimentOverview
 *
 * A compact sidebar panel showing real-time AI sentiment for the top
 * perpetual futures pairs. Fetches from trpc.sentiment.getTopPairs,
 * auto-refreshes every 30 seconds.
 *
 * Usage:
 *   <SentimentOverview />
 */

import { trpc } from "@/lib/trpc";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SentimentLabel =
  | "STRONG_BULL"
  | "BULL"
  | "NEUTRAL"
  | "BEAR"
  | "STRONG_BEAR";

interface SentimentResult {
  symbol: string;
  exchange: string;
  score: number;
  label: SentimentLabel;
  factors: { name: string; value: number; score: number; weight: number; label: string }[];
  summary: string;
  computedAt: number;
}

const LABEL_CONFIG: Record<
  SentimentLabel,
  { short: string; color: string; bg: string; bar: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  STRONG_BULL: { short: "S.BULL", color: "text-emerald-400", bg: "bg-emerald-500/10", bar: "bg-emerald-400", Icon: TrendingUp },
  BULL:        { short: "BULL",   color: "text-green-400",   bg: "bg-green-500/10",   bar: "bg-green-400",   Icon: TrendingUp },
  NEUTRAL:     { short: "NEUT",   color: "text-yellow-400",  bg: "bg-yellow-500/10",  bar: "bg-yellow-400",  Icon: Minus },
  BEAR:        { short: "BEAR",   color: "text-orange-400",  bg: "bg-orange-500/10",  bar: "bg-orange-400",  Icon: TrendingDown },
  STRONG_BEAR: { short: "S.BEAR", color: "text-red-400",     bg: "bg-red-500/10",     bar: "bg-red-400",     Icon: TrendingDown },
};

function SentimentRow({ item }: { item: SentimentResult }) {
  const cfg = LABEL_CONFIG[item.label];
  const { Icon } = cfg;
  const base = item.symbol.replace("USDT", "").replace("-PERP", "");

  return (
    <div className={cn("flex items-center gap-2 px-2 py-1.5 rounded-md", cfg.bg)}>
      {/* Symbol */}
      <span className="font-bold text-xs text-white w-12 shrink-0 font-mono">{base}</span>

      {/* Score bar */}
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", cfg.bar)}
          style={{ width: `${item.score}%` }}
        />
      </div>

      {/* Label */}
      <span className={cn("flex items-center gap-0.5 text-[9px] font-bold font-mono shrink-0", cfg.color)}>
        <Icon className="w-2.5 h-2.5" />
        {cfg.short}
      </span>

      {/* Score */}
      <span className="text-[9px] font-mono text-white/30 w-6 text-right shrink-0">{item.score}</span>
    </div>
  );
}

export function SentimentOverview({ className }: { className?: string }) {
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const { data, isLoading, refetch } = trpc.sentiment.getTopPairs.useQuery(undefined, {
    staleTime: 25000,
    refetchInterval: 30000,
  });

  // Track last refresh time
  if (data && data.length > 0 && data[0].computedAt > lastRefresh - 1000) {
    // intentionally not calling setLastRefresh here to avoid render loop
  }

  const items: SentimentResult[] = (data as SentimentResult[] | undefined) ?? [];

  // Sort: strong bull first, strong bear last
  const ORDER: SentimentLabel[] = ["STRONG_BULL", "BULL", "NEUTRAL", "BEAR", "STRONG_BEAR"];
  const sorted = [...items].sort(
    (a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label)
  );

  const bullCount = items.filter(i => i.label === "STRONG_BULL" || i.label === "BULL").length;
  const bearCount = items.filter(i => i.label === "STRONG_BEAR" || i.label === "BEAR").length;
  const overallBias = bullCount > bearCount ? "BULLISH" : bearCount > bullCount ? "BEARISH" : "NEUTRAL";
  const biasColor = overallBias === "BULLISH" ? "text-emerald-400" : overallBias === "BEARISH" ? "text-red-400" : "text-yellow-400";

  return (
    <div className={cn("bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3 space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            AI Sentiment
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <span className={cn("text-[9px] font-bold font-mono", biasColor)}>
              {overallBias}
            </span>
          )}
          <button
            onClick={() => { refetch(); setLastRefresh(Date.now()); }}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Refresh sentiment"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Rows */}
      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-7 rounded-md bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-2">No data available</p>
      ) : (
        <div className="space-y-1">
          {sorted.map(item => (
            <SentimentRow key={item.symbol} item={item} />
          ))}
        </div>
      )}

      {/* Footer */}
      {!isLoading && items.length > 0 && (
        <div className="flex justify-between text-[9px] text-zinc-600 pt-1 border-t border-zinc-800/60">
          <span>{bullCount} bull · {bearCount} bear</span>
          <span>Updated {new Date(lastRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}
    </div>
  );
}

export default SentimentOverview;
