import { useTrades } from "@/contexts/TradeContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Trophy, AlertTriangle,
  Brain, ArrowUpRight, ArrowDownRight, Info, Target, Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { keepFirstRecordPerSymbol, withUniqueSymbolRenderKeys } from "@/lib/uniqueListKeys";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const winRateColor = (wr: number) =>
  wr >= 65 ? "text-emerald-400" : wr >= 50 ? "text-yellow-400" : "text-red-400";

const winRateBg = (wr: number) =>
  wr >= 65 ? "bg-emerald-500/10 border-emerald-500/30" : wr >= 50 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30";

const actionBadge = (action: string) => {
  if (action === "BOOST") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (action === "SUPPRESS") return "bg-red-500/20 text-red-300 border-red-500/30";
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
};

const actionIcon = (action: string) => {
  if (action === "BOOST") return <ArrowUpRight className="w-3 h-3" />;
  if (action === "SUPPRESS") return <ArrowDownRight className="w-3 h-3" />;
  return <Minus className="w-3 h-3" />;
};

const biasIcon = (bias: string) => {
  if (bias === "LONG_BIAS") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (bias === "SHORT_BIAS") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-zinc-500" />;
};

// ─── Signal Accuracy Panel ───────────────────────────────────────────────────
function SignalAccuracyPanel() {
  const { data: accuracy, isLoading } = trpc.scanner.symbolAccuracy.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
        <span className="text-xs text-zinc-500">Loading signal accuracy…</span>
      </div>
    );
  }

  if (!accuracy || accuracy.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-zinc-300">Signal Accuracy</span>
        </div>
        <p className="text-xs text-zinc-600">No verified signals yet. Accuracy data will appear once signals hit TP or SL.</p>
      </div>
    );
  }

  const totalWins = accuracy.reduce((s, a) => s + a.wins, 0);
  const totalLosses = accuracy.reduce((s, a) => s + a.losses, 0);
  const overallWinRate = totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0;
  const accuracyRows = withUniqueSymbolRenderKeys(keepFirstRecordPerSymbol(accuracy).slice(0, 12), "accuracy");

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-zinc-300">Signal Verifier Accuracy</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Overall:</span>
          <span className={winRateColor(overallWinRate)}>{overallWinRate}%</span>
          <span className="text-zinc-600">({totalWins}W / {totalLosses}L)</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {accuracyRows.map((a) => (
          <div key={a.renderKey} className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-zinc-200">{a.symbol}</span>
              <span className="text-[10px] text-zinc-600">({a.total})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${winRateColor(a.winRate)}`}>{a.winRate}%</span>
              <span className="text-[10px] text-zinc-600">{a.avgRR}R</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyPairs() {
  const { symbolPatterns, isPersisted, lastUploadedAt } = useTrades();
  const uniqueSymbolPatterns = keepFirstRecordPerSymbol(symbolPatterns);

  // Sort by win rate descending
  const sorted = withUniqueSymbolRenderKeys(uniqueSymbolPatterns, "pair")
    .sort((a, b) => b.winRate - a.winRate);
  const bestPair = sorted[0] ?? null;
  const worstPair = sorted[sorted.length - 1] ?? null;

  // Stats
  const totalTrades = uniqueSymbolPatterns.reduce((s, p) => s + p.tradeCount, 0);
  const totalPnl = uniqueSymbolPatterns.reduce((s, p) => s + p.totalPnl, 0);
  const boostedCount = uniqueSymbolPatterns.filter(p => p.action === "BOOST").length;
  const suppressedCount = uniqueSymbolPatterns.filter(p => p.action === "SUPPRESS").length;

  if (!isPersisted || uniqueSymbolPatterns.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <BarChart2 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-300 mb-2">No pair data yet</h2>
          <p className="text-zinc-500 text-sm mb-6">
            Upload your trade history CSV on the{" "}
            <Link href="/platform" className="text-violet-400 hover:text-violet-300 underline">
              Platform page
            </Link>{" "}
            to see your per-symbol performance breakdown.
          </p>
          <Link href="/platform">
            <Button variant="outline" className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10">
              Go to Platform
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800/60 bg-zinc-900/40 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-violet-400" />
              My Pairs
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Per-symbol performance from your trade history
              {lastUploadedAt && (
                <span className="ml-2 text-zinc-600">
                  · Last updated {lastUploadedAt.toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
          <Link href="/platform">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white text-xs">
              ← Back to Platform
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="text-xs text-zinc-500 mb-1">Total Pairs</div>
            <div className="text-2xl font-bold text-white">{uniqueSymbolPatterns.length}</div>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="text-xs text-zinc-500 mb-1">Total Trades</div>
            <div className="text-2xl font-bold text-white">{totalTrades}</div>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="text-xs text-zinc-500 mb-1">Total Realised PnL</div>
            <div className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="text-xs text-zinc-500 mb-1">Boosted / Suppressed</div>
            <div className="text-2xl font-bold">
              <span className="text-emerald-400">{boostedCount}</span>
              <span className="text-zinc-600 mx-1">/</span>
              <span className="text-red-400">{suppressedCount}</span>
            </div>
          </div>
        </div>

        {/* Best & Worst pair highlight */}
        {bestPair && worstPair && bestPair.symbol !== worstPair.symbol && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Best Pair</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg text-white">{bestPair.symbol}</div>
                  <div className="text-xs text-zinc-400">{bestPair.tradeCount} trades · {bestPair.summary}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-emerald-400">{bestPair.winRate}%</div>
                  <div className="text-xs text-zinc-500">win rate</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Worst Pair</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg text-white">{worstPair.symbol}</div>
                  <div className="text-xs text-zinc-400">{worstPair.tradeCount} trades · {worstPair.summary}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-red-400">{worstPair.winRate}%</div>
                  <div className="text-xs text-zinc-500">win rate</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <span className="text-emerald-400 font-semibold">BOOST</span> — signals on this pair get +confidence.{" "}
            <span className="text-red-400 font-semibold">SUPPRESS</span> — signals get −confidence.{" "}
            Win rate ≥ 65% = BOOST · ≤ 40% = SUPPRESS.
          </span>
        </div>

        {/* Table — desktop */}
        <div className="hidden md:block rounded-xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pair</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Trades</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Win Rate</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">W / L</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Avg PnL</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total PnL</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bias</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Signal Adj.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.renderKey} className={`border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors ${i === 0 ? "bg-emerald-500/3" : i === sorted.length - 1 ? "bg-red-500/3" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{p.symbol}</span>
                      {i === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                      {i === sorted.length - 1 && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-400 font-mono">{p.tradeCount}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold font-mono ${winRateColor(p.winRate)}`}>{p.winRate}%</span>
                    <div className={`mt-1 mx-auto h-1 rounded-full w-16 ${winRateBg(p.winRate)} overflow-hidden`}>
                      <div className={`h-full rounded-full ${p.winRate >= 65 ? "bg-emerald-500" : p.winRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${p.winRate}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    <span className="text-emerald-400">{p.wins}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span className="text-red-400">{p.losses}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm ${p.avgPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {p.avgPnl >= 0 ? "+" : ""}${p.avgPnl.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm ${p.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {p.totalPnl >= 0 ? "+" : ""}${p.totalPnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      {biasIcon(p.bias)}
                      <span className="text-xs text-zinc-500">
                        {p.bias === "LONG_BIAS" ? "Long" : p.bias === "SHORT_BIAS" ? "Short" : "Mixed"}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    <span className={`${p.confidenceAdjustment > 0 ? "text-emerald-400" : p.confidenceAdjustment < 0 ? "text-red-400" : "text-zinc-500"}`}>
                      {p.confidenceAdjustment > 0 ? "+" : ""}{p.confidenceAdjustment}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border ${actionBadge(p.action)}`}>
                      {actionIcon(p.action)}
                      {p.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards — mobile */}
        <div className="md:hidden space-y-3">
          {sorted.map((p, i) => (
            <div key={p.renderKey} className={`rounded-xl border bg-zinc-900/40 p-4 ${i === 0 ? "border-emerald-500/30" : i === sorted.length - 1 ? "border-red-500/30" : "border-zinc-800/60"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{p.symbol}</span>
                  {i === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                  {i === sorted.length - 1 && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border ${actionBadge(p.action)}`}>
                  {actionIcon(p.action)}
                  {p.action}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-600 uppercase mb-0.5">Win Rate</div>
                  <div className={`font-bold font-mono text-sm ${winRateColor(p.winRate)}`}>{p.winRate}%</div>
                </div>
                <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-600 uppercase mb-0.5">Trades</div>
                  <div className="font-bold text-sm text-white">{p.tradeCount}</div>
                </div>
                <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-600 uppercase mb-0.5">Total PnL</div>
                  <div className={`font-bold font-mono text-sm ${p.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {p.totalPnl >= 0 ? "+" : ""}${p.totalPnl.toFixed(0)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="flex items-center gap-1">{biasIcon(p.bias)} {p.bias.replace("_BIAS", "").replace("_", " ")}</span>
                <span>W/L: <span className="text-emerald-400">{p.wins}</span>/<span className="text-red-400">{p.losses}</span></span>
                <span>Adj: <span className={p.confidenceAdjustment > 0 ? "text-emerald-400" : p.confidenceAdjustment < 0 ? "text-red-400" : "text-zinc-500"}>
                  {p.confidenceAdjustment > 0 ? "+" : ""}{p.confidenceAdjustment}%
                </span></span>
              </div>
            </div>
          ))}
        </div>

        {/* Signal Accuracy Section */}
        <SignalAccuracyPanel />

        {/* Quick Predict CTA */}
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-violet-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-violet-300">Analyse a pair with Quick Predict</div>
              <div className="text-xs text-zinc-500">Get an AI direction verdict for any pair in your history</div>
            </div>
          </div>
          <Link href="/predict">
            <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white text-xs">
              Open Predictor
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
