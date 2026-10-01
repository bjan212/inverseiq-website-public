/**
 * Telegram Bot Notification Service
 * Sends trade warnings, gem alerts, and market notifications via Telegram.
 * Supports inline keyboard buttons for trade management actions.
 */
import axios from "axios";
import * as db from "../db";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ─── Core Send Functions ─────────────────────────────────────────────────────

export async function sendTelegramMessage(
  chatId: string,
  message: string,
  parseMode: "HTML" | "Markdown" = "HTML",
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("[Telegram] No bot token configured — skipping message");
    return false;
  }
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }, { timeout: 10000 });
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Telegram] Failed to send message to ${chatId}: ${msg}`);
    return false;
  }
}

/** Answer a callback query (acknowledge button press) */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text: text || "Processing...",
      show_alert: !!text,
    }, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Edit an existing message (used after button press to update status) */
export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  newText: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    await axios.post(`${TELEGRAM_API}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Inline Keyboard Builders ────────────────────────────────────────────────

function buildTradeButtons(tradeId: number, hasStopLoss: boolean) {
  const buttons: any[][] = [];
  // Row 1: Close + Adjust SL
  const row1: any[] = [
    { text: "❌ Close Trade", callback_data: `close_trade:${tradeId}` },
  ];
  if (hasStopLoss) {
    row1.push({ text: "🔄 Move SL", callback_data: `adjust_sl:${tradeId}` });
  } else {
    row1.push({ text: "🛡️ Add SL", callback_data: `add_sl:${tradeId}` });
  }
  buttons.push(row1);
  // Row 2: Add TP
  buttons.push([
    { text: "🎯 Set TP", callback_data: `set_tp:${tradeId}` },
    { text: "📊 Analyze", callback_data: `analyze:${tradeId}` },
  ]);
  return { inline_keyboard: buttons };
}

function buildCloseConfirmButtons(tradeId: number) {
  return {
    inline_keyboard: [[
      { text: "✅ CONFIRM CLOSE", callback_data: `confirm_close:${tradeId}` },
      { text: "↩️ Cancel", callback_data: `cancel_close:${tradeId}` },
    ]],
  };
}

// ─── Futures Trade Alerts ────────────────────────────────────────────────────

/** Send a trade warning when approaching stop loss — with action buttons */
export async function sendTradeWarning(chatId: string, trade: {
  symbol: string;
  direction: string;
  entryPrice: string;
  stopLoss: string;
  currentPrice: string;
  pnlPct: string;
  tradeId?: number;
}): Promise<boolean> {
  const pnl = parseFloat(trade.pnlPct);
  const emoji = pnl < -5 ? "🚨" : "⚠️";
  const pnlColor = pnl >= 0 ? "+" : "";

  const message = `${emoji} <b>📊 FUTURES — TRADE WARNING</b>
<b>${trade.symbol}</b> ${trade.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
Entry: <code>$${trade.entryPrice}</code> → Now: <code>$${trade.currentPrice}</code>
SL: <code>$${trade.stopLoss}</code> | P&L: <b>${pnlColor}${trade.pnlPct}%</b>
⚡ Approaching stop loss — review position
<i>— XRYPT.NET</i>`;

  const replyMarkup = trade.tradeId
    ? buildTradeButtons(trade.tradeId, true)
    : undefined;

  return sendTelegramMessage(chatId, message, "HTML", replyMarkup);
}

/** Send a trade closed notification */
export async function sendTradeClosedNotification(chatId: string, trade: {
  symbol: string;
  direction: string;
  entryPrice: string;
  closedPrice: string;
  pnlPct: string;
  outcome: string;
}): Promise<boolean> {
  const pnl = parseFloat(trade.pnlPct);
  const isWin = pnl > 0;
  const emoji = isWin ? "✅" : "❌";

  const message = `${emoji} <b>📊 FUTURES — ${trade.outcome.toUpperCase()}</b>
<b>${trade.symbol}</b> ${trade.direction === "LONG" ? "🟢" : "🔴"} ${trade.direction}
Entry: <code>$${trade.entryPrice}</code> → Exit: <code>$${trade.closedPrice}</code>
Result: <b>${isWin ? "+" : ""}${trade.pnlPct}%</b>
<i>— XRYPT.NET</i>`;

  return sendTelegramMessage(chatId, message);
}

