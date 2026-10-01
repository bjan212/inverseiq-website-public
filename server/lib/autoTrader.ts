/**
 * Auto Trader Engine — Optimized for Hyperliquid Perpetuals
 *
 * Key optimizations:
 * 1. Volume-ranked symbol scanning (prioritize high-liquidity HL pairs)
 * 2. Funding rate awareness (skip extreme funding against trade direction)
 * 3. Open interest filter (skip illiquid pairs)
 * 4. TP/SL verification with retry logic
 * 5. Partial fill handling
 * 6. Position size optimization based on account equity
 * 7. Retry logic for failed orders (network timeouts, rate limits)
 * 8. Enhanced position monitoring with liquidation distance
 *
 * Runs as a per-user in-memory loop (not a global scheduler).
 */
import axios from "axios";
import { resolveAutoTraderHyperliquidCollateral } from "./hyperliquidBalance";
import { AUTO_TRADER_MARGIN_PERCENT, calculateAutoTraderMargin } from "../../shared/autoTraderMargin";
import * as db from "../db";
import { runSignalScan } from "./signalEngine";
import { sendTelegramMessage } from "./telegramBot";
import {
  buildHyperliquidScanPlan,
  getFullHyperliquidPerpSymbols,
  isAutoTraderCandidateEligible,
  matchesConfiguredHyperliquidSymbol,
  resolveAutoTraderConfidenceFloor,
} from "./autoTraderSafety";
import { calculateNonLooseningTrailingStop } from "./trailingStop";
import {
  SIGNAL_CALIBRATION_MODEL_VERSION,
  buildSignalCalibrationObservationKey,
} from "../../shared/signalCalibration";
import {
  AUTO_TRADER_LOW_SCORE_API_WINDOW_MS,
  canBeginAutoTraderCycle,
  getNextAutoTraderCycleDelay,
  isAutoTraderExecutionAuthorized,
  isPersistedAutoTraderActive,
  type AutoTraderCycleOutcome,
} from "./autoTraderCadence";

// ─── Hyperliquid Universe Cache ──────────────────────────────────────────────

interface HLAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  isDelisted?: boolean;
}

interface HLAssetCtx {
  dayNtlVlm: string;
  funding: string;
  openInterest: string;
  markPx: string;
  prevDayPx?: string;
}

interface HLUniverseData {
  assets: HLAsset[];
  assetCtxs: HLAssetCtx[];
  fetchedAt: number;
}

let hlUniverseCache: HLUniverseData | null = null;
const HL_CACHE_TTL = 3 * 60 * 1000; // 3 minutes (more frequent for better data)

/** Fetch full Hyperliquid universe with asset contexts (volume, funding, OI) */
async function getHyperliquidUniverseWithCtx(): Promise<HLUniverseData> {
  if (hlUniverseCache && Date.now() - hlUniverseCache.fetchedAt < HL_CACHE_TTL) {
    return hlUniverseCache;
  }
  try {
    const res = await axios.post("https://api.hyperliquid.xyz/info",
      { type: "metaAndAssetCtxs" },
      { headers: { "Content-Type": "application/json" }, timeout: 12000 }
    );
    const [meta, assetCtxs] = res.data as [
      { universe: HLAsset[] },
      HLAssetCtx[]
    ];
    hlUniverseCache = {
      assets: meta.universe ?? [],
      assetCtxs: assetCtxs ?? [],
      fetchedAt: Date.now(),
    };
    return hlUniverseCache;
  } catch {
    return hlUniverseCache ?? { assets: [], assetCtxs: [], fetchedAt: 0 };
  }
}

/** Get every currently named Hyperliquid perpetual, ordered by 24h notional volume. */
async function getFullHyperliquidPerpUniverse(): Promise<string[]> {
  const { assets, assetCtxs } = await getHyperliquidUniverseWithCtx();
  return getFullHyperliquidPerpSymbols(assets, assetCtxs);
}

/** Get funding rate for a specific HL symbol */
async function getHLFundingRate(hlSymbol: string): Promise<number> {
  const { assets, assetCtxs } = await getHyperliquidUniverseWithCtx();
  const idx = assets.findIndex(a => a.name.toUpperCase() === hlSymbol.toUpperCase());
  if (idx === -1) return 0;
  return parseFloat(assetCtxs[idx]?.funding ?? "0") * 100; // Convert to percentage
}

/** Get open interest for a specific HL symbol */
async function getHLOpenInterest(hlSymbol: string): Promise<number> {
  const { assets, assetCtxs } = await getHyperliquidUniverseWithCtx();
  const idx = assets.findIndex(a => a.name.toUpperCase() === hlSymbol.toUpperCase());
  if (idx === -1) return 0;
  const markPx = parseFloat(assetCtxs[idx]?.markPx ?? "0");
  const oiCoins = parseFloat(assetCtxs[idx]?.openInterest ?? "0");
  return oiCoins * markPx; // OI in USD
}

/** Get max leverage for a symbol on Hyperliquid */
async function getMaxLeverage(hlSymbol: string): Promise<number> {
  const { assets } = await getHyperliquidUniverseWithCtx();
  const asset = assets.find(a => a.name.toUpperCase() === hlSymbol.toUpperCase());
  if (!asset || !Number.isFinite(asset.maxLeverage) || asset.maxLeverage < 1) {
    throw new Error(`Hyperliquid maximum leverage metadata unavailable for ${hlSymbol}`);
  }
  return asset.maxLeverage;
}

/** Get szDecimals for a symbol */
async function getSzDecimals(hlSymbol: string): Promise<number> {
  const { assets } = await getHyperliquidUniverseWithCtx();
  const asset = assets.find(a => a.name.toUpperCase() === hlSymbol.toUpperCase());
  return asset?.szDecimals ?? 4;
}

/** Get currently available trading collateral from Hyperliquid. */
async function getAvailableTradingCollateral(walletAddress: string): Promise<number | null> {
  try {
    const request = { headers: { "Content-Type": "application/json" }, timeout: 10000 };
    const [perpetualRes, spotRes] = await Promise.all([
      axios.post("https://api.hyperliquid.xyz/info", { type: "clearinghouseState", user: walletAddress }, request),
      axios.post("https://api.hyperliquid.xyz/info", { type: "spotClearinghouseState", user: walletAddress }, request),
    ]);
    return resolveAutoTraderHyperliquidCollateral(perpetualRes.data, spotRes.data).availableTradingCollateral;
  } catch {
    return null;
  }
}

/** Total account value is retained only for the optional drawdown ratio. */
async function getAccountEquity(walletAddress: string): Promise<number> {
  try {
    const request = { headers: { "Content-Type": "application/json" }, timeout: 10000 };
    const [perpetualRes, spotRes] = await Promise.all([
      axios.post("https://api.hyperliquid.xyz/info", { type: "clearinghouseState", user: walletAddress }, request),
      axios.post("https://api.hyperliquid.xyz/info", { type: "spotClearinghouseState", user: walletAddress }, request),
    ]);
    return resolveAutoTraderHyperliquidCollateral(perpetualRes.data, spotRes.data).tradingAccountValue;
  } catch {
    return 0;
  }
}

// ─── Persistent worker management ─────────────────────────────────────────────

