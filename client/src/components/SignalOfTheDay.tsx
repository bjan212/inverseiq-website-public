import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  Shield,
  Clock,
  Zap,
  BarChart2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXCHANGE_COLORS, EXCHANGE_ICONS } from "@/lib/multiExchangeScanner";

interface DaySignal {
  symbol: string;
  exchange: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  compositeScore: number;
  riskReward: number;
  strategy: string;
  volume24h: number;
  priceChange24h: number;
  fundingRate: number;
  generatedAt: Date;
  validUntil: Date;
}

// Compute validity window: higher confidence = longer window (1h–6h)
function computeValidityMs(confidence: number): number {
  // confidence 60 → 1h, confidence 90 → 6h
  const minMs = 60 * 60 * 1000;
  const maxMs = 6 * 60 * 60 * 1000;
  const ratio = Math.min(1, Math.max(0, (confidence - 60) / 30));
  return minMs + ratio * (maxMs - minMs);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

// Cache key for localStorage
const CACHE_KEY = "inverseiq_signal_of_day_v2";
const CACHE_TTL_MS = 60 * 60 * 1000; // refresh every 1h

function loadCachedSignal(): DaySignal | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const age = Date.now() - new Date(parsed.generatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return {
      ...parsed,
      generatedAt: new Date(parsed.generatedAt),
      validUntil: new Date(parsed.validUntil),
    };
  } catch {
    return null;
  }
}

function saveCachedSignal(signal: DaySignal) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(signal));
  } catch {}
}

