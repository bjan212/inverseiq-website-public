/**
 * Telegram Bot Commands
 * Handles /trades — fetches LIVE positions from connected exchanges (Hyperliquid, Binance, Bybit, OKX, etc.)
 */
import axios from "axios";
import * as db from "../db";
import { sendTelegramMessage } from "./telegramBot";

interface NormalizedPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  exchange: string;
  liqPrice?: number;
  marginRatio?: number; // 0-100%
}

/**
 * Handle /trades command — fetches live open positions from all connected exchanges.
 */
export async function handleTradesCommand(chatId: string): Promise<void> {
  const tgSettings = await db.getTelegramSettingsByChatId(chatId);
  if (!tgSettings) {
    await sendTelegramMessage(
      chatId,
      "❌ No linked account found.\nUse /start to link your XRYPT.NET account first."
    );
    return;
  }

  const userId = tgSettings.userId;
  await sendTelegramMessage(chatId, "⏳ Fetching live positions from your exchanges...");

  const allPositions: NormalizedPosition[] = [];
  const exchangeStatus: { name: string; connected: boolean; count: number }[] = [];

  // ─── Hyperliquid ───
  try {
    const hlKey = await db.getHyperliquidKey(userId);
    if (hlKey?.walletAddress) {
      const res = await axios.post("https://api.hyperliquid.xyz/info", {
        type: "clearinghouseState",
        user: hlKey.walletAddress,
      }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
      const data = res.data;
      if (Array.isArray(data?.assetPositions)) {
        for (const ap of data.assetPositions) {
          const pos = ap?.position;
          if (!pos || parseFloat(pos.szi ?? "0") === 0) continue;
          const size = parseFloat(pos.szi ?? "0");
          const levObj = pos.leverage;
          const levVal = typeof levObj === "object" ? parseFloat(levObj?.value ?? "1") : parseFloat(levObj ?? "1");
          const entry = parseFloat(pos.entryPx ?? "0");
          const mark = parseFloat(pos.markPx ?? pos.entryPx ?? "0");
          const side = size > 0 ? "LONG" as const : "SHORT" as const;
          const MMR = 0.005; // Hyperliquid maintenance margin rate
          const liqPrice = side === "LONG"
            ? entry * (1 - (1 - MMR) / levVal)
            : entry * (1 + (1 - MMR) / levVal);
          // Margin ratio: how close to liquidation (0% = safe, 100% = liquidated)
          const distToLiq = Math.abs(mark - liqPrice);
          const totalDist = Math.abs(entry - liqPrice);
          const marginRatio = totalDist > 0 ? Math.max(0, Math.min(100, (1 - distToLiq / totalDist) * 100)) : 0;
          allPositions.push({
            symbol: pos.coin ?? "UNKNOWN",
            side,
            size: Math.abs(size),
            entryPrice: entry,
            markPrice: mark,
            unrealizedPnl: parseFloat(pos.unrealizedPnl ?? "0"),
            leverage: levVal,
            exchange: "Hyperliquid",
            liqPrice,
            marginRatio,
          });
        }
      }
      exchangeStatus.push({ name: "Hyperliquid", connected: true, count: allPositions.filter(p => p.exchange === "Hyperliquid").length });
    } else {
      exchangeStatus.push({ name: "Hyperliquid", connected: false, count: 0 });
    }
  } catch {
    exchangeStatus.push({ name: "Hyperliquid", connected: true, count: 0 });
  }

  // ─── Binance ───
  try {
    const keyData = await db.getBinanceApiKey(userId);
    if (keyData) {
      const crypto = await import("crypto");
      const baseUrl = keyData.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
      const response = await axios.get(`${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000,
      });
      const positions = (response.data as any[]).filter((p: any) => parseFloat(p.positionAmt) !== 0);
      for (const p of positions) {
        const amt = parseFloat(p.positionAmt);
        const entryP = parseFloat(p.entryPrice ?? "0");
        const markP = parseFloat(p.markPrice ?? "0");
        const lev = parseFloat(p.leverage ?? "1");
        const liqP = parseFloat(p.liquidationPrice ?? "0");
        // Binance provides liquidationPrice directly; calculate margin ratio
        const liqPrice = liqP > 0 ? liqP : (amt > 0 ? entryP * (1 - 0.995 / lev) : entryP * (1 + 0.995 / lev));
        const distToLiq = Math.abs(markP - liqPrice);
        const totalDist = Math.abs(entryP - liqPrice);
        const marginRatio = totalDist > 0 ? Math.max(0, Math.min(100, (1 - distToLiq / totalDist) * 100)) : 0;
        allPositions.push({
          symbol: p.symbol?.replace("USDT", "") ?? "UNKNOWN",
          side: amt > 0 ? "LONG" : "SHORT",
          size: Math.abs(amt),
          entryPrice: entryP,
          markPrice: markP,
          unrealizedPnl: parseFloat(p.unRealizedProfit ?? "0"),
          leverage: lev,
          exchange: "Binance",
          liqPrice,
          marginRatio,
        });
      }
      exchangeStatus.push({ name: "Binance", connected: true, count: positions.length });
    } else {
      exchangeStatus.push({ name: "Binance", connected: false, count: 0 });
    }
  } catch {
    exchangeStatus.push({ name: "Binance", connected: true, count: 0 });
  }

  // ─── Bybit ───
  try {
    const keyData = await db.getCexApiKey(userId, "bybit");
    if (keyData) {
      const crypto = await import("crypto");
      const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
      const timestamp = Date.now().toString();
      const queryString = `api_key=${keyData.apiKey}&category=linear&settleCoin=USDT&recv_window=5000&timestamp=${timestamp}`;
      const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
      const response = await axios.get(`${baseUrl}/v5/position/list?${queryString}&sign=${signature}`, { timeout: 10000 });
      const positions = (response.data?.result?.list ?? []).filter((p: any) => parseFloat(p.size) > 0);
      for (const p of positions) {
        const entryP = parseFloat(p.avgPrice ?? "0");
        const markP = parseFloat(p.markPrice ?? "0");
        const lev = parseFloat(p.leverage ?? "1");
        const side = p.side === "Buy" ? "LONG" as const : "SHORT" as const;
        const liqP = parseFloat(p.liqPrice ?? "0");
        const liqPrice = liqP > 0 ? liqP : (side === "LONG" ? entryP * (1 - 0.995 / lev) : entryP * (1 + 0.995 / lev));
        const distToLiq = Math.abs(markP - liqPrice);
        const totalDist = Math.abs(entryP - liqPrice);
        const marginRatio = totalDist > 0 ? Math.max(0, Math.min(100, (1 - distToLiq / totalDist) * 100)) : 0;
        allPositions.push({
          symbol: p.symbol?.replace("USDT", "") ?? "UNKNOWN",
          side,
          size: parseFloat(p.size),
          entryPrice: entryP,
          markPrice: markP,
          unrealizedPnl: parseFloat(p.unrealisedPnl ?? "0"),
          leverage: lev,
          exchange: "Bybit",
          liqPrice,
          marginRatio,
        });
      }
      exchangeStatus.push({ name: "Bybit", connected: true, count: positions.length });
    } else {
      exchangeStatus.push({ name: "Bybit", connected: false, count: 0 });
    }
  } catch {
    exchangeStatus.push({ name: "Bybit", connected: true, count: 0 });
  }

  // ─── OKX ───
  try {
    const keyData = await db.getCexApiKey(userId, "okx");
    if (keyData) {
      const crypto = await import("crypto");
      const ts = new Date().toISOString();
      const path = "/api/v5/account/positions";
      const prehash = ts + "GET" + path;
      const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
      const response = await axios.get(`https://www.okx.com${path}`, {
        headers: {
          "OK-ACCESS-KEY": keyData.apiKey,
          "OK-ACCESS-SIGN": sig,
          "OK-ACCESS-TIMESTAMP": ts,
          "OK-ACCESS-PASSPHRASE": keyData.passphrase ?? "",
        },
        timeout: 10000,
      });
      const positions = (response.data?.data ?? []).filter((p: any) => parseFloat(p.pos ?? "0") !== 0);
      for (const p of positions) {
        const pos = parseFloat(p.pos ?? "0");
        const entryP = parseFloat(p.avgPx ?? "0");
        const markP = parseFloat(p.markPx ?? "0");
        const lev = parseFloat(p.lever ?? "1");
        const side = pos > 0 ? "LONG" as const : "SHORT" as const;
        const liqP = parseFloat(p.liqPx ?? "0");
        const liqPrice = liqP > 0 ? liqP : (side === "LONG" ? entryP * (1 - 0.995 / lev) : entryP * (1 + 0.995 / lev));
        const distToLiq = Math.abs(markP - liqPrice);
        const totalDist = Math.abs(entryP - liqPrice);
        const marginRatio = totalDist > 0 ? Math.max(0, Math.min(100, (1 - distToLiq / totalDist) * 100)) : 0;
        allPositions.push({
          symbol: p.instId?.split("-")[0] ?? "UNKNOWN",
          side,
          size: Math.abs(pos),
          entryPrice: entryP,
          markPrice: markP,
          unrealizedPnl: parseFloat(p.upl ?? "0"),
          leverage: lev,
          exchange: "OKX",
          liqPrice,
          marginRatio,
        });
      }
      exchangeStatus.push({ name: "OKX", connected: true, count: positions.length });
    } else {
      exchangeStatus.push({ name: "OKX", connected: false, count: 0 });
    }
  } catch {
    exchangeStatus.push({ name: "OKX", connected: true, count: 0 });
  }

  // ─── Build the message ───
  if (allPositions.length === 0) {
    const connectedExchanges = exchangeStatus.filter(e => e.connected).map(e => e.name).join(", ");
    const disconnected = exchangeStatus.filter(e => !e.connected).map(e => e.name).join(", ");
    let msg = "📊 <b>LIVE POSITIONS</b>\n\nNo open positions found.\n\n";
    if (connectedExchanges) msg += `✅ Checked: ${connectedExchanges}\n`;
    if (disconnected) msg += `⚠️ Not connected: ${disconnected}\n`;
    msg += `\n🔗 <a href="https://xrypt.net/binance-setup">Connect exchanges</a>`;
    await sendTelegramMessage(chatId, msg);
    return;
  }

  // Header with exchange summary
  const totalPnl = allPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const pnlStr = totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`;
  const pnlIcon = totalPnl >= 0 ? "📈" : "📉";

  let message = `📊 <b>LIVE POSITIONS</b> (${allPositions.length}) ${pnlIcon} ${pnlStr}\n`;
  message += `─────────────────────\n`;

  // Group by exchange
  const byExchange = new Map<string, NormalizedPosition[]>();
  for (const pos of allPositions) {
    const arr = byExchange.get(pos.exchange) || [];
    arr.push(pos);
    byExchange.set(pos.exchange, arr);
  }

  for (const [exchange, positions] of Array.from(byExchange.entries())) {
    const exchangePnl = positions.reduce((s: number, p: NormalizedPosition) => s + p.unrealizedPnl, 0);
    const epStr = exchangePnl >= 0 ? `+$${exchangePnl.toFixed(2)}` : `-$${Math.abs(exchangePnl).toFixed(2)}`;
    message += `\n<b>🏦 ${exchange}</b> (${positions.length}) · ${epStr}\n`;

    for (const p of positions) {
      const dirEmoji = p.side === "LONG" ? "🟢" : "🔴";
      const pnlPct = p.entryPrice > 0
        ? (p.side === "LONG"
          ? ((p.markPrice - p.entryPrice) / p.entryPrice) * 100
          : ((p.entryPrice - p.markPrice) / p.entryPrice) * 100)
        : 0;
      const pctStr = pnlPct >= 0 ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`;
      const pnlUsd = p.unrealizedPnl >= 0 ? `+$${p.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(p.unrealizedPnl).toFixed(2)}`;
      // Margin ratio color coding
      const mrIcon = (p.marginRatio ?? 0) > 75 ? "🔴" : (p.marginRatio ?? 0) > 50 ? "🟡" : "🟢";
      const liqStr = p.liqPrice ? `$${p.liqPrice.toFixed(4)}` : "N/A";
      const mrStr = p.marginRatio !== undefined ? `${p.marginRatio.toFixed(1)}%` : "N/A";

      message += `${dirEmoji} <b>${p.symbol}</b> ${p.side} ${p.leverage}x\n`;
      message += `   $${p.entryPrice.toFixed(4)} → $${p.markPrice.toFixed(4)} · <b>${pctStr}</b> (${pnlUsd})\n`;
      message += `   Liq: ${liqStr} · ${mrIcon} Margin: ${mrStr}\n`;
    }
  }

  // Exchange connection status footer
  const disconnected = exchangeStatus.filter(e => !e.connected);
  if (disconnected.length > 0) {
    message += `\n⚠️ Not connected: ${disconnected.map(e => e.name).join(", ")}`;
  }

  await sendTelegramMessage(chatId, message);

  // Send individual position cards with action buttons (max 6)
  for (const pos of allPositions.slice(0, 6)) {
    const dirEmoji = pos.side === "LONG" ? "🟢" : "🔴";
    const pnlPct = pos.entryPrice > 0
      ? (pos.side === "LONG"
        ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - pos.markPrice) / pos.entryPrice) * 100)
      : 0;
    const pctStr = pnlPct >= 0 ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`;

    const mrIcon = (pos.marginRatio ?? 0) > 75 ? "🔴" : (pos.marginRatio ?? 0) > 50 ? "🟡" : "🟢";
    const liqStr = pos.liqPrice ? `$${pos.liqPrice.toFixed(4)}` : "N/A";
    const mrStr = pos.marginRatio !== undefined ? `${pos.marginRatio.toFixed(1)}%` : "N/A";
    const cardMsg = `${dirEmoji} <b>${pos.symbol}</b> ${pos.side} ${pos.leverage}x · ${pos.exchange}\nPnL: <b>${pctStr}</b> ($${pos.unrealizedPnl.toFixed(2)})\nLiq: ${liqStr} · ${mrIcon} Margin: ${mrStr}`;

    // Use exchange-specific callback data format
    const exchangeKey = pos.exchange.toLowerCase();
    const symbolKey = pos.symbol;
    const posId = `${exchangeKey}:${symbolKey}:${pos.side.toLowerCase()}`;

    const buttons = [
      [
        { text: "❌ Close", callback_data: `close_exchange:${posId}` },
        { text: "🛡️ Set SL", callback_data: `sl_exchange:${posId}` },
      ],
      [
        { text: "🎯 Set TP", callback_data: `tp_exchange:${posId}` },
        { text: "📊 Analyze", callback_data: `analyze_exchange:${posId}` },
      ],
    ];

    await sendTelegramMessage(chatId, cardMsg, "HTML", { inline_keyboard: buttons });
  }

  if (allPositions.length > 6) {
    await sendTelegramMessage(chatId, `<i>Showing 6 of ${allPositions.length} positions. View all at:</i>\n🔗 <a href="https://xrypt.net/trade-analyzer">Trade Analyzer</a>`);
  }
}

/**
 * Handle /balances command — shows available funds + margin usage across all connected exchanges.
 */
export async function handleBalancesCommand(chatId: string): Promise<void> {
  const tgSettings = await db.getTelegramSettingsByChatId(chatId);
  if (!tgSettings) {
    await sendTelegramMessage(chatId, "❌ No linked account found.\nUse /start to link your XRYPT.NET account first.");
    return;
  }

  const userId = tgSettings.userId;
  await sendTelegramMessage(chatId, "⏳ Fetching balances...");

  const balances: { exchange: string; available: number; used: number; total: number; currency: string }[] = [];

  // ─── Hyperliquid ───
  try {
    const hlKey = await db.getHyperliquidKey(userId);
    if (hlKey?.walletAddress) {
      const res = await axios.post("https://api.hyperliquid.xyz/info", {
        type: "clearinghouseState",
        user: hlKey.walletAddress,
      }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
      const ms = res.data?.marginSummary;
      if (ms) {
        const total = parseFloat(ms.accountValue ?? "0");
        const available = parseFloat(ms.withdrawable ?? "0");
        const used = total - available;
        balances.push({ exchange: "Hyperliquid", available, used, total, currency: "USDC" });
      }
    }
  } catch {}

  // ─── Binance ───
  try {
    const keyData = await db.getBinanceApiKey(userId);
    if (keyData) {
      const crypto = await import("crypto");
      const baseUrl = keyData.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
      const response = await axios.get(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000,
      });
      const usdtBal = (response.data as any[]).find((b: any) => b.asset === "USDT");
      if (usdtBal) {
        const total = parseFloat(usdtBal.balance ?? "0");
        const available = parseFloat(usdtBal.availableBalance ?? "0");
        const used = total - available;
        balances.push({ exchange: "Binance", available, used, total, currency: "USDT" });
      }
    }
  } catch {}

  // ─── Bybit ───
  try {
    const keyData = await db.getCexApiKey(userId, "bybit");
    if (keyData) {
      const crypto = await import("crypto");
      const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
      const timestamp = Date.now().toString();
      const recvWindow = "5000";
      const params = `accountType=UNIFIED&coin=USDT`;
      const paramStr = `${timestamp}${keyData.apiKey}${recvWindow}${params}`;
      const signature = crypto.createHmac("sha256", keyData.apiSecret).update(paramStr).digest("hex");
      const response = await axios.get(`${baseUrl}/v5/account/wallet-balance?${params}`, {
        headers: {
          "X-BAPI-API-KEY": keyData.apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": timestamp,
          "X-BAPI-RECV-WINDOW": recvWindow,
        },
        timeout: 10000,
      });
      const account = response.data?.result?.list?.[0];
      if (account) {
        const total = parseFloat(account.totalEquity ?? "0");
        const available = parseFloat(account.totalAvailableBalance ?? "0");
        const used = total - available;
        balances.push({ exchange: "Bybit", available, used, total, currency: "USDT" });
      }
    }
  } catch {}

  // ─── OKX ───
  try {
    const keyData = await db.getCexApiKey(userId, "okx");
    if (keyData) {
      const crypto = await import("crypto");
      const ts = new Date().toISOString();
      const path = "/api/v5/account/balance";
      const prehash = ts + "GET" + path;
      const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
      const response = await axios.get(`https://www.okx.com${path}`, {
        headers: {
          "OK-ACCESS-KEY": keyData.apiKey,
          "OK-ACCESS-SIGN": sig,
          "OK-ACCESS-TIMESTAMP": ts,
          "OK-ACCESS-PASSPHRASE": keyData.passphrase ?? "",
        },
        timeout: 10000,
      });
      const account = response.data?.data?.[0];
      if (account) {
        const total = parseFloat(account.totalEq ?? "0");
        const available = parseFloat(account.availBal ?? account.availEq ?? "0");
        const used = total - available;
        balances.push({ exchange: "OKX", available, used, total, currency: "USDT" });
      }
    }
  } catch {}

  // ─── Build message ───
  if (balances.length === 0) {
    await sendTelegramMessage(chatId, "💰 <b>BALANCES</b>\n\nNo exchanges connected.\n\n🔗 <a href=\"https://xrypt.net/binance-setup\">Connect exchanges</a>");
    return;
  }

  const totalAll = balances.reduce((s, b) => s + b.total, 0);
  const availAll = balances.reduce((s, b) => s + b.available, 0);
  const usedAll = balances.reduce((s, b) => s + b.used, 0);
  const marginPct = totalAll > 0 ? ((usedAll / totalAll) * 100).toFixed(1) : "0.0";

  let msg = `💰 <b>BALANCES</b>\n`;
  msg += `Total: <b>$${totalAll.toFixed(2)}</b> · Available: $${availAll.toFixed(2)} · Used: $${usedAll.toFixed(2)}\n`;
  msg += `Margin Usage: <b>${marginPct}%</b>\n`;
  msg += `─────────────────────\n`;

  for (const b of balances) {
    const usagePct = b.total > 0 ? ((b.used / b.total) * 100).toFixed(1) : "0.0";
    const bar = generateBar(b.total > 0 ? b.used / b.total : 0);
    msg += `\n<b>🏦 ${b.exchange}</b> (${b.currency})\n`;
    msg += `   Total: $${b.total.toFixed(2)}\n`;
    msg += `   Available: $${b.available.toFixed(2)}\n`;
    msg += `   In Use: $${b.used.toFixed(2)} (${usagePct}%)\n`;
    msg += `   ${bar}\n`;
  }

  msg += `\n<i>Updated ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</i>`;
  await sendTelegramMessage(chatId, msg, "HTML", {
    inline_keyboard: [[
      { text: "↻ Refresh", callback_data: "balances:refresh" },
      { text: "🔌 Connect Exchanges", url: "https://xrypt.net/binance-setup?source=telegram" },
    ]],
  });
}