interface ActiveLoop {
  timeoutId: NodeJS.Timeout | null;
  abortController: AbortController;
  cycleInFlight: boolean;
  consecutiveErrors: number;
}

const activeLoops = new Map<string, ActiveLoop>();

interface AutoTraderConfig {
  userId: string;
  userDbId: number;
  marginPercent: typeof AUTO_TRADER_MARGIN_PERCENT;
  leverage: number;
  maxConcurrent: number;
  maxDailyTrades: number;
  cooldownSeconds: number;
  minConfidence: number;
  exchange: string;
  telegramNotify: boolean;
  maxDrawdownPct: number;
  excludeSymbols: string[];
  onlySymbols: string[];
}

async function runManagedCycle(
  config: AutoTraderConfig,
  privateKey: string,
  walletAddress: string,
  signal: AbortSignal
): Promise<void> {
  const loop = activeLoops.get(config.userId);
  if (!canBeginAutoTraderCycle(Boolean(loop), signal.aborted, loop?.cycleInFlight ?? false) || !loop) return;

  try {
    const persisted = await db.getAutoTraderSettings(config.userId);
    if (!isPersistedAutoTraderActive(persisted?.isActive)) {
      if (loop.timeoutId) clearTimeout(loop.timeoutId);
      activeLoops.delete(config.userId);
      console.warn(`[AutoTrader] Persisted active state is off for ${config.userId}; terminating the in-memory loop before scanning.`);
      return;
    }
  } catch (error: any) {
    activeLoops.delete(config.userId);
    console.error(`[AutoTrader] Could not verify persisted active state for ${config.userId}; loop terminated fail-closed:`, error?.message ?? error);
    return;
  }

  loop.cycleInFlight = true;
  let outcome: AutoTraderCycleOutcome = "error";
  try {
    outcome = await runAutoTraderCycle(config, privateKey, walletAddress, signal);
    if (outcome === "error") {
      loop.consecutiveErrors += 1;
      await db.updateAutoTraderStatus(config.userId, { workerHeartbeatAt: new Date() });
    } else {
      loop.consecutiveErrors = 0;
      await db.updateAutoTraderStatus(config.userId, {
        workerHeartbeatAt: new Date(),
        lastWorkerError: null,
      });
    }
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500);
    outcome = "error";
    loop.consecutiveErrors += 1;
    console.error(`[AutoTrader] Managed cycle error for ${config.userId}:`, message);
    await db.updateAutoTraderStatus(config.userId, {
      currentStatus: "error",
      lastWorkerError: message,
      workerHeartbeatAt: new Date(),
    });
  } finally {
    loop.cycleInFlight = false;
    const currentLoop = activeLoops.get(config.userId);
    if (!currentLoop || currentLoop !== loop || signal.aborted) return;

    try {
      const persisted = await db.getAutoTraderSettings(config.userId);
      if (!isPersistedAutoTraderActive(persisted?.isActive)) {
        if (loop.timeoutId) clearTimeout(loop.timeoutId);
        activeLoops.delete(config.userId);
        console.warn(`[AutoTrader] Persisted active state turned off for ${config.userId}; no successor cycle scheduled.`);
        return;
      }
    } catch (error: any) {
      activeLoops.delete(config.userId);
      console.error(`[AutoTrader] Could not verify persisted active state before scheduling for ${config.userId}; no successor cycle scheduled:`, error?.message ?? error);
      return;
    }

    const nextDelay = getNextAutoTraderCycleDelay(outcome, loop.consecutiveErrors);
    if (nextDelay === null) return;
    if (loop.timeoutId) clearTimeout(loop.timeoutId);
    loop.timeoutId = setTimeout(() => {
      void runManagedCycle(config, privateKey, walletAddress, signal);
    }, nextDelay);

    const timing = outcome === "ineligible"
      ? `queued immediately; starts after the ${AUTO_TRADER_LOW_SCORE_API_WINDOW_MS / 1000}s Hyperliquid REST-weight window`
      : `scheduled in ${Math.round(nextDelay / 1000)}s`;
    console.log(`[AutoTrader] Next cycle ${timing}; previous outcome=${outcome}.`);
  }
}

