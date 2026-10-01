import axios from "axios";
import * as db from "./db";
import { broadcastNotification } from "./websocket";
import { sendEmailNotification, formatSignalEmail } from "./emailService";
import { sendSMSNotification, formatSignalSMS } from "./smsService";
import { isDuplicateMarketUpdate, isNotificationChannelEnabled, isNotificationEventEnabled } from "./lib/notificationDeliveryPolicy";
import { shouldNotifyAsterBalanceFloor } from "./lib/asterBalanceAlertPolicy";
import { sendTelegramMessage } from "./lib/telegramBot";

/**
 * Market Condition Monitoring Service
 * Monitors active signals for significant market condition changes
 * and alerts users when conditions deviate from original signal parameters
 *
 * Uses Bybit public API exclusively — no geo-blocking issues.
 */

const BYBIT_BASE = "https://api.bybit.com";
const BYBIT_TIMEOUT = 8000;

/** Normalise a stored symbol to a canonical Bybit USDT-perp symbol (e.g. "BTCUSDT") */
function normaliseSymbol(raw: string): string {
  // Strip slash, dash, colon separators and common suffixes
  let s = raw.toUpperCase()
    .replace(/\//g, "")
    .replace(/-PERP$/i, "")
    .replace(/:USDT$/i, "")
    .replace(/\.P$/i, "");
  // If it already ends with USDT, keep it; otherwise append USDT
  if (!s.endsWith("USDT")) s = s + "USDT";
  return s;
}

interface MarketCondition {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  volatility: number;
}

/**
 * Fetch current market conditions from Bybit (replaces geo-blocked Binance)
 */
async function fetchMarketConditions(rawSymbol: string): Promise<MarketCondition | null> {
  const symbol = normaliseSymbol(rawSymbol);
  try {
    // Ticker gives us price + 24h change + volume in one call
    const tickerRes = await axios.get(`${BYBIT_BASE}/v5/market/tickers`, {
      params: { category: "linear", symbol },
      timeout: BYBIT_TIMEOUT,
    });
    const item = tickerRes.data?.result?.list?.[0];
    if (!item) return null;

    const currentPrice = parseFloat(item.lastPrice ?? "0");
    const priceChange24h = parseFloat(item.price24hPcnt ?? "0") * 100; // Bybit returns as decimal
    const volume24h = parseFloat(item.volume24h ?? "0");

    // Hourly klines for volatility calculation
    const klinesRes = await axios.get(`${BYBIT_BASE}/v5/market/kline`, {
      params: { category: "linear", symbol, interval: "60", limit: 24 },
      timeout: BYBIT_TIMEOUT,
    });
    const klineList: string[][] = (klinesRes.data?.result?.list ?? []).reverse();
    const closes = klineList.map((k) => parseFloat(k[4]));
    let volatility = 0;
    if (closes.length > 1) {
      const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
      const variance = returns.reduce((s, r) => s + r * r, 0) / returns.length;
      volatility = Math.sqrt(variance) * 100;
    }

    return { symbol, currentPrice, priceChange24h, volume24h, volatility };
  } catch (error: any) {
    console.error(`[MarketMonitor] Failed to fetch conditions for ${rawSymbol} (${symbol}):`, error.message);
    return null;
  }
}

/**
 * Analyze if market conditions have changed significantly
 */
function detectSignificantChange(
  signal: any,
  currentConditions: MarketCondition
): { changed: boolean; reason?: string } {
  const entryPrice = parseFloat(signal.entryPrice);
  const takeProfit = parseFloat(signal.takeProfit);
  const stopLoss = parseFloat(signal.stopLoss);
  const currentPrice = currentConditions.currentPrice;

  // Guard against zero/invalid prices stored in old signals
  if (!entryPrice || !takeProfit || !stopLoss || !currentPrice) return { changed: false };

  const distanceToTP = Math.abs(takeProfit - entryPrice);
  const distanceToSL = Math.abs(stopLoss - entryPrice);
  const currentMove = Math.abs(currentPrice - entryPrice);

  // Guard against zero distances
  if (distanceToTP === 0 || distanceToSL === 0) return { changed: false };

  // Price moved >50% toward TP
  if (signal.direction === "LONG" && currentPrice > entryPrice) {
    const progressToTP = currentMove / distanceToTP;
    if (progressToTP > 0.5 && progressToTP < 0.9) {
      return {
        changed: true,
        reason: `Price has moved ${(progressToTP * 100).toFixed(1)}% toward take profit. Consider partial profit taking.`,
      };
    }
  }

  if (signal.direction === "SHORT" && currentPrice < entryPrice) {
    const progressToTP = currentMove / distanceToTP;
    if (progressToTP > 0.5 && progressToTP < 0.9) {
      return {
        changed: true,
        reason: `Price has moved ${(progressToTP * 100).toFixed(1)}% toward take profit. Consider partial profit taking.`,
      };
    }
  }

  // Price moved >30% toward SL (warning)
  if (signal.direction === "LONG" && currentPrice < entryPrice) {
    const progressToSL = currentMove / distanceToSL;
    if (progressToSL > 0.3 && progressToSL < 0.9) {
      return {
        changed: true,
        reason: `⚠️ Price has moved ${(progressToSL * 100).toFixed(1)}% toward stop loss. Monitor closely.`,
      };
    }
  }

  if (signal.direction === "SHORT" && currentPrice > entryPrice) {
    const progressToSL = currentMove / distanceToSL;
    if (progressToSL > 0.3 && progressToSL < 0.9) {
      return {
        changed: true,
        reason: `⚠️ Price has moved ${(progressToSL * 100).toFixed(1)}% toward stop loss. Monitor closely.`,
      };
    }
  }

  // High volatility spike (>2x normal)
  if (currentConditions.volatility > 5) {
    return {
      changed: true,
      reason: `High volatility detected (${currentConditions.volatility.toFixed(2)}%). Market conditions have become more unpredictable.`,
    };
  }

  return { changed: false };
}

/**
 * Send multi-channel notification based on user preferences
 */
export async function sendMultiChannelNotification(
  type: "signal_verified" | "signal_hit_tp" | "signal_hit_sl" | "signal_expired" | "market_update",
  title: string,
  message: string,
  signal: any
) {
  // Get notification preferences
  const prefs = await db.getNotificationPreferences();
  
  if (!prefs) {
    console.warn("[MarketMonitor] No notification preferences found, using defaults");
  }

  if (!isNotificationEventEnabled(type, prefs)) {
    console.log(`[MarketMonitor] Notification type ${type} is disabled by user preferences`);
    return;
  }

  // Save to database
  await db.saveNotification({
    type: type === "market_update" ? "system" : type,
    title,
    message,
    signalId: signal.id,
  });

  // Browser notification (WebSocket)
  if (isNotificationChannelEnabled("browser", prefs)) {
    broadcastNotification({
      id: Date.now(),
      type: type === "market_update" ? "system" : type,
      title,
      message,
      signalId: signal.id,
      createdAt: new Date(),
    });
  }

  // Email notification
  if (isNotificationChannelEnabled("email", prefs) && prefs?.email) {
    const emailContent = formatSignalEmail(signal);
    await sendEmailNotification({
      to: prefs.email,
      subject: title,
      content: message,
      html: emailContent.html,
    });
  }

  // SMS notification
  if (isNotificationChannelEnabled("sms", prefs) && prefs?.phone) {
    const smsText = formatSignalSMS(signal);
    await sendSMSNotification({
      to: prefs.phone,
      message: smsText,
    });
  }
}

async function getAsterAccountEquity(userId: number): Promise<number | null> {
  const keyData = await db.getCexApiKey(userId, "asterdex");
  if (!keyData) return null;
  try {
    const { parseAsterWalletCredentials, asterV3Get } = await import("./asterdexSigning");
    const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);
    if (isV3) {
      const balances = await asterV3Get("/fapi/v3/balance", {}, userAddress, signerAddress, privateKey) as any[];
      const usdt = balances.find((item: any) => item.asset === "USDT");
      const equity = Number(usdt?.balance ?? usdt?.walletBalance ?? 0);
      return Number.isFinite(equity) ? equity : null;
    }
    const crypto = await import("crypto");
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}&recvWindow=5000`;
    const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
    const response = await axios.get(`https://fapi.asterdex.com/fapi/v2/balance?${queryString}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10_000,
    });
    const usdt = (response.data as any[]).find((item: any) => item.asset === "USDT");
    const equity = Number(usdt?.balance ?? usdt?.walletBalance ?? 0);
    return Number.isFinite(equity) ? equity : null;
  } catch (error: any) {
    console.warn(`[MarketMonitor] AsterDEX balance check failed for user ${userId}: ${error.message}`);
    return null;
  }
}

