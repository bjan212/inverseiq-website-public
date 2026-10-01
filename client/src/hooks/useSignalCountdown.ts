import { useState, useEffect, useRef, useCallback } from "react";

export type CountdownStatus = "optimal" | "good" | "critical" | "expired";

export interface SignalCountdownState {
  remainingMs: number;
  totalMs: number;
  percentRemaining: number;
  status: CountdownStatus;
  formattedTime: string;
  isExpired: boolean;
  notified5min: boolean;
  notifiedExpiry: boolean;
}

/**
 * Calculate signal validity duration based on volatility, volume, timeframe, and RSI.
 * Short timeframes (5m candles) → 15-30 min validity.
 * Higher volatility → shorter validity window.
 * Stronger RSI divergence → shorter window (reversal imminent).
 */
export function calculateValidityMs(params: {
  volatility?: number;   // 0-1 normalised (higher = more volatile)
  volume24h?: number;    // raw volume
  avgVolume?: number;    // average volume for normalisation
  timeframeMinutes?: number; // candle timeframe in minutes (e.g. 5, 15, 60)
  rsi?: number;          // 0-100
  confidence?: number;   // 0-100 signal confidence
}): number {
  const {
    volatility = 0.3,
    volume24h,
    avgVolume,
    timeframeMinutes = 15,
    rsi = 50,
    confidence = 75,
  } = params;

  // Base validity: 3× the candle timeframe in milliseconds
  let baseMs = timeframeMinutes * 3 * 60 * 1000;

  // Volatility penalty: high volatility shrinks validity
  const volFactor = Math.max(0.4, 1 - volatility * 0.6);
  baseMs *= volFactor;

  // Volume boost: above-average volume extends validity slightly
  if (volume24h && avgVolume && avgVolume > 0) {
    const volRatio = Math.min(volume24h / avgVolume, 3);
    baseMs *= 0.8 + volRatio * 0.1; // up to 1.1× boost
  }

  // RSI extremes shorten validity (reversal risk)
  const rsiDistance = Math.abs(rsi - 50); // 0 = neutral, 50 = extreme
  const rsiFactor = Math.max(0.5, 1 - (rsiDistance / 50) * 0.5);
  baseMs *= rsiFactor;

  // Confidence boost: higher confidence = longer validity
  const confFactor = 0.7 + (confidence / 100) * 0.6;
  baseMs *= confFactor;

  // Clamp between 5 minutes and 4 hours
  const minMs = 5 * 60 * 1000;
  const maxMs = 4 * 60 * 60 * 1000;
  return Math.min(Math.max(baseMs, minMs), maxMs);
}

function formatTime(ms: number): string {
  if (ms <= 0) return "EXPIRED";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getStatus(percentRemaining: number): CountdownStatus {
  if (percentRemaining <= 0) return "expired";
  if (percentRemaining <= 20) return "critical";
  if (percentRemaining <= 50) return "good";
  return "optimal";
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    });
  }
}

/**
 * Hook that drives a live countdown for a single signal.
 * Pass signal metadata; hook returns real-time state and fires browser notifications.
 */
export function useSignalCountdown(params: {
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
}): SignalCountdownState {
  const {
    symbol,
    direction,
    createdAt,
    onExpire,
    ...validityParams
  } = params;

  const totalMs = useRef(calculateValidityMs(validityParams));
  const startTime = useRef(new Date(createdAt).getTime());
  const notified5min = useRef(false);
  const notifiedExpiry = useRef(false);

  const compute = useCallback((): SignalCountdownState => {
    const elapsed = Date.now() - startTime.current;
    const remaining = Math.max(0, totalMs.current - elapsed);
    const percent = totalMs.current > 0 ? (remaining / totalMs.current) * 100 : 0;
    return {
      remainingMs: remaining,
      totalMs: totalMs.current,
      percentRemaining: percent,
      status: getStatus(percent),
      formattedTime: formatTime(remaining),
      isExpired: remaining <= 0,
      notified5min: notified5min.current,
      notifiedExpiry: notifiedExpiry.current,
    };
  }, []);

  const [state, setState] = useState<SignalCountdownState>(compute);

  useEffect(() => {
    const tick = () => {
      const next = compute();
      setState(next);

      // 5-minute warning notification
      if (!notified5min.current && next.remainingMs <= 5 * 60 * 1000 && next.remainingMs > 0) {
        notified5min.current = true;
        sendBrowserNotification(
          `⚠️ Signal Expiring Soon – ${symbol}`,
          `Your ${direction} signal on ${symbol} expires in less than 5 minutes!`
        );
      }

      // Expiry notification
      if (!notifiedExpiry.current && next.isExpired) {
        notifiedExpiry.current = true;
        sendBrowserNotification(
          `🔴 Signal Expired – ${symbol}`,
          `Your ${direction} signal on ${symbol} has expired.`
        );
        onExpire?.();
      }
    };

    tick(); // immediate first tick
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [compute, symbol, direction, onExpire]);

  return state;
}