/** Start the persistent auto-trader worker for a user. */
export async function startAutoTrader(
  config: AutoTraderConfig,
  options: { silentRecovery?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  const { userId } = config;

  if (config.exchange !== "hyperliquid") {
    return { success: false, error: "Auto Trader is restricted to Hyperliquid perpetuals." };
  }

  if (activeLoops.has(userId)) {
    return { success: false, error: "Auto-trader is already running" };
  }

  // Verify Hyperliquid key exists
  const hlKey = await db.getHyperliquidKey(config.userDbId);
  if (!hlKey) {
    return { success: false, error: "No Hyperliquid key configured. Please add your wallet key in Exchange Setup." };
  }

  // Mark as active in DB before starting so a persistent process can recover it.
  await db.saveAutoTraderSettings(userId, {
    isActive: true,
    currentStatus: "scanning",
    workerHeartbeatAt: new Date(),
    lastWorkerError: null,
  });

  const abortController = new AbortController();
  const loop: ActiveLoop = {
    timeoutId: null,
    abortController,
    cycleInFlight: false,
    consecutiveErrors: 0,
  };
  activeLoops.set(userId, loop);

  // Each cycle schedules exactly one successor after it finishes. Low-score
  // outcomes queue an immediate rescan at the earliest safe REST-weight window;
  // errors back off and no two cycles can overlap.
  void runManagedCycle(config, hlKey.privateKey, hlKey.walletAddress, abortController.signal);

  // Notify via Telegram
  if (config.telegramNotify && !options.silentRecovery) {
    const tg = await db.getTelegramSettings(config.userDbId);
    if (tg?.chatId) {
      const levDisplay = config.leverage === 0 ? "AUTO MAX" : `${config.leverage}x`;
      await sendTelegramMessage(tg.chatId,
        `🤖 <b>Auto Trader Started</b>\n\n` +
        `⚙️ Margin: ${config.marginPercent}% of available Hyperliquid USDC (calculated at entry)\n` +
        `📊 Leverage: ${levDisplay}\n` +
        `🎯 Min Evidence Score: ${resolveAutoTraderConfidenceFloor(config.minConfidence)}/100\n` +
        `📈 Max Daily: ${config.maxDailyTrades}\n` +
        `⏱ Cooldown: ${config.cooldownSeconds}s\n` +
        `🌐 Scanning: Full Hyperliquid Perp universe\n\n` +
        `Safety: HL-native data, verified TP/SL, and non-loosening trailing stop.`
      );
    }
  }

  return { success: true };
}

/** Stop the auto-trader loop for a user */
export async function stopAutoTrader(userId: string, userDbId: number): Promise<{ success: boolean }> {
  const loop = activeLoops.get(userId);
  if (loop) {
    loop.abortController.abort();
    if (loop.timeoutId) clearTimeout(loop.timeoutId);
    activeLoops.delete(userId);
  }

  await db.saveAutoTraderSettings(userId, {
    isActive: false,
    currentStatus: "idle",
    currentSymbol: null,
    currentDirection: null,
    currentEntryPrice: null,
  });

  // Notify via Telegram
  const tg = await db.getTelegramSettings(userDbId);
  if (tg?.chatId) {
    const settings = await db.getAutoTraderSettings(userId);
    await sendTelegramMessage(tg.chatId, `🛑 <b>Auto Trader Stopped</b>\n\n📊 Daily P&L: $${settings?.dailyPnl ?? "0"}\n📈 Total P&L: $${settings?.totalPnl ?? "0"}`);
  }

  return { success: true };
}

/** Check if auto-trader is running for a user */
export function isAutoTraderRunning(userId: string): boolean {
  return activeLoops.has(userId);
}

/** Get the current status of the auto-trader */
export async function getAutoTraderStatus(userId: string) {
  const settings = await db.getAutoTraderSettings(userId);
  const isRunning = activeLoops.has(userId);
  const openTrades = await db.getOpenAutoTrades(userId);
  const todayCount = await db.getAutoTraderTodayCount(userId);

  return {
    isRunning,
    workerState: isRunning ? "healthy" : settings?.isActive ? "recovery_pending" : "stopped",
    settings,
    openTrades,
    tradesToday: todayCount,
  };
}

function parseSymbols(value: string | null): string[] {
  return value?.split(",").map(symbol => symbol.trim()).filter(Boolean) ?? [];
}

function settingsToConfig(
  settings: NonNullable<Awaited<ReturnType<typeof db.getAutoTraderSettings>>>,
  userDbId: number
): AutoTraderConfig {
  return {
    userId: settings.userId,
    userDbId,
    marginPercent: AUTO_TRADER_MARGIN_PERCENT,
    leverage: settings.leverage,
    maxConcurrent: settings.maxConcurrent,
    maxDailyTrades: settings.maxDailyTrades,
    cooldownSeconds: settings.cooldownSeconds,
    minConfidence: resolveAutoTraderConfidenceFloor(settings.minConfidence),
    exchange: "hyperliquid",
    telegramNotify: settings.telegramNotify,
    maxDrawdownPct: settings.maxDrawdownPct,
    excludeSymbols: parseSymbols(settings.excludeSymbols),
    onlySymbols: parseSymbols(settings.onlySymbols),
  };
}

/** Resume explicitly active traders after the persistent worker process restarts. */
export async function recoverActiveAutoTraders(source: "startup" | "heartbeat" = "startup") {
  const activeSettings = await db.getActiveAutoTraderSettings();
  const results: Array<{ userId: string; recovered: boolean; reason?: string }> = [];

  for (const settings of activeSettings) {
    if (activeLoops.has(settings.userId)) {
      await db.updateAutoTraderStatus(settings.userId, { lastRecoveryAt: new Date(), lastWorkerError: null });
      results.push({ userId: settings.userId, recovered: true, reason: "already_running" });
      continue;
    }

    const user = await db.getUserByOpenId(settings.userId);
    if (!user) {
      const reason = "Recovery failed: account record was not found";
      await db.updateAutoTraderStatus(settings.userId, {
        currentStatus: "error", lastWorkerError: reason, lastRecoveryAt: new Date(),
      });
      results.push({ userId: settings.userId, recovered: false, reason });
      continue;
    }

    const result = await startAutoTrader(settingsToConfig(settings, user.id), { silentRecovery: true });
    await db.updateAutoTraderStatus(settings.userId, {
      lastRecoveryAt: new Date(),
      lastWorkerError: result.success ? null : (result.error ?? `Recovery failed via ${source}`).slice(0, 500),
      currentStatus: result.success ? "scanning" : "error",
    });
    results.push({ userId: settings.userId, recovered: result.success, reason: result.error });
  }
  return results;
}

/** Recover one user through the authenticated platform-issued Heartbeat task UID. */
export async function recoverAutoTraderByTaskUid(taskUid: string) {
  const settings = await db.getAutoTraderSettingsByRecoveryTaskUid(taskUid);
  if (!settings) return { skipped: "orphan" as const };
  if (!settings.isActive) {
    await db.updateAutoTraderStatus(settings.userId, { lastRecoveryAt: new Date() });
    return { skipped: "inactive" as const };
  }

  const user = await db.getUserByOpenId(settings.userId);
  if (!user) throw new Error("Recovery failed: account record was not found");

  const result = activeLoops.has(settings.userId)
    ? { success: true }
    : await startAutoTrader(settingsToConfig(settings, user.id), { silentRecovery: true });
  await db.updateAutoTraderStatus(settings.userId, {
    lastRecoveryAt: new Date(),
    lastWorkerError: result.success ? null : (result.error ?? "Recovery failed").slice(0, 500),
    currentStatus: result.success ? "scanning" : "error",
  });
  return { recovered: result.success, error: result.error ?? null };
}

// ─── Core Cycle Logic (Optimized for HL Perps) ──────────────────────────────

async function runAutoTraderCycle(
  config: AutoTraderConfig,
  privateKey: string,
  walletAddress: string,
  signal: AbortSignal
): Promise<AutoTraderCycleOutcome> {
  if (signal.aborted) return "inactive";

  const { userId } = config;
  const settings = await db.getAutoTraderSettings(userId);
  if (!settings || !settings.isActive) return "inactive";

  // Check if we have open positions
  const openTrades = await db.getOpenAutoTrades(userId);

  if (openTrades.length >= config.maxConcurrent) {
    await db.updateAutoTraderStatus(userId, { currentStatus: "in_position" });
    await monitorOpenPositions(config, openTrades, walletAddress, privateKey);
    return "position_monitor";
  }

  // Check daily trade limit
  const todayCount = await db.getAutoTraderTodayCount(userId);
  if (config.maxDailyTrades > 0 && todayCount >= config.maxDailyTrades) {
    await db.updateAutoTraderStatus(userId, { currentStatus: "idle" });
    return "daily_limit";
  }

  // Check cooldown
  if (settings.lastTradeClosedAt) {
    const elapsed = (Date.now() - new Date(settings.lastTradeClosedAt).getTime()) / 1000;
    if (elapsed < config.cooldownSeconds) {
      await db.updateAutoTraderStatus(userId, { currentStatus: "cooldown" });
      return "cooldown";
    }
  }

  // Check max drawdown
  if (config.maxDrawdownPct > 0) {
    const equity = await getAccountEquity(walletAddress);
    if (equity > 0) {
      const dailyPnl = parseFloat(settings.dailyPnl ?? "0");
      const drawdownPct = Math.abs(dailyPnl) / equity * 100;
      if (dailyPnl < 0 && drawdownPct >= config.maxDrawdownPct) {
        await db.updateAutoTraderStatus(userId, { currentStatus: "idle" });
        console.log(`[AutoTrader] Max drawdown reached (${drawdownPct.toFixed(1)}% >= ${config.maxDrawdownPct}%). Pausing.`);
        return "drawdown_pause";
      }
    }
  }

  // ── SCAN for signals (volume-ranked Hyperliquid perps) ──
  await db.updateAutoTraderStatus(userId, { currentStatus: "scanning" });

  try {
    // Use the full current Hyperliquid perpetual universe. Do not intersect this
    // list with another venue or silently replace it with a CEX-derived fallback.
    const universe = await getHyperliquidUniverseWithCtx();
    let symbolsToConsider = getFullHyperliquidPerpSymbols(universe.assets, universe.assetCtxs);
    if (symbolsToConsider.length === 0) {
      const reason = "Hyperliquid perpetual universe unavailable; scan skipped safely.";
      console.warn(`[AutoTrader] ${reason}`);
      await db.updateAutoTraderStatus(userId, {
        currentStatus: "error",
        lastScanBest: `SKIP: ${reason}`,
        lastWorkerError: reason,
      });
      return "error";
    }

    // Apply user filters
    if (config.onlySymbols.length > 0) {
      symbolsToConsider = symbolsToConsider.filter(symbol => config.onlySymbols.some(filter => matchesConfiguredHyperliquidSymbol(symbol, filter)));
    }
    if (config.excludeSymbols.length > 0) {
      symbolsToConsider = symbolsToConsider.filter(symbol => !config.excludeSymbols.some(filter => matchesConfiguredHyperliquidSymbol(symbol, filter)));
    }

    const rotationSeed = Math.floor(Date.now() / AUTO_TRADER_LOW_SCORE_API_WINDOW_MS);
    const scanPlan = buildHyperliquidScanPlan(universe.assets, universe.assetCtxs, symbolsToConsider, rotationSeed, 20);
    const symbolsToScan = scanPlan.deepScanSymbols;
    if (symbolsToScan.length === 0) {
      const reason = "No eligible Hyperliquid perpetuals remained after configured symbol filters.";
      await db.updateAutoTraderStatus(userId, {
        currentStatus: "error",
        lastScanBest: `SKIP: ${reason}`,
        lastWorkerError: reason,
      });
      return "error";
    }

    console.log(`[AutoTrader] Considered all ${scanPlan.consideredSymbols.length} active Hyperliquid USDC perps; deep-scanning ${symbolsToScan.length} rate-limit-safe candidates: ${symbolsToScan.slice(0, 10).join(", ")}${symbolsToScan.length > 10 ? "..." : ""}`);
    console.log(`[AutoTrader] Config: minConfidence=${resolveAutoTraderConfidenceFloor(config.minConfidence)}, margin=${config.marginPercent}% of available collateral, leverage=${config.leverage || "AUTO"}`);

    // Update scan status
    await db.updateAutoTraderStatus(userId, {
      lastScanSymbol: symbolsToScan[0] ?? null,
    });

    // Use Hyperliquid-native candles only. A cross-exchange candle series can diverge
    // from the venue where the order will execute and is not acceptable for auto-trading.
    const scanResult = await runSignalScan(symbolsToScan.length, "5m", undefined, symbolsToScan, true);
    const best = scanResult.best;

    // Update scan status after scan completes
    const bestLabel = best ? `${best.symbol} ${best.direction} ${best.confidence}/100 evidence` : "No signal";
    await db.updateAutoTraderStatus(userId, {
      lastScanAt: new Date(),
      lastScanCount: scanPlan.consideredSymbols.length,
      lastDeepScanCount: scanResult.scannedCount,
      lastUnavailableCount: scanResult.unavailableCount,
      lastScanBest: bestLabel,
      lastScanSymbol: best?.symbol ?? symbolsToScan[symbolsToScan.length - 1] ?? null,
    });

    if (!best) {
      const reason = `runSignalScan returned no best signal after ${scanResult.scanDurationMs}ms`;
      console.log(`[AutoTrader] UNEXPECTED: ${reason}.`);
      await db.updateAutoTraderStatus(userId, {
        currentStatus: "error",
        lastWorkerError: reason,
        lastScanBest: `SKIP: ${reason}`,
      });
      return "error";
    }

    console.log(`[AutoTrader] ✅ Best signal: ${best.symbol} ${best.direction} | Evidence score: ${best.confidence}/100 | Entry: ${best.entryQualityLabel} | Price: $${best.entryPrice}`);
    console.log(`[AutoTrader] Scan took ${scanResult.scanDurationMs}ms; considered ${scanPlan.consideredSymbols.length}, attempted ${scanResult.attemptedCount}, analyzed ${scanResult.scannedCount}, unavailable ${scanResult.unavailableCount}.`);

    // ── Evidence-based execution gate ──
    // A displayed signal is not automatically an executable trade. The historical
    // record showed heavily overstated confidence; therefore auto-trading requires
    // independent technical/microstructure agreement and an A/A+ quality setup.
    const candidateGate = isAutoTraderCandidateEligible(best, config.minConfidence);

    // Persist a private shadow observation at most once per 15-minute bucket.
    // This dataset measures score distribution and future TP/SL outcomes; it does
    // not change the score, the execution gate, position sizing, or order flow.
    if (
      best.confidenceModel === SIGNAL_CALIBRATION_MODEL_VERSION
      && [best.entryPrice, best.takeProfit, best.stopLoss].every(value => Number.isFinite(value) && value > 0)
      && Number.isFinite(best.validityMinutes)
      && best.validityMinutes > 0
    ) {
      const observedAt = new Date();
      try {
        await db.saveSignalCalibrationObservation({
          userId,
          observationKey: buildSignalCalibrationObservationKey(observedAt),
          modelVersion: SIGNAL_CALIBRATION_MODEL_VERSION,
          symbol: best.symbol,
          direction: best.direction,
          timeframe: "5m+1m",
          evidenceScore: best.confidence,
          technicalScore: Math.round(best.technicalScore),
          microstructureScore: Math.round(best.microstructureScore),
          entryQuality: best.entryQualityLabel,
          directionsAgree: Boolean(best.directionsAgree),
          executionEligible: candidateGate.eligible,
          entryPrice: String(best.entryPrice),
          takeProfit: String(best.takeProfit),
          stopLoss: String(best.stopLoss),
          observedAt,
          expiresAt: new Date(observedAt.getTime() + best.validityMinutes * 60 * 1000),
        });
      } catch (error: any) {
        console.warn(`[AutoTrader] Shadow calibration observation was not saved: ${error?.message ?? error}`);
      }
    }
    if (!candidateGate.eligible) {
      const reason = candidateGate.reason ?? "execution gate failed";
      console.log(`[AutoTrader] Skipping ${best.symbol}: ${reason}. tech=${best.technicalScore}, micro=${best.microstructureScore}, entry=${best.entryQualityLabel}, aligned=${best.directionsAgree}.`);
      await db.updateAutoTraderStatus(userId, { lastScanBest: `SKIP: ${best.symbol} — ${reason}` });
      return "ineligible";
    }
    console.log(`[AutoTrader] Execution gate passed: ${best.symbol} (${best.confidence}/100 evidence, ${best.entryQualityLabel}, technical/microstructure aligned).`);

    // ── HL-specific: Funding rate filter ──
    const hlSymbol = best.symbol.replace(/USDT$|USDC$|USD$/, "");
    const fundingRate = await getHLFundingRate(hlSymbol);

    // Skip if funding is extreme and against our direction
    if (best.direction === "LONG" && fundingRate > 0.05) {
      console.log(`[AutoTrader] Skipping LONG ${best.symbol}: extreme positive funding ${fundingRate.toFixed(4)}% (longs paying shorts heavily).`);
      return "ineligible";
    }
    if (best.direction === "SHORT" && fundingRate < -0.03) {
      console.log(`[AutoTrader] Skipping SHORT ${best.symbol}: extreme negative funding ${fundingRate.toFixed(4)}% (shorts paying longs heavily).`);
      return "ineligible";
    }

    // ── HL-specific: Open interest filter (skip very low OI) ──
    const openInterestUsd = await getHLOpenInterest(hlSymbol);
    if (openInterestUsd < 200_000) {
      console.log(`[AutoTrader] Skipping ${best.symbol}: OI too low ($${(openInterestUsd / 1000).toFixed(0)}K < $200K). Illiquid.`);
      return "ineligible";
    }

    // A user can stop the worker while a market-data scan is in flight. Re-read
    // the persisted switch before touching collateral or entering any order path.
    const latestSettings = await db.getAutoTraderSettings(userId);
    if (!isAutoTraderExecutionAuthorized(signal.aborted, latestSettings?.isActive)) {
      console.log(`[AutoTrader] Execution cancelled for ${best.symbol}: worker was stopped during the scan.`);
      return "inactive";
    }

    // ── Dynamic margin: exactly 25% of currently available collateral ──
    // Fetch this only after every signal/liquidity gate passes and immediately
    // before execution. There is deliberately no fixed-dollar fallback.
    const availableCollateral = await getAvailableTradingCollateral(walletAddress);
    const marginDecision = calculateAutoTraderMargin(availableCollateral);
    await db.updateAutoTraderStatus(userId, {
      lastAvailableBalance: availableCollateral === null ? null : availableCollateral.toString(),
      lastCalculatedMargin: marginDecision.eligible ? marginDecision.marginUsdc.toString() : null,
    });
    if (!marginDecision.eligible) {
      console.warn(`[AutoTrader] Skipping ${best.symbol}: dynamic margin unavailable — ${marginDecision.reason}`);
      const reason = marginDecision.reason ?? "dynamic margin unavailable";
      await db.updateAutoTraderStatus(userId, {
        currentStatus: "error",
        lastScanBest: `SKIP: ${best.symbol} — ${reason}`,
        lastWorkerError: reason,
      });
      return "error";
    }
    const marginForTrade = marginDecision.marginUsdc;
    console.log(`[AutoTrader] Dynamic margin: $${marginForTrade.toFixed(6)} = ${marginDecision.marginPercent}% of $${marginDecision.availableCollateral.toFixed(6)} available collateral.`);

    const finalSettings = await db.getAutoTraderSettings(userId);
    if (!isAutoTraderExecutionAuthorized(signal.aborted, finalSettings?.isActive)) {
      console.log(`[AutoTrader] Execution cancelled for ${best.symbol}: worker was stopped before order submission.`);
      return "inactive";
    }

    // ── EXECUTE the trade (with retry) ──
    await db.updateAutoTraderStatus(userId, { currentStatus: "executing" });

    const result = await executeAutoTradeWithRetry(config, { ...best, marginOverride: marginForTrade }, privateKey, walletAddress);

    if (result.success) {
      const actualLev = result.effectiveLeverage ?? config.leverage;
      const tradeId = await db.logAutoTrade({
        userId,
        symbol: best.symbol,
        direction: best.direction,
        entryPrice: result.avgPrice ?? best.entryPrice.toString(),
        positionSize: (marginForTrade * actualLev).toString(),
        marginUsed: marginForTrade.toString(),
        leverage: actualLev,
        takeProfit: best.takeProfit.toString(),
        stopLoss: best.stopLoss.toString(),
        initialStopLoss: best.stopLoss.toString(),
        outcome: "open",
        signalConfidence: best.confidence,
        entryQuality: best.entryQualityLabel,
      });

      await db.updateAutoTraderStatus(userId, {
        currentStatus: "in_position",
        currentSymbol: best.symbol,
        currentDirection: best.direction,
        currentEntryPrice: result.avgPrice ?? best.entryPrice.toString(),
        tradesToday: todayCount + 1,
      });

      // Notify via Telegram
      if (config.telegramNotify) {
        const tg = await db.getTelegramSettings(config.userDbId);
        if (tg?.chatId) {
          const tpSlStatus = result.tpSlStatus ?? { tp: "Unknown", sl: "Unknown" };
          await sendTelegramMessage(tg.chatId,
            `🤖 <b>Auto Trade Opened</b>\n\n` +
            `📊 ${best.direction} ${best.symbol}\n` +
            `💰 Entry: $${result.avgPrice ?? best.entryPrice.toFixed(4)}\n` +
            `🎯 TP: $${best.takeProfit.toFixed(4)} [${tpSlStatus.tp}]\n` +
            `🛡 SL: $${best.stopLoss.toFixed(4)} [${tpSlStatus.sl}]\n` +
            `📈 Evidence score: ${best.confidence}/100 | Entry: ${best.entryQualityLabel}\n` +
            `💵 Size: $${marginForTrade} × ${actualLev}x = $${marginForTrade * actualLev}\n` +
            `💪 Leverage: ${actualLev}x${config.leverage === 0 ? " (MAX)" : ""}\n` +
            `📊 Funding: ${fundingRate.toFixed(4)}% | OI: $${(openInterestUsd / 1_000_000).toFixed(2)}M` +
            (result.partialFill ? `\n⚠️ Partial fill: ${result.filledSize}/${result.requestedSize}` : "")
          );
        }
      }
      return "position_opened";
    } else {
      console.warn(`[AutoTrader] Trade execution failed for ${userId}: ${result.error}`);
      await db.logAutoTrade({
        userId,
        symbol: best.symbol,
        direction: best.direction,
        entryPrice: best.entryPrice.toString(),
        positionSize: (marginForTrade * (config.leverage || 50)).toString(),
        marginUsed: marginForTrade.toString(),
        leverage: config.leverage || 50,
        takeProfit: best.takeProfit.toString(),
        stopLoss: best.stopLoss.toString(),
        outcome: "force_close",
        signalConfidence: best.confidence,
        entryQuality: best.entryQualityLabel,
        errorMessage: result.error,
      });

      if (config.telegramNotify) {
        const tg = await db.getTelegramSettings(config.userDbId);
        if (tg?.chatId) {
          await sendTelegramMessage(tg.chatId,
            `⚠️ <b>Auto Trade Failed</b>\n\n` +
            `📊 ${best.direction} ${best.symbol}\n` +
            `🎯 Evidence score: ${best.confidence}/100 | Entry: ${best.entryQualityLabel}\n` +
            `❌ Error: ${result.error}\n` +
            `🔄 Retries attempted: ${result.retryCount ?? 0}\n\n` +
            `Bot will continue scanning...`
          );
        }
      }
      const reason = String(result.error ?? "Trade execution failed").slice(0, 500);
      await db.updateAutoTraderStatus(userId, {
        currentStatus: "error",
        lastWorkerError: reason,
      });
      return "error";
    }
  } catch (err: any) {
    const reason = String(err?.message ?? err).slice(0, 500);
    console.error(`[AutoTrader] Scan/execute error for ${userId}:`, reason);
    await db.updateAutoTraderStatus(userId, {
      currentStatus: "error",
      lastWorkerError: reason,
    });
    if (config.telegramNotify) {
      try {
        const tg = await db.getTelegramSettings(config.userDbId);
        if (tg?.chatId) {
          await sendTelegramMessage(tg.chatId,
            `🚨 <b>Auto Trader Error</b>\n\n❌ ${reason}\n\nBot will retry with bounded backoff.`
          );
        }
      } catch (_) { /* ignore notification errors */ }
    }
    return "error";
  }
}

// ─── Trade Execution with Retry ──────────────────────────────────────────────

interface ExecutionResult {
  success: boolean;
  avgPrice?: string;
  error?: string;
  effectiveLeverage?: number;
  tpSlStatus?: { tp: string; sl: string };
  partialFill?: boolean;
  filledSize?: string;
  requestedSize?: string;
  retryCount?: number;
}

async function executeAutoTradeWithRetry(
  config: AutoTraderConfig,
  signal: { symbol: string; direction: "LONG" | "SHORT"; entryPrice: number; takeProfit: number; stopLoss: number; marginOverride: number },
  privateKey: string,
  walletAddress: string,
  maxRetries = 2
): Promise<ExecutionResult> {
  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s
      await new Promise(r => setTimeout(r, 2000 * attempt));
      console.log(`[AutoTrader] Retry attempt ${attempt}/${maxRetries} for ${signal.symbol}...`);
    }
    const result = await executeAutoTrade(config, signal, privateKey, walletAddress);
    if (result.success) {
      return { ...result, retryCount: attempt };
    }
    lastError = result.error ?? "Unknown error";

    // Don't retry on non-transient errors
    if (lastError.includes("not found on Hyperliquid") ||
        lastError.includes("Order size too small") ||
        lastError.includes("Insufficient margin") ||
        lastError.includes("rejected")) {
      return { ...result, retryCount: attempt };
    }
  }
  return { success: false, error: lastError, retryCount: maxRetries };
}