/** Send a new signal notification with action buttons */
export async function sendSignalNotification(chatId: string, signal: {
  symbol: string;
  direction: string;
  entryPrice: string;
  takeProfit: string;
  stopLoss: string;
  confidence: number;
  entryQualityLabel?: string;
  tradeId?: number;
}): Promise<boolean> {
  const dirEmoji = signal.direction === "LONG" ? "🟢" : "🔴";

  const message = `📊 <b>FUTURES — NEW SIGNAL</b>
${dirEmoji} <b>${signal.symbol}</b> ${signal.direction}
Entry: <code>$${signal.entryPrice}</code>
TP: <code>$${signal.takeProfit}</code> | SL: <code>$${signal.stopLoss}</code>
Evidence score: <b>${signal.confidence}/100</b> <i>(not a guaranteed win rate)</i>
${signal.entryQualityLabel ? `Entry Quality: <b>${signal.entryQualityLabel}</b>\n` : ""}
<i>— XRYPT.NET</i>`;

  const replyMarkup = signal.tradeId
    ? buildTradeButtons(signal.tradeId, !!signal.stopLoss)
    : undefined;

  return sendTelegramMessage(chatId, message, "HTML", replyMarkup);
}

/** True only for signals that meet the user-facing A/A+ quality and confidence rule. */
export function isEligibleHighConfidenceSignal(
  signal: { confidence: number; entryQualityLabel?: string },
  minimumConfidence: number
): boolean {
  return signal.confidence >= minimumConfidence && !!signal.entryQualityLabel && ["A", "A+"].includes(signal.entryQualityLabel);
}

/**
 * Deliver only independently eligible high-confidence signals. This is event-driven:
 * it runs when the platform logs a signal, not on a fake timer or synthetic scan.
 */
export async function notifyQualifiedHighConfidenceSignal(signal: {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: string;
  takeProfit: string;
  stopLoss: string;
  confidence: number;
  entryQualityLabel?: string;
}): Promise<number> {
  const recipients = await db.getActiveTelegramUsers();
  const now = Date.now();
  let delivered = 0;
  for (const recipient of recipients) {
    if (!recipient.alertOnHighConfSignal || !recipient.chatId) continue;
    if (!isEligibleHighConfidenceSignal(signal, recipient.highConfMinConfidence ?? 95)) continue;
    const cooldownMs = Math.max(5, recipient.highConfAlertIntervalMinutes ?? 5) * 60_000;
    const lastSent = recipient.lastHighConfAlertAt?.getTime() ?? 0;
    if (lastSent && now - lastSent < cooldownMs) continue;
    const sent = await sendSignalNotification(recipient.chatId, signal);
    if (sent) {
      await db.markTelegramHighConfAlertSent(recipient.userId);
      delivered++;
    }
  }
  return delivered;
}

// ─── Gem Finder Alerts ───────────────────────────────────────────────────────

/** Send gem discovery alert — clearly distinguished from futures */
export async function sendGemAlert(chatId: string, gems: {
  symbol: string;
  price: number;
  gemScore: number;
  potentialGain: number;
  reason: string;
  priceChange24h: number;
}[], threshold: number): Promise<boolean> {
  const siteUrl = process.env.VITE_APP_URL || "https://xrypt.net";

  let message = `💎 <b>SPOT — GEM ALERT (≥${threshold}%)</b>\n`;
  message += `Found <b>${gems.length}</b> gem${gems.length > 1 ? "s" : ""}:\n`;

  for (const gem of gems.slice(0, 5)) {
    const symbol = gem.symbol.replace("/USDT", "");
    const dir = gem.priceChange24h >= 0 ? "📈" : "📉";
    const priceStr = gem.price < 1 ? gem.price.toFixed(4) : gem.price.toFixed(2);
    message += `${dir} <b>${symbol}</b> ${Math.round(gem.gemScore)}/100 · $${priceStr} · +${gem.potentialGain.toFixed(1)}%\n`;
    message += `   <i>${gem.reason}</i>\n`;
  }

  if (gems.length > 5) {
    message += `...+${gems.length - 5} more\n`;
  }
  message += `\n🔗 <a href="${siteUrl}/gems">View all →</a>\n<i>— XRYPT.NET</i>`;

  return sendTelegramMessage(chatId, message);
}

// ─── Market Alerts ───────────────────────────────────────────────────────────

/** Send a market alert (sell-off, volatility spike, etc.) */
export async function sendMarketAlert(chatId: string, alert: {
  type: string;
  symbol: string;
  message: string;
  severity: string;
}): Promise<boolean> {
  const emoji = alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟡" : "🟢";

  const msg = `${emoji} <b>MARKET ALERT</b>
<b>${alert.symbol}</b> — ${alert.type}
${alert.message}
<i>— XRYPT.NET</i>`;

  return sendTelegramMessage(chatId, msg);
}

// ─── Callback Query Handler ──────────────────────────────────────────────────

export { buildTradeButtons, buildCloseConfirmButtons };