export default function SignalOfTheDay() {
  const [signal, setSignal] = useState<DaySignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [expired, setExpired] = useState(false);

  // Server-side selector returns only pending, unexpired, explicitly A/A+-graded signals.
  const { data: dayRecord, refetch: refetchDayRecord } = trpc.signals.signalOfTheDay.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const fetchSignal = useCallback(async (force = false) => {
    // Try cache first
    if (!force) {
      const cached = loadCachedSignal();
      if (cached) {
        setSignal(cached);
        setExpired(Date.now() > cached.validUntil.getTime());
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const recent = force ? (await refetchDayRecord()).data : dayRecord;
      if (recent) {
        const generatedAt = new Date(recent.generatedAt);
        const validUntil = recent.expiresAt ? new Date(recent.expiresAt) : new Date(generatedAt.getTime() + computeValidityMs(recent.confidence));
        const rrStr = recent.riskRewardRatio ?? "1:2";
        const rrNum = parseFloat(rrStr.replace("1:", "")) || 2;
        const daySignal: DaySignal = {
          symbol: recent.symbol,
          exchange: "multi",
          direction: recent.direction,
          entryPrice: parseFloat(recent.entryPrice),
          stopLoss: parseFloat(recent.stopLoss),
          takeProfit: parseFloat(recent.takeProfit),
          confidence: recent.confidence,
          compositeScore: recent.confidence,
          riskReward: rrNum,
          strategy: recent.strategy,
          volume24h: 0,
          priceChange24h: 0,
          fundingRate: 0,
          generatedAt,
          validUntil,
        };
        setSignal(daySignal);
        setExpired(Date.now() > validUntil.getTime());
        saveCachedSignal(daySignal);
        return;
      }
      setSignal(null);
      setError("No valid A/A+ signal has been logged in the last 24 hours.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to fetch signal");
    } finally {
      setLoading(false);
    }
  }, [dayRecord, refetchDayRecord]);

  useEffect(() => {
    fetchSignal();
  }, [fetchSignal]);

  // Countdown timer
  useEffect(() => {
    if (!signal) return;
    const tick = () => {
      const remaining = signal.validUntil.getTime() - Date.now();
      setCountdown(Math.max(0, remaining));
      setExpired(remaining <= 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [signal]);

  const countdownPct = signal
    ? Math.max(0, Math.min(100, (countdown / computeValidityMs(signal.confidence)) * 100))
    : 0;

  const timerColor =
    countdownPct > 50 ? "text-green-400" : countdownPct > 20 ? "text-yellow-400" : "text-red-400";
  const barColor =
    countdownPct > 50 ? "bg-green-500" : countdownPct > 20 ? "bg-yellow-500" : "bg-red-500";

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border/30 bg-card p-8 text-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className=" text-muted-foreground">Scanning all markets for today's best signal…</p>
        </div>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border/30 bg-card p-8 text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className=" text-muted-foreground mb-4">{error ?? "Loading signal…"}</p>
          <Button onClick={() => fetchSignal(true)} variant="outline" size="sm" className="">
            <RefreshCw className="w-3 h-3 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

  const isLong = signal.direction === "LONG";
  const exchangeColor = EXCHANGE_COLORS[signal.exchange as keyof typeof EXCHANGE_COLORS] ?? "text-primary border-primary/30 bg-primary/10";
  const exchangeIcon = EXCHANGE_ICONS[signal.exchange as keyof typeof EXCHANGE_ICONS] ?? "🔮";

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className={`rounded-2xl border ${
          expired ? "border-border/30 opacity-60 grayscale" : isLong ? "border-green-500/40" : "border-red-500/40"
        } bg-card overflow-hidden`}
      >
        {/* Top bar */}
        <div
          className={`px-6 py-4 flex items-center justify-between ${
            expired ? "bg-secondary/20" : isLong ? "bg-green-500/10" : "bg-red-500/10"
          }`}
        >
          <div className="flex items-center gap-3">
            {isLong ? (
              <TrendingUp className="w-6 h-6 text-green-400" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-xl text-foreground">{signal.symbol}</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    isLong
                      ? "bg-green-500/20 text-green-300 border border-green-500/30"
                      : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}
                >
                  {signal.direction}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-mono border ${exchangeColor}`}>
                  {exchangeIcon} {signal.exchange === "multi" ? "Multi-Exchange" : signal.exchange.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Strategy: {signal.strategy} · Generated {signal.generatedAt.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-bold tracking-tight text-2xl text-primary">{signal.confidence}%</span>
            </div>
            <p className="text-xs text-muted-foreground">AI Confidence</p>
          </div>
        </div>

        {/* Main content */}
        <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-secondary/20 border border-border/20">
            <p className="text-xs text-muted-foreground mb-1">Entry Price</p>
            <p className="font-bold tracking-tight text-foreground text-sm">${signal.entryPrice.toFixed(signal.entryPrice < 1 ? 6 : 2)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/20">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="w-3 h-3 text-green-400" />
              <p className="text-xs text-green-400">Take Profit</p>
            </div>
            <p className="font-bold tracking-tight text-green-300 text-sm">${signal.takeProfit.toFixed(signal.takeProfit < 1 ? 6 : 2)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Shield className="w-3 h-3 text-red-400" />
              <p className="text-xs text-red-400">Stop Loss</p>
            </div>
            <p className="font-bold tracking-tight text-red-300 text-sm">${signal.stopLoss.toFixed(signal.stopLoss < 1 ? 6 : 2)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/20 border border-border/20">
            <div className="flex items-center justify-center gap-1 mb-1">
              <BarChart2 className="w-3 h-3 text-blue-400" />
              <p className="text-xs text-blue-400">Risk/Reward</p>
            </div>
            <p className="font-bold tracking-tight text-blue-300 text-sm">{signal.riskReward.toFixed(2)}x</p>
          </div>
        </div>

        {/* Validity countdown */}
        <div className="px-6 pb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${expired ? "text-muted-foreground" : timerColor}`} />
              <span className={`text-sm font-semibold ${expired ? "text-muted-foreground" : timerColor}`}>
                {expired ? "Signal Expired" : `Valid for ${formatCountdown(countdown)}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {signal.volume24h > 0 && (
                <span className="text-xs text-muted-foreground">
                  Vol {formatVolume(signal.volume24h)}
                </span>
              )}
              {signal.priceChange24h !== 0 && (
                <span className={`text-xs ${signal.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {signal.priceChange24h >= 0 ? "+" : ""}{signal.priceChange24h.toFixed(2)}% 24h
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchSignal(true)}
                disabled={loading}
                className="border-border/50 text-xs h-7 px-2"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${expired ? "bg-muted-foreground/30" : barColor}`}
              style={{ width: `${expired ? 0 : countdownPct}%` }}
            />
          </div>
          {expired && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              This signal has expired. Click Refresh to load a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
