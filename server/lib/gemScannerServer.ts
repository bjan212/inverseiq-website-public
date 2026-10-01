/**
 * Server-side Gem Scanner
 * Runs periodically via Heartbeat cron to discover new gems and notify users via Telegram.
 * Uses Bybit spot API to find coins in dips with recovery potential.
 */
import axios from "axios";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { discoveredGems, telegramSettings } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { sendTelegramMessage } from "./telegramBot";
import { isGemAlertChannelEnabled, isGemAlertEligible } from "./alertEligibility";

// ─── Types ───────────────────────────────────────────────────────────────────
interface GemCandidate {
  symbol: string;
  exchange: string;
  price: number;
  priceChange24h: number;
  priceChange7d: number;
  volume24h: number;
  dipDepth: number;
  recoveryMomentum: number;
  volumeSpike: number;
  liquidityScore: number;
  gemScore: number;
  riskLevel: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  targetPrice: number;
  stopLoss: number;
  potentialGain: number;
  tags: string[];
}

// Stablecoins to exclude
const EXCLUDED = new Set([
  "USDCUSDT", "BUSDUSDT", "DAIUSDT", "TUSDUSDT", "FDUSDUSDT",
  "USDDUSDT", "USDPUSDT", "WBTCUSDT", "WETHUSDT", "STETHUSDT",
  "EURTUSDT", "PAXGUSDT",
]);