/** Secure exchange setup: API credentials are entered only over the authenticated website, never in chat. */
export async function handleConnectExchangesCommand(chatId: string): Promise<void> {
  const tgSettings = await db.getTelegramSettingsByChatId(chatId);
  if (!tgSettings) {
    await sendTelegramMessage(chatId, "❌ Link your XRYPT.NET account with /start before connecting exchanges.");
    return;
  }
  await sendTelegramMessage(chatId,
    "🔌 <b>CONNECT EXCHANGES</b>\n\nFor security, never send API keys, secrets, passphrases, or wallet private keys in Telegram. Open the authenticated setup page to connect Hyperliquid, Binance, Bybit, or OKX.",
    "HTML",
    { inline_keyboard: [[{ text: "Open Secure Exchange Setup", url: "https://xrypt.net/binance-setup?source=telegram" }]] }
  );
}

/** Show and configure event-driven A/A+ high-confidence Telegram alerts. */
export async function handleSignalAlertsCommand(chatId: string): Promise<void> {
  const settings = await db.getTelegramSettingsByChatId(chatId);
  if (!settings) {
    await sendTelegramMessage(chatId, "❌ Link your XRYPT.NET account with /start first.");
    return;
  }
  const enabled = !!settings.alertOnHighConfSignal;
  const interval = settings.highConfAlertIntervalMinutes ?? 5;
  const threshold = settings.highConfMinConfidence ?? 95;
  const msg = `🎯 <b>HIGH-CONFIDENCE SIGNAL ALERTS</b>\n\nStatus: <b>${enabled ? "ON" : "OFF"}</b>\nEligibility: <b>A or A+ entry</b> and <b>${threshold}%+ confidence</b>\nMinimum delivery interval: <b>${interval} minutes</b>\n\nAlerts are sent when the system logs a qualifying signal; they do not guarantee a signal every interval.`;
  await sendTelegramMessage(chatId, msg, "HTML", {
    inline_keyboard: [
      [{ text: enabled ? "Turn Off" : "Turn On", callback_data: "signal_alerts:toggle" }],
      [5, 15, 30, 60].map(minutes => ({ text: `${minutes} min${minutes === interval ? " ✓" : ""}`, callback_data: `signal_alerts:interval:${minutes}` })),
    ],
  });
}

/** Generate a simple text progress bar */
function generateBar(ratio: number): string {
  const filled = Math.round(ratio * 10);
  const empty = 10 - filled;
  const level = ratio > 0.8 ? "🔴" : ratio > 0.5 ? "🟡" : "🟢";
  return `${level} ${'█'.repeat(filled)}${'░'.repeat(empty)} ${(ratio * 100).toFixed(0)}%`;
}

function formatExchange(exchange: string): string {
  const map: Record<string, string> = {
    binance: "Binance",
    bybit: "Bybit",
    okx: "OKX",
    hyperliquid: "Hyperliquid",
    asterdex: "AsterDEX",
  };
  return map[exchange.toLowerCase()] || exchange;
}
