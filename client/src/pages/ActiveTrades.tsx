import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Bell,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import PageWrapper from "@/components/PageWrapper";

type Trade = {
  id: number;
  symbol: string;
  direction: string;
  entryPrice: string;
  takeProfit: string;
  stopLoss: string;
  takeProfit2: string | null;
  exchange: string | null;
  status: string;
  currentPnlPct: string | null;
  lastPrice: string | null;
  lastCheckedAt: string | Date | null;
  warningsSent: number;
  slWarned: number;
  closedPrice: string | null;
  closedAt: string | Date | null;
  createdAt: string | Date;
};

export default function ActiveTrades() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"open" | "all">("open");

  const openTradesQuery = trpc.activeTrades.getOpen.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refresh every 30s
  });

  const allTradesQuery = trpc.activeTrades.getAll.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated && tab === "all" }
  );

  const refreshMutation = trpc.activeTrades.refreshPrices.useMutation({
    onSuccess: () => {
      openTradesQuery.refetch();
      toast.success("Prices refreshed");
    },
    onError: () => toast.error("Failed to refresh prices"),
  });

  const closeMutation = trpc.activeTrades.close.useMutation({
    onSuccess: (data) => {
      openTradesQuery.refetch();
      allTradesQuery.refetch();
      if (data.exchangeClosed) {
        toast.success(`Trade closed on ${data.exchange ?? "exchange"} ✔`);
      } else if (data.reason) {
        toast.success(`Trade marked closed (exchange: ${data.reason})`);
      } else {
        toast.success("Trade closed");
      }
    },
    onError: () => toast.error("Failed to close trade"),
  });

  if (authLoading) {
    return (
      <PageWrapper>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Activity className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      </PageWrapper>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageWrapper>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Sign in to view your trades</h2>
            <p className="text-zinc-400 text-sm">Active trade tracking requires authentication.</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  const trades = tab === "open" ? (openTradesQuery.data ?? []) : (allTradesQuery.data ?? []);

  return (
    <PageWrapper>
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/scanner">
              <button className="text-zinc-400 hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white font-mono">Active Trades</h1>
              <p className="text-xs text-zinc-500">Live P&L monitoring with alerts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              Refresh Prices
            </Button>
            <Link href="/settings/notifications">
              <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white">
                <Bell className="w-3.5 h-3.5 mr-1.5" />
                Alerts
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 pt-6">
        <div className="flex gap-1 p-1 bg-zinc-900/60 rounded-lg border border-zinc-800/60 w-fit mb-6">
          <button
            onClick={() => setTab("open")}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "open" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Open Trades {openTradesQuery.data?.length ? `(${openTradesQuery.data.length})` : ""}
          </button>
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "all" ? "bg-zinc-700/60 text-white border border-zinc-600/60" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            All Trades
          </button>
        </div>

        {/* Trade Cards */}
        {trades.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <Activity className="w-12 h-12 text-zinc-700 mx-auto" />
            <h3 className="text-lg font-bold text-zinc-400">No {tab === "open" ? "open" : ""} trades yet</h3>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              Use the Live Scanner to find setups and click "I Took This Trade" to start tracking.
            </p>
            <Link href="/scanner">
              <Button variant="outline" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 mt-2">
                Go to Live Scanner
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {trades.map((trade: Trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onClose={(id, price, exchange) => closeMutation.mutate({ tradeId: id, closedPrice: price, status: "closed_manual", closeOnExchange: !!exchange })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
    </PageWrapper>
  );
}

function TradeCard({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose: (id: number, price: string, exchange: string | null) => void;
}) {
  const isLong = trade.direction === "LONG";
  const pnl = parseFloat(trade.currentPnlPct || "0");
  const isPositive = pnl > 0;
  const isNegative = pnl < 0;
  const entry = parseFloat(trade.entryPrice);
  const tp = parseFloat(trade.takeProfit);
  const sl = parseFloat(trade.stopLoss);
  const lastPrice = parseFloat(trade.lastPrice || trade.entryPrice);
  const isClosed = trade.status !== "open";

  // Calculate progress toward TP (0% = entry, 100% = TP, negative = toward SL)
  const range = Math.abs(tp - entry);
  const progress = range > 0 ? ((lastPrice - entry) / (tp - entry)) * 100 : 0;
  const clampedProgress = Math.max(-100, Math.min(100, progress));

  // Warning state
  const isNearSL = trade.slWarned > 0 || pnl < -3;

  return (
    <div className={`border rounded-xl p-4 transition-all ${
      isClosed
        ? "border-zinc-800/40 bg-zinc-900/20 opacity-70"
        : isNearSL
        ? "border-red-500/40 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
        : isPositive
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-zinc-800/60 bg-zinc-900/40"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLong ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
          <span className="font-mono font-bold text-white text-sm">
            {trade.symbol.replace("USDT", "")}
            <span className="text-zinc-600">USDT</span>
          </span>
          <Badge className={`text-[9px] border ${isLong ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-red-400 border-red-500/30 bg-red-500/5"}`}>
            {trade.direction}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {trade.exchange && (
            <span className="text-[9px] font-mono text-zinc-600 uppercase">{trade.exchange}</span>
          )}
          {isClosed ? (
            <Badge className={`text-[9px] ${trade.status === "hit_tp" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : trade.status === "hit_sl" ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-zinc-700/60 text-zinc-400 border-zinc-600"}`}>
              {trade.status === "hit_tp" ? "✓ TP HIT" : trade.status === "hit_sl" ? "✗ SL HIT" : "CLOSED"}
            </Badge>
          ) : isNearSL ? (
            <Badge className="text-[9px] bg-red-500/20 text-red-300 border-red-500/30 animate-pulse">
              ⚠ DANGER
            </Badge>
          ) : (
            <Badge className="text-[9px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
              ACTIVE
            </Badge>
          )}
        </div>
      </div>

      {/* P&L */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">P&L</p>
          <p className={`text-2xl font-black font-mono ${
            isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-zinc-400"
          }`}>
            {isPositive ? "+" : ""}{pnl.toFixed(2)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Last Price</p>
          <p className="text-sm font-mono text-white">
            ${lastPrice < 1 ? lastPrice.toFixed(6) : lastPrice < 100 ? lastPrice.toFixed(4) : lastPrice.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {!isClosed && (
        <div className="mb-3">
          <div className="flex justify-between text-[9px] font-mono text-zinc-600 mb-1">
            <span>SL: ${sl < 1 ? sl.toFixed(6) : sl.toFixed(2)}</span>
            <span>TP: ${tp < 1 ? tp.toFixed(6) : tp.toFixed(2)}</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all ${
                clampedProgress >= 0 ? "bg-emerald-500" : "bg-red-500"
              }`}
              style={{
                width: `${Math.abs(clampedProgress)}%`,
                marginLeft: clampedProgress < 0 ? `${100 - Math.abs(clampedProgress)}%` : "0",
              }}
            />
            {/* Entry marker */}
            <div className="absolute top-0 left-0 w-0.5 h-full bg-cyan-400" style={{ left: "0%" }} />
          </div>
        </div>
      )}

      {/* Levels */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <p className="text-[9px] text-cyan-400/70 uppercase tracking-widest">Entry</p>
          <p className="text-xs font-mono text-cyan-300">${entry < 1 ? entry.toFixed(6) : entry.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-emerald-400/70 uppercase tracking-widest">TP</p>
          <p className="text-xs font-mono text-emerald-300">${tp < 1 ? tp.toFixed(6) : tp.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-red-400/70 uppercase tracking-widest">SL</p>
          <p className="text-xs font-mono text-red-300">${sl < 1 ? sl.toFixed(6) : sl.toFixed(2)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Clock className="w-3 h-3" />
          {trade.lastCheckedAt
            ? `Updated ${new Date(trade.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Pending check"}
        </div>
        {!isClosed && (
          <Button
            onClick={() => onClose(trade.id, String(lastPrice), trade.exchange)}
            variant="outline"
            size="sm"
            className="text-[10px] h-6 px-2 border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/30"
          >
            <XCircle className="w-3 h-3 mr-1" /> Close
          </Button>
        )}
        {isClosed && trade.closedAt && (
          <span className="text-[10px] text-zinc-600 font-mono">
            Closed {new Date(trade.closedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Warning banner */}
      {isNearSL && !isClosed && (
        <div className="mt-3 p-2 rounded-lg border border-red-500/30 bg-red-500/5 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-[10px] text-red-300">
            Trade approaching stop loss. {trade.warningsSent > 0 ? `${trade.warningsSent} alert(s) sent.` : "Set up Telegram alerts to get notified."}
          </p>
        </div>
      )}
    </div>
  );
}