export async function monitorAsterBalanceFloors() {
  const candidates = await db.getAsterBalanceAlertUsers();
  for (const settings of candidates) {
    const balance = await getAsterAccountEquity(settings.userId);
    if (!shouldNotifyAsterBalanceFloor({
      enabled: settings.asterBalanceAlertEnabled,
      floor: settings.asterBalanceAlertFloor,
      balance: balance ?? Number.NaN,
      lastNotifiedAt: settings.asterBalanceAlertLastNotifiedAt,
    })) continue;

    const title = "AsterDEX Balance Floor Alert";
    const message = `Verified AsterDEX account equity is $${balance!.toFixed(2)}, below your configured $${settings.asterBalanceAlertFloor.toFixed(2)} floor.`;
    await db.saveNotification({ type: "system", title, message, signalId: null });
    if (settings.enableBrowserNotifications) {
      broadcastNotification({ id: Date.now(), type: "system", title, message, createdAt: new Date() });
    }
    if (settings.enableTelegram) {
      const telegram = await db.getTelegramSettings(settings.userId);
      if (telegram?.chatId) await sendTelegramMessage(telegram.chatId, `⚠️ <b>${title}</b>\n\n${message}`);
    }
    await db.markAsterBalanceAlertDelivered(settings.userId);
  }
}

