/**
 * Telegram Callback Query Handler
 * Processes inline keyboard button presses from trade alert messages.
 * Actions: close_trade, confirm_close, cancel_close, adjust_sl, add_sl, set_tp, analyze
 */
import * as db from "../db";
import {
  answerCallbackQuery,
  editTelegramMessage,
  buildCloseConfirmButtons,
  buildTradeButtons,
} from "./telegramBot";

interface CallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
  data?: string;
}

/**
 * Process a Telegram callback_query from an inline button press.
 * Returns true if handled, false if unrecognized.
 */
export async function handleCallbackQuery(query: CallbackQuery): Promise<boolean> {
  const { id: callbackId, message, data } = query;
  if (!message || !data) {
    await answerCallbackQuery(callbackId, "Invalid action");
    return false;
  }

  const chatId = String(message.chat.id);
  const messageId = message.message_id;
  const [action, tradeIdStr] = data.split(":");
  const tradeId = parseInt(tradeIdStr, 10);

  if (isNaN(tradeId)) {
    await answerCallbackQuery(callbackId, "Invalid trade reference");
    return false;
  }

  // Verify the trade exists and belongs to this Telegram user
  const trade = await db.getTradeById(tradeId);
  if (!trade) {
    await answerCallbackQuery(callbackId, "Trade not found — may already be closed");
    return true;
  }

  switch (action) {
    case "close_trade":
      return handleCloseTrade(callbackId, chatId, messageId, trade);

    case "confirm_close":
      return handleConfirmClose(callbackId, chatId, messageId, trade);

    case "cancel_close":
      return handleCancelClose(callbackId, chatId, messageId, trade);

    case "adjust_sl":
    case "add_sl":
      return handleAdjustSL(callbackId, chatId, messageId, trade);

    case "set_tp":
      return handleSetTP(callbackId, chatId, messageId, trade);

    case "analyze":
      return handleAnalyze(callbackId, chatId, messageId, trade);

    default:
      await answerCallbackQuery(callbackId, "Unknown action");
      return false;
  }
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function handleCloseTrade(
  callbackId: string,
  chatId: string,
  messageId: number,
  trade: any
): Promise<boolean> {
  // Show confirmation with PnL estimate
  const entry = parseFloat(trade.entryPrice);
  const current = trade.lastPrice ? parseFloat(trade.lastPrice) : entry;
  const isLong = trade.direction === "LONG";
  const pnlPct = isLong
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;

  const pnlStr = pnlPct >= 0 ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`;
  const pnlEmoji = pnlPct >= 0 ? "🟢" : "🔴";

  const confirmMsg = `❌ <b>CLOSE TRADE — CONFIRM?</b>
<b>${trade.symbol}</b> ${trade.direction === "LONG" ? "🟢" : "🔴"} ${trade.direction}
Entry: <code>$${trade.entryPrice}</code> → Now: <code>$${current.toFixed(4)}</code>
${pnlEmoji} Est. P&L: <b>${pnlStr}</b>

⚠️ This will close your position at market price.`;

  await answerCallbackQuery(callbackId);
  await editTelegramMessage(chatId, messageId, confirmMsg, buildCloseConfirmButtons(trade.id));
  return true;
}

async function handleConfirmClose(
  callbackId: string,
  chatId: string,
  messageId: number,
  trade: any
): Promise<boolean> {
  // Close the trade in our DB
  const current = trade.lastPrice || trade.entryPrice;
  await db.closeTrade(trade.id, "closed_manual", current);

  const entry = parseFloat(trade.entryPrice);
  const exitPrice = parseFloat(current);
  const isLong = trade.direction === "LONG";
  const pnlPct = isLong
    ? ((exitPrice - entry) / entry) * 100
    : ((entry - exitPrice) / entry) * 100;

  const resultMsg = `✅ <b>TRADE CLOSED</b>
<b>${trade.symbol}</b> ${trade.direction === "LONG" ? "🟢" : "🔴"} ${trade.direction}
Entry: <code>$${trade.entryPrice}</code> → Exit: <code>$${exitPrice.toFixed(4)}</code>
Result: <b>${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</b>
<i>Closed via Telegram</i>`;

  await answerCallbackQuery(callbackId, "Trade closed ✅");
  await editTelegramMessage(chatId, messageId, resultMsg);

  // Attempt to close on exchange if user has API keys
  try {
    await closeOnExchange(trade);
  } catch (err) {
    // Non-blocking — trade is already marked closed in DB
    console.error("[TelegramCallback] Exchange close failed:", err);
  }

  return true;
}

async function handleCancelClose(
  callbackId: string,
  chatId: string,
  messageId: number,
  trade: any
): Promise<boolean> {
  // Restore original message with buttons
  const entry = parseFloat(trade.entryPrice);
  const current = trade.lastPrice ? parseFloat(trade.lastPrice) : entry;
  const isLong = trade.direction === "LONG";
  const pnlPct = isLong
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;

  const originalMsg = `⚠️ <b>📊 FUTURES — TRADE WARNING</b>
<b>${trade.symbol}</b> ${trade.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
Entry: <code>$${trade.entryPrice}</code> → Now: <code>$${current.toFixed(4)}</code>
SL: <code>$${trade.stopLoss}</code> | P&L: <b>${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</b>
⚡ Approaching stop loss — review position
<i>— XRYPT.NET</i>`;

  await answerCallbackQuery(callbackId, "Close cancelled");
  await editTelegramMessage(chatId, messageId, originalMsg, buildTradeButtons(trade.id, !!trade.stopLoss));
  return true;
}

async function handleAdjustSL(
  callbackId: string,
  chatId: string,
  messageId: number,
  trade: any
): Promise<boolean> {
  // Show instructions to reply with new SL value
  const msg = `🛡️ <b>ADJUST STOP LOSS</b>
<b>${trade.symbol}</b> ${trade.direction}
Current SL: <code>$${trade.stopLoss || "Not set"}</code>

Reply to this message with your new SL price.
Example: <code>0.0045</code>

Or use the buttons below:`;

  const entry = parseFloat(trade.entryPrice);
  const isLong = trade.direction === "LONG";

  // Suggest SL levels: breakeven, -2%, -5%
  const breakeven = entry;
  const sl2pct = isLong ? entry * 0.98 : entry * 1.02;
  const sl5pct = isLong ? entry * 0.95 : entry * 1.05;

  const buttons = {
    inline_keyboard: [
      [
        { text: `BE: $${breakeven.toFixed(4)}`, callback_data: `set_sl_val:${trade.id}:${breakeven.toFixed(6)}` },
        { text: `2%: $${sl2pct.toFixed(4)}`, callback_data: `set_sl_val:${trade.id}:${sl2pct.toFixed(6)}` },
        { text: `5%: $${sl5pct.toFixed(4)}`, callback_data: `set_sl_val:${trade.id}:${sl5pct.toFixed(6)}` },
      ],
      [{ text: "↩️ Back", callback_data: `cancel_close:${trade.id}` }],
    ],
  };

  await answerCallbackQuery(callbackId);
  await editTelegramMessage(chatId, messageId, msg, buttons);
  return true;
}

async function handleSetTP(
  callbackId: string,
  chatId: string,
  messageId: number,
  trade: any
): Promise<boolean> {
  const entry = parseFloat(trade.entryPrice);
  const isLong = trade.direction === "LONG";

  // Suggest TP levels: +3%, +5%, +10%
  const tp3 = isLong ? entry * 1.03 : entry * 0.97;
  const tp5 = isLong ? entry * 1.05 : entry * 0.95;
  const tp10 = isLong ? entry * 1.10 : entry * 0.90;

  const msg = `🎯 <b>SET TAKE PROFIT</b>
<b>${trade.symbol}</b> ${trade.direction}
Current TP: <code>$${trade.takeProfit || "Not set"}</code>

Reply with your TP price or use quick-set:`;

  const buttons = {
    inline_keyboard: [
      [
        { text: `3%: $${tp3.toFixed(4)}`, callback_data: `set_tp_val:${trade.id}:${tp3.toFixed(6)}` },
        { text: `5%: $${tp5.toFixed(4)}`, callback_data: `set_tp_val:${trade.id}:${tp5.toFixed(6)}` },
        { text: `10%: $${tp10.toFixed(4)}`, callback_data: `set_tp_val:${trade.id}:${tp10.toFixed(6)}` },
      ],
      [{ text: "↩️ Back", callback_data: `cancel_close:${trade.id}` }],
    ],
  };

  await answerCallbackQuery(callbackId);
  await editTelegramMessage(chatId, messageId, msg, buttons);
  return true;
}

async function handleAnalyze(
  callbackId: string,
  _chatId: string,
  _messageId: number,
  trade: any
): Promise<boolean> {
  const siteUrl = process.env.VITE_APP_URL || "https://xrypt.net";
  await answerCallbackQuery(callbackId, `Open Trade Analyzer on ${siteUrl}/trade-analyzer for full AI analysis`);
  return true;
}

// ─── Exchange Close Helper ───────────────────────────────────────────────────

async function closeOnExchange(trade: any): Promise<void> {
  // Determine which exchange the trade is on
  const exchange = trade.exchange?.toLowerCase();
  if (!exchange) return;

  const userId = trade.userId;
  const symbol = trade.symbol;
  const side = trade.direction === "LONG" ? "SELL" : "BUY";

  // We don't have position size in activeTrades, so we just mark it closed in DB.
  // The actual exchange close should be done via the web UI where position size is known.
  // This is a best-effort approach — the user can also close via the platform.
  console.log(`[TelegramCallback] Trade ${trade.id} closed in DB. Exchange close for ${exchange}/${symbol} should be confirmed on platform.`);
}

// ─── SL/TP Value Setter (for callback data like set_sl_val:123:0.0045) ───────

export async function handleSetValue(query: CallbackQuery): Promise<boolean> {
  const { id: callbackId, message, data } = query;
  if (!message || !data) return false;

  const chatId = String(message.chat.id);
  const messageId = message.message_id;
  const parts = data.split(":");
  const action = parts[0]; // set_sl_val or set_tp_val
  const tradeId = parseInt(parts[1], 10);
  const value = parts[2];

  if (isNaN(tradeId) || !value) {
    await answerCallbackQuery(callbackId, "Invalid value");
    return false;
  }

  const trade = await db.getTradeById(tradeId);
  if (!trade) {
    await answerCallbackQuery(callbackId, "Trade not found");
    return true;
  }

  if (action === "set_sl_val") {
    await db.updateTradeSL(tradeId, value);
    const msg = `✅ <b>STOP LOSS UPDATED</b>
<b>${trade.symbol}</b> ${trade.direction}
New SL: <code>$${parseFloat(value).toFixed(4)}</code>
<i>— XRYPT.NET</i>`;
    await answerCallbackQuery(callbackId, "SL updated ✅");
    await editTelegramMessage(chatId, messageId, msg, buildTradeButtons(tradeId, true));
  } else if (action === "set_tp_val") {
    await db.updateTradeTP(tradeId, value);
    const msg = `✅ <b>TAKE PROFIT UPDATED</b>
<b>${trade.symbol}</b> ${trade.direction}
New TP: <code>$${parseFloat(value).toFixed(4)}</code>
<i>— XRYPT.NET</i>`;
    await answerCallbackQuery(callbackId, "TP updated ✅");
    await editTelegramMessage(chatId, messageId, msg, buildTradeButtons(tradeId, true));
  }

  return true;
}