// ─── Bybit API ───────────────────────────────────────────────────────────────
async function fetchBybitTickers(): Promise<any[]> {
  try {
    const res = await axios.get("https://api.bybit.com/v5/market/tickers?category=spot", {
      timeout: 15000,
    });
    return (res.data?.result?.list || []).filter((t: any) => t.symbol.endsWith("USDT"));
  } catch (err) {
    console.error("[GemScanner] Failed to fetch Bybit tickers:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchKlines(symbol: string): Promise<{ high7d: number; change7d: number; avgVolume7d: number } | null> {
  try {
    const res = await axios.get(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=D&limit=7`,
      { timeout: 8000 }
    );
    const klines: string[][] = (res.data?.result?.list ?? []).reverse();
    if (!klines.length) return null;
    const highs = klines.map((k) => parseFloat(k[2]));
    const volumes = klines.map((k) => parseFloat(k[5]));
    const firstOpen = parseFloat(klines[0][1]);
    const lastClose = parseFloat(klines[klines.length - 1][4]);
    const high7d = Math.max(...highs);
    const change7d = firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
    const avgVolume7d = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return { high7d, change7d, avgVolume7d };
  } catch {
    return null;
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function scoreGem(
  price: number,
  priceChange24h: number,
  volume24h: number,
  high7d: number,
  change7d: number,
  avgVolume7d: number,
): GemCandidate["gemScore"] & {
  dipDepth: number;
  recoveryMomentum: number;
  volumeSpike: number;
  liquidityScore: number;
  gemScore: number;
  riskLevel: GemCandidate["riskLevel"];
  tags: string[];
} {
  const dipDepth = high7d > 0 ? ((high7d - price) / high7d) * 100 : 0;
  const recoveryMomentum = Math.min(100, Math.max(0,
    (priceChange24h > 0 ? priceChange24h * 8 : priceChange24h * 2 + 20) +
    (dipDepth > 10 ? 20 : dipDepth * 2) +
    (change7d < -10 ? 15 : 0)
  ));
  const volumeSpike = avgVolume7d > 0 ? volume24h / avgVolume7d : 1;
  const liquidityScore = Math.min(100, Math.log10(Math.max(1, volume24h)) * 12);

  let gemScore = 0;
  gemScore += Math.min(30, dipDepth * 1.2);
  gemScore += Math.min(25, recoveryMomentum * 0.25);
  gemScore += Math.min(25, Math.min(volumeSpike, 8) * 3.1);
  gemScore += Math.min(20, liquidityScore * 0.2);
  if (priceChange24h > 3 && dipDepth > 10) gemScore += 5;
  if (volumeSpike > 2 && dipDepth > 15) gemScore += 5;
  gemScore = Math.min(100, gemScore);

  let riskLevel: GemCandidate["riskLevel"] = "LOW";
  if (volume24h < 500_000) riskLevel = "VERY_HIGH";
  else if (volume24h < 2_000_000) riskLevel = "HIGH";
  else if (volume24h < 10_000_000) riskLevel = "MEDIUM";

  const tags: string[] = [];
  if (dipDepth > 25) tags.push("Deep Dip");
  else if (dipDepth > 10) tags.push("Dip Buy");
  if (volumeSpike > 2.5) tags.push("Volume Surge");
  else if (volumeSpike > 1.5) tags.push("Rising Volume");
  if (priceChange24h > 5) tags.push("Recovering");
  if (priceChange24h > 0 && dipDepth > 10) tags.push("Reversal Signal");
  if (change7d < -20) tags.push("Oversold");
  if (liquidityScore > 70) tags.push("High Liquidity");
  if (volume24h > 50_000_000) tags.push("Blue Chip");

  return { dipDepth, recoveryMomentum, volumeSpike, liquidityScore, gemScore, riskLevel, tags } as any;
}

function buildReason(dipDepth: number, volumeSpike: number, priceChange24h: number, change7d: number): string {
  const parts: string[] = [];
  if (dipDepth > 25) parts.push(`down ${dipDepth.toFixed(0)}% from 7d high`);
  else if (dipDepth > 10) parts.push(`${dipDepth.toFixed(0)}% dip from recent peak`);
  else if (dipDepth > 5) parts.push(`${dipDepth.toFixed(0)}% pullback`);
  if (volumeSpike > 2.5) parts.push(`volume ${volumeSpike.toFixed(1)}x above 7d avg`);
  else if (volumeSpike > 1.3) parts.push(`elevated volume (${volumeSpike.toFixed(1)}x avg)`);
  if (priceChange24h > 3) parts.push(`+${priceChange24h.toFixed(1)}% recovery today`);
  if (change7d < -15) parts.push(`${change7d.toFixed(0)}% weekly drawdown`);
  if (parts.length === 0) parts.push("accumulation pattern detected");
  return parts.join(" · ");
}

// ─── Main Scan Function ──────────────────────────────────────────────────────
export async function runGemScan(): Promise<{ batchId: string; gemsFound: number; notificationsSent: number }> {
  console.log("[GemScanner] Starting periodic scan...");
  
  const tickers = await fetchBybitTickers();
  if (tickers.length === 0) {
    console.warn("[GemScanner] No tickers fetched — aborting scan");
    return { batchId: "", gemsFound: 0, notificationsSent: 0 };
  }

  // Normalize and filter
  const candidates: Array<{
    symbol: string;
    price: number;
    priceChange24h: number;
    volume24h: number;
  }> = [];

  for (const t of tickers) {
    if (EXCLUDED.has(t.symbol)) continue;
    const price = parseFloat(t.lastPrice);
    const priceChange24h = parseFloat(t.price24hPcnt) * 100;
    const volume24h = parseFloat(t.turnover24h);
    if (price <= 0 || isNaN(volume24h) || volume24h < 50_000) continue;
    candidates.push({ symbol: t.symbol, price, priceChange24h, volume24h });
  }

  // Top 100 by volume
  const topCandidates = candidates.sort((a, b) => b.volume24h - a.volume24h).slice(0, 100);

  // Fetch klines in batches
  const batchSize = 20;
  const klineResults: (Awaited<ReturnType<typeof fetchKlines>> | null)[] = [];
  
  for (let i = 0; i < topCandidates.length; i += batchSize) {
    const batch = topCandidates.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(c => fetchKlines(c.symbol)));
    for (const r of results) {
      klineResults.push(r.status === "fulfilled" ? r.value : null);
    }
    if (i + batchSize < topCandidates.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Score and filter
  const gems: GemCandidate[] = [];
  for (let i = 0; i < topCandidates.length; i++) {
    const c = topCandidates[i];
    const klineData = klineResults[i];
    const high7d = klineData?.high7d ?? c.price * 1.1;
    const change7d = klineData?.change7d ?? c.priceChange24h * 2;
    const avgVolume7d = klineData?.avgVolume7d ?? c.volume24h * 0.8;

    const scores = scoreGem(c.price, c.priceChange24h, c.volume24h, high7d, change7d, avgVolume7d);
    if (scores.gemScore < 30) continue;

    const recoveryPct = scores.dipDepth > 20 ? 0.5 : scores.dipDepth > 10 ? 0.6 : 0.7;
    const targetPrice = c.price * (1 + (scores.dipDepth / 100) * recoveryPct);
    const stopLoss = c.price * (1 - Math.max(0.03, (scores.dipDepth / 100) * 0.25));
    const potentialGain = ((targetPrice - c.price) / c.price) * 100;
    if (potentialGain < 3) continue;

    gems.push({
      symbol: c.symbol.replace("USDT", "/USDT"),
      exchange: "Bybit",
      price: c.price,
      priceChange24h: c.priceChange24h,
      priceChange7d: change7d,
      volume24h: c.volume24h,
      dipDepth: scores.dipDepth,
      recoveryMomentum: scores.recoveryMomentum,
      volumeSpike: scores.volumeSpike,
      liquidityScore: scores.liquidityScore,
      gemScore: scores.gemScore,
      riskLevel: scores.riskLevel,
      reason: buildReason(scores.dipDepth, scores.volumeSpike, c.priceChange24h, change7d),
      entryZoneLow: c.price * 0.98,
      entryZoneHigh: c.price * 1.02,
      targetPrice,
      stopLoss,
      potentialGain,
      tags: scores.tags,
    });
  }

  // Sort by gem score and take top 20
  gems.sort((a, b) => b.gemScore - a.gemScore);
  const topGems = gems.slice(0, 20);

  if (topGems.length === 0) {
    console.log("[GemScanner] No qualifying gems found this scan");
    return { batchId: "", gemsFound: 0, notificationsSent: 0 };
  }

  // Store in database
  const batchId = nanoid(12);
  const db = await getDb();
  if (!db) {
    console.error("[GemScanner] No DB connection");
    return { batchId: "", gemsFound: 0, notificationsSent: 0 };
  }

  await db.insert(discoveredGems).values(
    topGems.map(g => ({
      batchId,
      symbol: g.symbol,
      exchange: g.exchange,
      price: String(g.price),
      priceChange24h: String(g.priceChange24h),
      priceChange7d: String(g.priceChange7d),
      volume24h: String(g.volume24h),
      dipDepth: String(g.dipDepth),
      recoveryMomentum: Math.round(g.recoveryMomentum),
      volumeSpike: String(g.volumeSpike),
      liquidityScore: Math.round(g.liquidityScore),
      gemScore: Math.round(g.gemScore),
      riskLevel: g.riskLevel,
      reason: g.reason,
      entryZoneLow: String(g.entryZoneLow),
      entryZoneHigh: String(g.entryZoneHigh),
      targetPrice: String(g.targetPrice),
      stopLoss: String(g.stopLoss),
      potentialGain: String(g.potentialGain),
      tags: JSON.stringify(g.tags),
      notificationSent: 0,
    }))
  );

  console.log(`[GemScanner] Stored ${topGems.length} gems (batch: ${batchId})`);

  // Send notifications (Telegram + Email) based on user alert preferences
  let notificationsSent = 0;
  try {
    const { gemScanSettings: gemScanSettingsTable } = await import("../../drizzle/schema");
    const allAlertSettings = await db.select().from(gemScanSettingsTable);

    // Also get legacy Telegram users
    const telegramUsers = await db.select().from(telegramSettings)
      .where(eq(telegramSettings.isVerified, 1));
    const eligibleTelegramUsers = telegramUsers.filter(u => u.isActive === 1 && u.alertOnGems === 1);

    const siteUrl = process.env.VITE_APP_URL || "https://xrypt.net";

    // For each user with alert settings, filter gems by their minConfidence threshold
    for (const settings of allAlertSettings) {
      const threshold = settings.minConfidence ?? 80;
      const qualifyingGems = topGems.filter(g => isGemAlertEligible(settings, g.gemScore));
      if (qualifyingGems.length === 0) continue;

      // Build notification message
      const top5 = qualifyingGems.slice(0, 5);
      let message = `💎 <b>GEM ALERT (≥${threshold}% confidence)</b>\n\n`;
      message += `Found <b>${qualifyingGems.length} gems</b> above your threshold:\n\n`;
      for (const gem of top5) {
        const symbol = gem.symbol.replace("/USDT", "");
        const direction = gem.priceChange24h >= 0 ? "📈" : "📉";
        message += `${direction} <b>${symbol}</b> — Score ${Math.round(gem.gemScore)}/100\n`;
        message += `   $${gem.price < 1 ? gem.price.toFixed(4) : gem.price.toFixed(2)} · +${gem.potentialGain.toFixed(1)}% upside\n`;
        message += `   <i>${gem.reason}</i>\n\n`;
      }
      if (qualifyingGems.length > 5) {
        message += `...and ${qualifyingGems.length - 5} more\n\n`;
      }
      message += `🔗 <a href="${siteUrl}/gems">View all gems →</a>\n`;
      message += `\n<i>— InverseIQ Gem Scanner</i>`;

      // Send Telegram notification
      const telegramChatId = settings.telegramChatId;
      if (telegramChatId && isGemAlertChannelEnabled(settings, "telegram")) {
        const sent = await sendTelegramMessage(telegramChatId, message);
        if (sent) notificationsSent++;
      }

      // Send Email notification via built-in notification API
      if (isGemAlertChannelEnabled(settings, "email")) {
        try {
          const { notifyOwner } = await import("../_core/notification");
          const plainText = qualifyingGems.slice(0, 5).map(g =>
            `${g.symbol} — Score ${Math.round(g.gemScore)}/100 — +${g.potentialGain.toFixed(1)}% upside`
          ).join("\n");
          await notifyOwner({
            title: `💎 ${qualifyingGems.length} Gems Above ${threshold}% Confidence`,
            content: `New gems discovered:\n\n${plainText}\n\nView: ${siteUrl}/gems`,
          });
          notificationsSent++;
        } catch (emailErr) {
          console.error("[GemScanner] Email notification error:", emailErr);
        }
      }
    }

    // Legacy Telegram users (those not using new gemScanSettings)
    const settingsUserIds = new Set(allAlertSettings.map(s => s.userId));
    const legacyTelegramUsers = eligibleTelegramUsers.filter(u => !settingsUserIds.has(u.userId));
    if (legacyTelegramUsers.length > 0) {
      const top5 = topGems.slice(0, 5);
      let legacyMsg = `💎 <b>NEW GEMS DISCOVERED</b>\n\n`;
      legacyMsg += `Found <b>${topGems.length} gems</b> worth considering:\n\n`;
      for (const gem of top5) {
        const symbol = gem.symbol.replace("/USDT", "");
        const direction = gem.priceChange24h >= 0 ? "📈" : "📉";
        legacyMsg += `${direction} <b>${symbol}</b> — Score ${Math.round(gem.gemScore)}/100\n`;
        legacyMsg += `   $${gem.price < 1 ? gem.price.toFixed(4) : gem.price.toFixed(2)} · +${gem.potentialGain.toFixed(1)}% upside\n`;
        legacyMsg += `   <i>${gem.reason}</i>\n\n`;
      }
      if (topGems.length > 5) legacyMsg += `...and ${topGems.length - 5} more\n\n`;
      legacyMsg += `🔗 <a href="${siteUrl}/gems">View all gems →</a>\n`;
      legacyMsg += `\n<i>— InverseIQ Gem Scanner</i>`;

      for (const user of legacyTelegramUsers) {
        const sent = await sendTelegramMessage(user.chatId, legacyMsg);
        if (sent) notificationsSent++;
      }
    }
  } catch (err) {
    console.error("[GemScanner] Notification error:", err);
  }

  console.log(`[GemScanner] Scan complete — ${topGems.length} gems, ${notificationsSent} notifications sent`);
  return { batchId, gemsFound: topGems.length, notificationsSent };
}