/**
 * Monitor market conditions for all pending signals
 * Runs periodically to detect significant changes
 */
export async function monitorMarketConditions() {
  try {
    await monitorAsterBalanceFloors();
    // Get all pending signals
    const pendingSignals = await db.getSignals({ outcome: "pending" });

    if (!pendingSignals || pendingSignals.length === 0) {
      return;
    }

    console.log(`[MarketMonitor] Monitoring ${pendingSignals.length} pending signals`);

    for (const signal of pendingSignals) {
      // Fetch current market conditions
      const conditions = await fetchMarketConditions(signal.symbol);
      
      if (!conditions) {
        continue;
      }

      // Check for significant changes
      const analysis = detectSignificantChange(signal, conditions);

      if (analysis.changed && analysis.reason) {
        console.log(`[MarketMonitor] Market update for ${signal.symbol}: ${analysis.reason}`);

        const latest = await db.getLatestSignalNotification(signal.id, "system");
        if (isDuplicateMarketUpdate(latest?.createdAt)) {
          console.log(`[MarketMonitor] Skipping duplicate market update for signal ${signal.id}`);
          continue;
        }

        // Send notification
        await sendMultiChannelNotification(
          "market_update",
          `Market Update: ${signal.symbol}`,
          analysis.reason,
          signal
        );

        // Update signal metadata with market condition alert
        const metadata = signal.metadata ? JSON.parse(signal.metadata) : {};
        metadata.marketAlerts = metadata.marketAlerts || [];
        metadata.marketAlerts.push({
          timestamp: new Date().toISOString(),
          reason: analysis.reason,
          price: conditions.currentPrice,
          volatility: conditions.volatility,
        });

        // Note: We don't update the signal here, just log the alert
        // The actual outcome will be determined by the signal verifier
      }
    }
  } catch (error: any) {
    console.error("[MarketMonitor] Market monitoring cycle failed:", error.message);
  }
}