async function executeAutoTrade(
  config: AutoTraderConfig,
  signal: { symbol: string; direction: "LONG" | "SHORT"; entryPrice: number; takeProfit: number; stopLoss: number; marginOverride: number },
  privateKey: string,
  walletAddress: string
): Promise<ExecutionResult> {
  try {
    const { signL1Action, buildOrderAction, buildLeverageAction, floatToWire } = await import("../hyperliquidSigning");

    // Convert symbol to HL format
    let hlSymbol = signal.symbol.toUpperCase();
    if (hlSymbol.endsWith("USDT")) hlSymbol = hlSymbol.slice(0, -4);
    else if (hlSymbol.endsWith("USDC")) hlSymbol = hlSymbol.slice(0, -4);
    else if (hlSymbol.endsWith("USD")) hlSymbol = hlSymbol.slice(0, -3);

    // Fetch asset meta
    const { assets } = await getHyperliquidUniverseWithCtx();
    const assetIndex = assets.findIndex((a) => a.name.toUpperCase() === hlSymbol);
    if (assetIndex === -1) return { success: false, error: `Symbol "${hlSymbol}" (from ${signal.symbol}) not found on Hyperliquid` };
    const szDecimals = assets[assetIndex].szDecimals ?? 4;

    // Fetch live mark price
    const priceRes = await axios.post("https://api.hyperliquid.xyz/info",
      { type: "allMids" },
      { headers: { "Content-Type": "application/json" }, timeout: 5000 }
    );
    const mids: Record<string, string> = priceRes.data ?? {};
    const liveMid = parseFloat(mids[hlSymbol] ?? "0");
    if (liveMid <= 0) return { success: false, error: `Could not fetch live price for ${hlSymbol}` };

    const isBuy = signal.direction === "LONG";
    const nonce = Date.now();

    // Determine leverage: use max available if config.leverage is 0 (auto)
    const maxLev = await getMaxLeverage(hlSymbol);
    const effectiveLeverage = config.leverage === 0 ? maxLev : Math.min(config.leverage, maxLev);

    // Set leverage
    const levAction = buildLeverageAction(assetIndex, effectiveLeverage);
    const levSig = await signL1Action(privateKey, levAction, null, nonce);
    const leverageResponse = await axios.post("https://api.hyperliquid.xyz/exchange", {
      action: levAction, nonce, signature: levSig,
    }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
    if (leverageResponse.data?.status !== "ok") {
      const exchangeError = leverageResponse.data?.response?.data?.statuses?.[0]?.error
        ?? leverageResponse.data?.response
        ?? "unknown Hyperliquid leverage update error";
      throw new Error(`Hyperliquid leverage update failed for ${hlSymbol}: ${String(exchangeError)}`);
    }

    // Dynamic margin is required. Never fall back to a persisted fixed amount.
    const margin = signal.marginOverride;
    if (!Number.isFinite(margin) || margin <= 0) {
      return { success: false, error: "Dynamic margin unavailable; order not submitted" };
    }
    const notional = margin * effectiveLeverage;
    const rawSize = notional / liveMid;
    const roundedSize = parseFloat(rawSize.toFixed(szDecimals));
    if (roundedSize <= 0) return { success: false, error: "Order size too small" };

    // Market order with 3% slippage (IOC)
    const slippageFactor = isBuy ? 1.03 : 0.97;
    const effectivePrice = parseFloat((liveMid * slippageFactor).toPrecision(5));

    const orderNonce = nonce + 1;
    const orderAction = buildOrderAction({
      assetIndex,
      isBuy,
      price: effectivePrice,
      size: roundedSize,
      reduceOnly: false,
      tif: "Ioc",
    });
    const orderSig = await signL1Action(privateKey, orderAction, null, orderNonce);
    const orderRes = await axios.post("https://api.hyperliquid.xyz/exchange", {
      action: orderAction, nonce: orderNonce, signature: orderSig,
    }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });

    const response = orderRes.data;
    const status = response?.response?.data?.statuses?.[0];
    const filled = status?.filled;
    const error = status?.error;
    if (error) return { success: false, error: `Order rejected: ${error}` };

    const filledSize = filled?.totalSz ? parseFloat(filled.totalSz) : 0;

    // Handle partial fills
    if (filledSize <= 0) {
      return { success: false, error: "Order not filled (IOC expired with 0 fill)" };
    }

    const partialFill = filledSize < roundedSize * 0.95; // Less than 95% filled
    if (partialFill) {
      console.log(`[AutoTrader] Partial fill: ${filledSize}/${roundedSize} for ${hlSymbol}`);
    }

    // ── Place position-level TP/SL, then verify they actually rest on HL ──
    // Do not represent a position as protected simply because the exchange did
    // not synchronously return an error. The trigger-aware frontend endpoint is
    // the source of truth for exchange-side protection.
    const protection = await placeAndVerifyPositionTpsl({
      privateKey,
      walletAddress,
      hlSymbol,
      assetIndex,
      isBuy: !isBuy,
      takeProfit: signal.takeProfit,
      stopLoss: signal.stopLoss,
      size: parseFloat(filledSize.toFixed(szDecimals)),
      szDecimals,
    });
    const tpSlStatus = protection.status;

    if (!protection.verified) {
      const closeResult = await emergencyCloseUnprotectedPosition({
        privateKey,
        assetIndex,
        isBuy: !isBuy,
        size: parseFloat(filledSize.toFixed(szDecimals)),
        szDecimals,
        hlSymbol,
      });
      return {
        success: false,
        error: `TP/SL protection was not verified (${protection.reason}); emergency close ${closeResult ? "submitted" : "failed"}.`,
        tpSlStatus,
      };
    }

    return {
      success: true,
      avgPrice: filled?.avgPx ?? liveMid.toString(),
      effectiveLeverage,
      tpSlStatus,
      partialFill,
      filledSize: filledSize.toFixed(szDecimals),
      requestedSize: roundedSize.toFixed(szDecimals),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Hyperliquid Position TP/SL with Exchange Verification ──────────────────

async function placeAndVerifyPositionTpsl(params: {
  privateKey: string;
  walletAddress: string;
  hlSymbol: string;
  assetIndex: number;
  isBuy: boolean;
  takeProfit: number;
  stopLoss: number;
  size: number;
  szDecimals: number;
}): Promise<{ verified: boolean; status: { tp: string; sl: string }; reason?: string }> {
  const { signL1Action, buildPositionTpslAction } = await import("../hyperliquidSigning");
  const action = buildPositionTpslAction({
    assetIndex: params.assetIndex,
    closingIsBuy: params.isBuy,
    size: parseFloat(params.size.toFixed(params.szDecimals)),
    takeProfit: params.takeProfit,
    stopLoss: params.stopLoss,
  });

  try {
    const nonce = Date.now();
    const sig = await signL1Action(params.privateKey, action, null, nonce);
    const res = await axios.post("https://api.hyperliquid.xyz/exchange", {
      action, nonce, signature: sig,
    }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
    const statuses = res.data?.response?.data?.statuses ?? [];
    const errors = statuses.map((status: any) => status?.error).filter(Boolean);
    if (errors.length) {
      return { verified: false, status: { tp: `Failed: ${errors[0]}`, sl: `Failed: ${errors[1] ?? errors[0]}` }, reason: errors.join("; ") };
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    const verify = await axios.post("https://api.hyperliquid.xyz/info", {
      type: "frontendOpenOrders", user: params.walletAddress,
    }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
    const triggers = (verify.data ?? []).filter((order: any) =>
      order.coin?.toUpperCase() === params.hlSymbol.toUpperCase() &&
      order.isTrigger === true && order.reduceOnly === true
    );
    const hasTp = triggers.some((order: any) => Math.abs(parseFloat(order.triggerPx) - params.takeProfit) < Math.max(params.takeProfit * 0.0001, 1e-8));
    const hasSl = triggers.some((order: any) => Math.abs(parseFloat(order.triggerPx) - params.stopLoss) < Math.max(params.stopLoss * 0.0001, 1e-8));
    const status = { tp: hasTp ? "Verified" : "Unverified", sl: hasSl ? "Verified" : "Unverified" };
    return { verified: hasTp && hasSl, status, reason: hasTp && hasSl ? undefined : "trigger orders absent from Hyperliquid frontendOpenOrders" };
  } catch (error: any) {
    const message = String(error?.message ?? error);
    return { verified: false, status: { tp: `Error: ${message}`, sl: `Error: ${message}` }, reason: message };
  }
}

async function emergencyCloseUnprotectedPosition(params: {
  privateKey: string;
  assetIndex: number;
  isBuy: boolean;
  size: number;
  szDecimals: number;
  hlSymbol: string;
}): Promise<boolean> {
  try {
    const { signL1Action, buildOrderAction } = await import("../hyperliquidSigning");
    const mids = await axios.post("https://api.hyperliquid.xyz/info", { type: "allMids" }, { timeout: 10000 });
    const mid = parseFloat(mids.data?.[params.hlSymbol] ?? "0");
    if (mid <= 0) return false;
    const emergencyPrice = params.isBuy ? mid * 1.03 : mid * 0.97;
    const action = buildOrderAction({
      assetIndex: params.assetIndex,
      isBuy: params.isBuy,
      price: parseFloat(emergencyPrice.toPrecision(5)),
      size: parseFloat(params.size.toFixed(params.szDecimals)),
      reduceOnly: true,
      tif: "Ioc",
    });
    const nonce = Date.now();
    const signature = await signL1Action(params.privateKey, action, null, nonce);
    const response = await axios.post("https://api.hyperliquid.xyz/exchange", { action, nonce, signature }, { timeout: 10000 });
    return Boolean(response.data?.response?.data?.statuses?.[0]?.filled?.totalSz);
  } catch (error) {
    console.error("[AutoTrader] Emergency close after TP/SL verification failure:", error);
    return false;
  }
}

/** Tighten an already verified position SL and persist only after read-back verification. */
async function tightenVerifiedHyperliquidStop(params: {
  privateKey: string; walletAddress: string; hlSymbol: string; direction: "LONG" | "SHORT";
  currentStopLoss: number; nextStopLoss: number; positionSize: number; tradeId: number;
}): Promise<{ updated: boolean; reason?: string }> {
  try {
    const { assets } = await getHyperliquidUniverseWithCtx();
    const assetIndex = assets.findIndex(a => a.name.toUpperCase() === params.hlSymbol.toUpperCase());
    if (assetIndex < 0) return { updated: false, reason: "asset not found" };
    const readOrders = async () => (await axios.post("https://api.hyperliquid.xyz/info", { type: "frontendOpenOrders", user: params.walletAddress }, { timeout: 10_000 })).data ?? [];
    const tolerance = Math.max(params.currentStopLoss * 0.0001, 1e-8);
    const stop = (await readOrders()).find((o: any) => o.coin?.toUpperCase() === params.hlSymbol.toUpperCase() && o.isTrigger === true && o.reduceOnly === true && o.isPositionTpsl === true && Math.abs(parseFloat(o.triggerPx) - params.currentStopLoss) <= tolerance && Number.isInteger(o.oid));
    if (!stop) return { updated: false, reason: "verified position stop trigger not found" };
    const { buildVerifiedTrailingStopUpdate } = await import("./hyperliquidTrailingStop");
    const { signL1Action } = await import("../hyperliquidSigning");
    const action = buildVerifiedTrailingStopUpdate({ oid: stop.oid, assetIndex, closingIsBuy: params.direction === "SHORT", size: Math.abs(params.positionSize), currentStopLoss: params.currentStopLoss, nextStopLoss: params.nextStopLoss, direction: params.direction });
    const nonce = Date.now();
    const signature = await signL1Action(params.privateKey, action, null, nonce);
    const response = await axios.post("https://api.hyperliquid.xyz/exchange", { action, nonce, signature }, { timeout: 10_000 });
    if (response.data?.response?.data?.statuses?.[0]?.error) return { updated: false, reason: "modify rejected" };
    await new Promise(resolve => setTimeout(resolve, 500));
    const verify = (await readOrders()).some((o: any) => o.oid === stop.oid && o.coin?.toUpperCase() === params.hlSymbol.toUpperCase() && o.isTrigger === true && o.reduceOnly === true && o.isPositionTpsl === true && Math.abs(parseFloat(o.triggerPx) - params.nextStopLoss) <= Math.max(params.nextStopLoss * 0.0001, 1e-8));
    if (!verify) return { updated: false, reason: "modified stop not verified" };
    await db.updateAutoTradeTrailingStop(params.tradeId, params.nextStopLoss.toString());
    return { updated: true };
  } catch (error: any) { return { updated: false, reason: String(error?.message ?? error).slice(0, 300) }; }
}

// ─── Position Monitoring (Enhanced for HL) ──────────────────────────────────

async function monitorOpenPositions(
  config: AutoTraderConfig,
  openTrades: Awaited<ReturnType<typeof db.getOpenAutoTrades>>,
  walletAddress: string,
  privateKey: string
): Promise<void> {
  try {
    // Fetch current positions from Hyperliquid
    const stateRes = await axios.post("https://api.hyperliquid.xyz/info",
      { type: "clearinghouseState", user: walletAddress },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    const positions = stateRes.data?.assetPositions ?? [];

    for (const trade of openTrades) {
      // Convert trade symbol to HL format
      let tradeHlSymbol = trade.symbol.toUpperCase();
      if (tradeHlSymbol.endsWith("USDT")) tradeHlSymbol = tradeHlSymbol.slice(0, -4);
      else if (tradeHlSymbol.endsWith("USDC")) tradeHlSymbol = tradeHlSymbol.slice(0, -4);
      else if (tradeHlSymbol.endsWith("USD")) tradeHlSymbol = tradeHlSymbol.slice(0, -3);

      // Find matching position
      const pos = positions.find((p: any) =>
        p.position?.coin?.toUpperCase() === tradeHlSymbol &&
        parseFloat(p.position?.szi ?? "0") !== 0
      );

      if (!pos) {
        // Position is closed (TP/SL hit or manually closed)
        const entryPrice = parseFloat(trade.entryPrice);
        let exitPrice = entryPrice;
        let outcome = "tp_hit";

        // Determine exit from recent fills
        try {
          const fillsRes = await axios.post("https://api.hyperliquid.xyz/info",
            { type: "userFills", user: walletAddress },
            { headers: { "Content-Type": "application/json" }, timeout: 10000 }
          );
          const fills = fillsRes.data ?? [];
          // Find the most recent closing fill for this symbol
          const recentFill = fills.find((f: any) =>
            f.coin?.toUpperCase() === tradeHlSymbol &&
            f.closedPnl && parseFloat(f.closedPnl) !== 0
          );
          if (recentFill) {
            exitPrice = parseFloat(recentFill.px);
            const pnl = parseFloat(recentFill.closedPnl);
            outcome = pnl >= 0 ? "tp_hit" : "sl_hit";
          }
        } catch { /* use defaults */ }

        const pnl = trade.direction === "LONG"
          ? (exitPrice - entryPrice) / entryPrice * parseFloat(trade.positionSize)
          : (entryPrice - exitPrice) / entryPrice * parseFloat(trade.positionSize);

        const durationSeconds = Math.floor((Date.now() - new Date(trade.openedAt).getTime()) / 1000);

        await db.closeAutoTrade(trade.id, {
          exitPrice: exitPrice.toString(),
          pnl: pnl.toFixed(2),
          outcome,
          durationSeconds,
          closedAt: new Date(),
        });

        // Update user stats
        const settings = await db.getAutoTraderSettings(config.userId);
        const newDailyPnl = parseFloat(settings?.dailyPnl ?? "0") + pnl;
        const newTotalPnl = parseFloat(settings?.totalPnl ?? "0") + pnl;

        await db.updateAutoTraderStatus(config.userId, {
          currentStatus: "cooldown",
          currentSymbol: null,
          currentDirection: null,
          currentEntryPrice: null,
          lastTradeClosedAt: new Date(),
          dailyPnl: newDailyPnl.toFixed(2),
          totalPnl: newTotalPnl.toFixed(2),
        });

        // Notify via Telegram
        if (config.telegramNotify) {
          const tg = await db.getTelegramSettings(config.userDbId);
          if (tg?.chatId) {
            const emoji = pnl >= 0 ? "✅" : "❌";
            const duration = durationSeconds < 60 ? `${durationSeconds}s` : `${Math.floor(durationSeconds / 60)}m`;
            await sendTelegramMessage(tg.chatId,
              `${emoji} <b>Auto Trade Closed</b>\n\n` +
              `📊 ${trade.direction} ${trade.symbol}\n` +
              `💰 Entry: $${trade.entryPrice} → Exit: $${exitPrice.toFixed(4)}\n` +
              `${pnl >= 0 ? "🟢" : "🔴"} P&L: $${pnl.toFixed(2)}\n` +
              `⏱ Duration: ${duration}\n` +
              `📈 Daily P&L: $${newDailyPnl.toFixed(2)}`
            );
          }
        }
      } else {
        // Position still open — calculate a candidate that never loosens the stop.
        const markPx = parseFloat(pos.position?.markPx ?? "0");
        const entryPx = parseFloat(pos.position?.entryPx ?? trade.entryPrice);
        const leverage = parseFloat(pos.position?.leverage?.value ?? "1");
        const isLong = parseFloat(pos.position?.szi ?? "0") > 0;
        const trailing = calculateNonLooseningTrailingStop({
          direction: isLong ? "LONG" : "SHORT",
          entryPrice: entryPx,
          initialStopLoss: parseFloat(trade.initialStopLoss ?? trade.stopLoss ?? "0"),
          currentStopLoss: parseFloat(trade.stopLoss ?? "0"),
          markPrice: markPx,
        });
        if (trailing.shouldUpdate && trailing.nextStopLoss !== undefined) {
          const update = await tightenVerifiedHyperliquidStop({
            privateKey, walletAddress, hlSymbol: tradeHlSymbol,
            direction: isLong ? "LONG" : "SHORT",
            currentStopLoss: parseFloat(trade.stopLoss ?? "0"),
            nextStopLoss: trailing.nextStopLoss,
            positionSize: parseFloat(pos.position?.szi ?? "0"), tradeId: trade.id,
          });
          if (!update.updated) console.warn(`[AutoTrader] Trailing stop unchanged for ${trade.symbol}: ${update.reason ?? "unverified"}.`);
          else console.log(`[AutoTrader] Trailing stop tightened for ${trade.symbol}: ${trailing.nextStopLoss}.`);
        }

        // Approximate liquidation price
        const liqDistance = isLong
          ? (markPx - entryPx * (1 - 0.9 / leverage)) / markPx * 100
          : (entryPx * (1 + 0.9 / leverage) - markPx) / markPx * 100;

        // Warn if within 5% of liquidation
        if (liqDistance < 5 && config.telegramNotify) {
          const tg = await db.getTelegramSettings(config.userDbId);
          if (tg?.chatId) {
            await sendTelegramMessage(tg.chatId,
              `⚠️ <b>Liquidation Warning</b>\n\n` +
              `📊 ${trade.direction} ${trade.symbol}\n` +
              `💰 Entry: $${entryPx.toFixed(4)} | Mark: $${markPx.toFixed(4)}\n` +
              `🔴 Distance to liq: ${liqDistance.toFixed(1)}%\n` +
              `📊 Leverage: ${leverage}x`
            );
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`[AutoTrader] Monitor error:`, err.message);
  }
}
