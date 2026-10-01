/**
 * Trade Monitor Service
 * Periodically checks all open trades, updates P&L, and sends warnings via Telegram
 * when trades approach stop loss or hit TP/SL.
 */
import axios from "axios";
import * as db from "../db";
import { sendTradeWarning, sendTradeClosedNotification } from "./telegramBot";

/** Fetch current price from OKX (primary) with Bybit fallback */
async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  // Normalize symbol
  const clean = symbol.replace(/[\/\-:]/g, "").replace(".P", "").toUpperCase();
  const instId = `${clean.replace("USDT", "")}-USDT-SWAP`;

  try {
    const res = await axios.get("https://www.okx.com/api/v5/market/ticker", {
      params: { instId },
      timeout: 5000,
    });
    const last = res.data?.data?.[0]?.last;
    if (last) return parseFloat(last);
  } catch {}

  // Bybit fallback
  try {
    const res = await axios.get("https://api.bybit.com/v5/market/tickers", {
      params: { category: "linear", symbol: clean },
      timeout: 5000,
    });
    const last = res.data?.result?.list?.[0]?.lastPrice;
    if (last) return parseFloat(last);
  } catch {}

  return null;
}

/** Check all open trades and update P&L */
export async function checkOpenTrades() {
  try {
    const trades = await db.getAllOpenTrades();
    if (!trades || trades.length === 0) return;

    for (const trade of trades) {
      const price = await fetchCurrentPrice(trade.symbol);
      if (!price) continue;

      const entry = parseFloat(trade.entryPrice);
      const tp = parseFloat(trade.takeProfit);
      const sl = parseFloat(trade.stopLoss);
      const isLong = trade.direction === "LONG";

      // Calculate P&L percentage
      const pnlPct = isLong
        ? ((price - entry) / entry) * 100
        : ((entry - price) / entry) * 100;

      // Check if TP or SL hit
      const tpHit = isLong ? price >= tp : price <= tp;
      const slHit = isLong ? price <= sl : price >= sl;

      if (tpHit) {
        await db.closeTrade(trade.id, "closed_tp", String(price));
        // Send Telegram notification
        const tgSettings = await db.getTelegramSettings(trade.userId);
        if (tgSettings?.chatId && tgSettings.isActive) {
          await sendTradeClosedNotification(tgSettings.chatId, {
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            closedPrice: String(price),
            pnlPct: pnlPct.toFixed(2),
            outcome: "TP HIT",
          });
        }
        continue;
      }

      if (slHit) {
        await db.closeTrade(trade.id, "closed_sl", String(price));
        const tgSettings = await db.getTelegramSettings(trade.userId);
        if (tgSettings?.chatId && tgSettings.isActive) {
          await sendTradeClosedNotification(tgSettings.chatId, {
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            closedPrice: String(price),
            pnlPct: pnlPct.toFixed(2),
            outcome: "SL HIT",
          });
        }
        continue;
      }

      // Update price in DB
      await db.updateTradePrice(trade.id, String(price), pnlPct.toFixed(2));

      // Check if approaching SL (within 30% of SL distance) and hasn't been warned recently
      const slDistance = Math.abs(entry - sl);
      const currentDistance = isLong ? price - sl : sl - price;
      const slProximityPct = currentDistance / slDistance;

      if (slProximityPct < 0.3 && trade.slWarned < 3) {
        // Mark as warned
        await db.markTradeSlWarned(trade.id);

        // Send Telegram warning
        const tgSettings = await db.getTelegramSettings(trade.userId);
        if (tgSettings?.chatId && tgSettings.isActive && tgSettings.alertOnSlApproach) {
          await sendTradeWarning(tgSettings.chatId, {
            symbol: trade.symbol,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            stopLoss: trade.stopLoss,
            currentPrice: String(price),
            pnlPct: pnlPct.toFixed(2),
            tradeId: trade.id,
          });
        }
      }
    }
  } catch (err) {
    console.error("[TradeMonitor] Error checking trades:", err instanceof Error ? err.message : err);
  }
}
