/**
 * Signal Outcome Verification Service
 * 
 * This service runs periodically to check pending signals and update their outcomes
 * based on real market data from Binance.
 */

import { eq } from "drizzle-orm";
import { signalHistory } from "../drizzle/schema";
import {
  getDb,
  getPendingSignalCalibrationObservations,
  markSignalCalibrationObservationChecked,
  updateSignalCalibrationObservationOutcome,
  updateSignalOutcome,
} from "./db";
import axios from "axios";
import { saveNotification } from "./db";
import { broadcastNotification, broadcastSignalUpdate } from "./websocket";
import { sendMultiChannelNotification } from "./marketMonitor";
import { queueVerifiedSignalFeedback } from "./backendFeedback";
import { evaluateCalibrationOutcome } from "../shared/signalCalibration";

interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
  takerBuyBaseVolume: string;
  takerBuyQuoteVolume: string;
  ignore: string;
}

/**
 * Fetch historical price data from Bybit (replaces Binance which is geo-blocked)
 */
/** Normalise any stored symbol format to a canonical Bybit USDT-perp symbol (e.g. BTCUSDT) */
function normaliseSymbol(raw: string): string {
  let s = raw.toUpperCase()
    .replace(/\//g, "")
    .replace(/-PERP$/i, "")
    .replace(/:USDT$/i, "")
    .replace(/\.P$/i, "");
  // If it ends with USD but NOT USDT, append T to make it USDT
  if (s.endsWith("USD") && !s.endsWith("USDT")) s = s + "T";
  // If it still doesn't end with USDT, append USDT
  if (!s.endsWith("USDT")) s = s + "USDT";
  return s;
}

/** Convert any quoted perpetual symbol to the base-asset name required by Hyperliquid. */
export function toHyperliquidCoin(raw: string): string {
  return raw.toUpperCase()
    .replace(/\//g, "")
    .replace(/-PERP$/i, "")
    .replace(/:USDT$/i, "")
    .replace(/\.P$/i, "")
    .replace(/(USDT|USDC|USD)$/i, "")
    .replace(/[-_:]+$/, "");
}

export async function fetchVerificationKlines(
  symbol: string,
  startTime: number,
  endTime: number
): Promise<BinanceKline[]> {
  const sym = normaliseSymbol(symbol);

  // Hyperliquid is the execution venue for auto-trader positions. Verify a signal
  // against that venue first so basis differences or a failed CEX request do not
  // distort labels used for statistics and future model training.
  try {
    const coin = toHyperliquidCoin(symbol);
    const response = await axios.post(
      "https://api.hyperliquid.xyz/info",
      {
        type: "candleSnapshot",
        req: { coin, interval: "1m", startTime },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    const list: Array<{ t: number; o: string; h: string; l: string; c: string; v: string }> = response.data ?? [];
    if (list.length > 0) {
      return list
        .filter(k => k.t <= endTime)
        .sort((a, b) => a.t - b.t)
        .map(k => ({
          openTime: k.t,
          open: k.o,
          high: k.h,
          low: k.l,
          close: k.c,
          volume: k.v,
          closeTime: k.t + 60 * 1000,
          quoteVolume: "0",
          trades: 0,
          takerBuyBaseVolume: "0",
          takerBuyQuoteVolume: "0",
          ignore: "0",
        }));
    }
  } catch { /* fall through to CEX sources for signals not listed on HL */ }

  // Primary: OKX (no geo-block on deployed server)
  try {
    const base = sym.replace(/USDT$/, '');
    const instId = `${base}-USDT-SWAP`;
    const response = await axios.get(
      "https://www.okx.com/api/v5/market/candles",
      {
        params: {
          instId,
          bar: "5m",
          before: String(startTime - 1),
          after: String(endTime + 1),
          limit: 1000,
        },
        timeout: 10000,
      }
    );
    const list: string[][] = (response.data?.data ?? []).reverse();
    if (list.length > 0) {
      return list.map((k) => ({
        openTime: Number(k[0]),
        open: k[1],
        high: k[2],
        low: k[3],
        close: k[4],
        volume: k[5],
        closeTime: Number(k[0]) + 5 * 60 * 1000,
        quoteVolume: k[7] ?? "0",
        trades: 0,
        takerBuyBaseVolume: "0",
        takerBuyQuoteVolume: "0",
        ignore: "0",
      }));
    }
  } catch { /* fall through to Bybit */ }

  // Fallback: Bybit
  try {
    const response = await axios.get(
      "https://api.bybit.com/v5/market/kline",
      {
        params: {
          category: "linear",
          symbol: sym,
          interval: "5",
          start: startTime,
          end: endTime,
          limit: 1000,
        },
        timeout: 10000,
      }
    );
    const list: string[][] = (response.data?.result?.list ?? []).reverse();
    return list.map((k) => ({
      openTime: Number(k[0]),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
      closeTime: Number(k[0]) + 5 * 60 * 1000,
      quoteVolume: k[6] ?? "0",
      trades: 0,
      takerBuyBaseVolume: "0",
      takerBuyQuoteVolume: "0",
      ignore: "0",
    }));
  } catch (error) {
    console.error(`Failed to fetch klines for ${symbol}:`, error);
    return [];
  }
}

/**
 * Check if a signal hit its take profit or stop loss
 */
function checkSignalOutcome(
  signal: any,
  klines: BinanceKline[]
): { outcome: "hit_tp" | "hit_sl" | "expired"; exitPrice?: string } | null {
  const entryPrice = parseFloat(signal.entryPrice);
  const takeProfit = parseFloat(signal.takeProfit);
  const stopLoss = parseFloat(signal.stopLoss);

  for (const kline of klines) {
    const high = parseFloat(kline.high);
    const low = parseFloat(kline.low);

    if (signal.direction === "LONG") {
      // For LONG: check if high reached TP or low reached SL
      const hitTp = high >= takeProfit;
      const hitSl = low <= stopLoss;
      // A single OHLC bar cannot reveal which target was reached first. Do not
      // count the former TP-first bias as a win; wait for a later, unambiguous bar.
      if (hitTp && hitSl) continue;
      if (hitTp) {
        return { outcome: "hit_tp", exitPrice: takeProfit.toString() };
      }
      if (hitSl) {
        return { outcome: "hit_sl", exitPrice: stopLoss.toString() };
      }
    } else {
      // For SHORT: check if low reached TP or high reached SL
      const hitTp = low <= takeProfit;
      const hitSl = high >= stopLoss;
      if (hitTp && hitSl) continue;
      if (hitTp) {
        return { outcome: "hit_tp", exitPrice: takeProfit.toString() };
      }
      if (hitSl) {
        return { outcome: "hit_sl", exitPrice: stopLoss.toString() };
      }
    }
  }

  return null;
}

/**
 * Main verification function - checks all pending signals
 */
export async function verifyPendingSignals() {
  console.log("[SignalVerifier] Starting verification cycle...");

  const db = await getDb();
  if (!db) {
    console.warn("[SignalVerifier] Database not available");
    return;
  }

  try {
    // Get all pending signals
    const pendingSignals = await db
      .select()
      .from(signalHistory)
      .where(eq(signalHistory.outcome, "pending"));

    console.log(`[SignalVerifier] Found ${pendingSignals.length} pending signals`);

    for (const signal of pendingSignals) {
      try {
        const now = Date.now();
        const generatedAt = new Date(signal.generatedAt).getTime();
        const expiresAt = signal.expiresAt
          ? new Date(signal.expiresAt).getTime()
          : generatedAt + 24 * 60 * 60 * 1000; // Default 24h

        // Check if signal expired
        if (now > expiresAt) {
          console.log(`[SignalVerifier] Signal ${signal.id} expired`);
          await updateSignalOutcome(signal.id, "expired");
          continue;
        }

        // Fetch price data from signal generation to now
        const klines = await fetchVerificationKlines(
          signal.symbol,
          generatedAt,
          now
        );

        if (klines.length === 0) {
          console.warn(`[SignalVerifier] No klines data for ${signal.symbol}`);
          continue;
        }

        // Check if TP or SL was hit
        const result = checkSignalOutcome(signal, klines);

        if (result) {
          console.log(
            `[SignalVerifier] Signal ${signal.id} outcome: ${result.outcome}`
          );
          await updateSignalOutcome(
            signal.id,
            result.outcome,
            result.exitPrice
          );

          // Create notification for outcome
          const notificationTitle =
            result.outcome === "hit_tp"
              ? `🎯 Signal Hit Target!`
              : result.outcome === "hit_sl"
              ? `⚠️ Signal Hit Stop Loss`
              : `⏰ Signal Expired`;

          const notificationMessage = `${signal.symbol} ${signal.direction} - ${result.outcome === "hit_tp" ? "Target reached" : result.outcome === "hit_sl" ? "Stop loss triggered" : "Signal validity expired"} at ${result.exitPrice || "N/A"}`;

          const notificationType =
            result.outcome === "hit_tp"
              ? "signal_hit_tp"
              : result.outcome === "hit_sl"
              ? "signal_hit_sl"
              : "signal_expired";

          // Send multi-channel notification (browser, email, SMS)
          await sendMultiChannelNotification(
            notificationType as any,
            notificationTitle,
            notificationMessage,
            {
              ...signal,
              outcome: result.outcome,
              actualExitPrice: result.exitPrice,
            }
          );

          // Broadcast signal update
          broadcastSignalUpdate({
            id: signal.id,
            symbol: signal.symbol,
            direction: signal.direction,
            outcome: result.outcome,
            confidence: signal.confidence,
          });

          // Queue feedback locally. Delivery is retried by an authenticated durable
          // callback, so an external backend outage never loses verified outcomes.
          if (result.outcome === "hit_tp" || result.outcome === "hit_sl") {
            await queueVerifiedSignalFeedback({
              symbol: signal.symbol,
              direction: signal.direction as "LONG" | "SHORT",
              entry: parseFloat(signal.entryPrice),
              exit: parseFloat(result.exitPrice || signal.entryPrice),
              outcome: result.outcome === "hit_tp" ? "win" : "loss",
              confidence: signal.confidence,
              signalId: signal.id,
              strategy: signal.strategy,
            });
          }
        }

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(
          `[SignalVerifier] Failed to verify signal ${signal.id}:`,
          error
        );
      }
    }

    // Shadow calibration is private and bounded. It reuses the existing durable
    // verifier but never emits notifications, model feedback, or live orders.
    const pendingCalibration = await getPendingSignalCalibrationObservations(10);
    console.log(`[SignalVerifier] Found ${pendingCalibration.length} due shadow calibration observation(s)`);
    for (const observation of pendingCalibration) {
      try {
        const now = Date.now();
        const observedAt = new Date(observation.observedAt).getTime();
        const expiresAt = new Date(observation.expiresAt).getTime();
        const klines = await fetchVerificationKlines(
          observation.symbol,
          observedAt,
          Math.min(now, expiresAt),
        );
        if (klines.length === 0) {
          await markSignalCalibrationObservationChecked(observation.id);
          continue;
        }

        const result = evaluateCalibrationOutcome({
          direction: observation.direction,
          takeProfit: observation.takeProfit,
          stopLoss: observation.stopLoss,
          expiresAt,
        }, klines, now);

        if (result && result.outcome !== "pending") {
          await updateSignalCalibrationObservationOutcome(
            observation.id,
            result.outcome,
            result.exitPrice,
            result.outcomeAt ?? new Date(),
          );
          console.log(`[SignalVerifier] Shadow calibration ${observation.id} outcome: ${result.outcome}`);
        } else {
          await markSignalCalibrationObservationChecked(observation.id);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`[SignalVerifier] Failed to verify shadow calibration ${observation.id}:`, error);
      }
    }

    console.log("[SignalVerifier] Verification cycle completed");
  } catch (error) {
    console.error("[SignalVerifier] Verification cycle failed:", error);
  }
}
