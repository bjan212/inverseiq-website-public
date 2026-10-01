import { Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignalCountdown } from "@/hooks/useSignalCountdown";
import type { CountdownStatus } from "@/hooks/useSignalCountdown";

interface SignalCountdownProps {
  symbol: string;
  direction: "LONG" | "SHORT";
  createdAt: Date | string | number;
  volatility?: number;
  volume24h?: number;
  avgVolume?: number;
  timeframeMinutes?: number;
  rsi?: number;
  confidence?: number;
  onExpire?: () => void;
  onRefresh?: () => void;
  compact?: boolean; // compact mode for small cards
}

const STATUS_COLORS: Record<CountdownStatus, { text: string; bar: string; bg: string; label: string }> = {
  optimal: {
    text: "text-green-400",
    bar: "bg-green-500",
    bg: "bg-green-500/10 border-green-500/30",
    label: "OPTIMAL",
  },
  good: {
    text: "text-yellow-400",
    bar: "bg-yellow-500",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    label: "GOOD",
  },
  critical: {
    text: "text-red-400",
    bar: "bg-red-500",
    bg: "bg-red-500/10 border-red-500/30",
    label: "CRITICAL",
  },
  expired: {
    text: "text-muted-foreground",
    bar: "bg-muted",
    bg: "bg-muted/20 border-border",
    label: "EXPIRED",
  },
};

export function SignalCountdown({
  symbol,
  direction,
  createdAt,
  volatility,
  volume24h,
  avgVolume,
  timeframeMinutes,
  rsi,
  confidence,
  onExpire,
  onRefresh,
  compact = false,
}: SignalCountdownProps) {
  const countdown = useSignalCountdown({
    symbol,
    direction,
    createdAt,
    volatility,
    volume24h,
    avgVolume,
    timeframeMinutes,
    rsi,
    confidence,
    onExpire,
  });

  const colors = STATUS_COLORS[countdown.status];

  if (countdown.isExpired) {
    return (
      <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${colors.bg}`}>
        <Clock className={`h-3.5 w-3.5 ${colors.text} shrink-0`} />
        <span className={`text-xs font-mono font-bold ${colors.text}`}>SIGNAL EXPIRED</span>
        {onRefresh && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 ml-auto text-xs"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${colors.bar} ${countdown.status === "critical" ? "animate-pulse" : ""}`} />
        <span className={`text-xs font-mono font-bold ${colors.text}`}>{countdown.formattedTime}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2 space-y-1.5 ${colors.bg}`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className={`h-3.5 w-3.5 ${colors.text} shrink-0`} />
          <span className="text-xs text-muted-foreground font-medium">Valid for</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.bg}`}>
            {colors.label}
          </span>
        </div>
      </div>

      {/* Countdown time */}
      <div className={`text-lg font-mono font-bold tracking-widest ${colors.text} ${countdown.status === "critical" ? "animate-pulse" : ""}`}>
        {countdown.formattedTime}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${colors.bar}`}
          style={{ width: `${Math.max(0, countdown.percentRemaining)}%` }}
        />
      </div>

      {/* Validity window label */}
      <div className="text-xs text-muted-foreground">
        {Math.round(countdown.totalMs / 60000)}m window
        {countdown.remainingMs <= 5 * 60 * 1000 && countdown.remainingMs > 0 && (
          <span className="ml-2 text-red-400 font-semibold animate-pulse">⚠ Expiring soon</span>
        )}
      </div>
    </div>
  );
}
