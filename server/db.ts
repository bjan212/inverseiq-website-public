import { desc, eq, gte, and, lte, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertNotification, InsertNotificationPreferences, InsertSignalHistory, InsertUser, notificationPreferences, notifications, signalHistory, users, confidenceHistory, InsertConfidenceHistory, binanceApiKeys, InsertBinanceApiKey, BinanceApiKey, gemWatchlist, InsertGemWatchlistItem, cexApiKeys, CexApiKey, userPatterns, InsertUserPattern, UserPattern, userSymbolPatterns, InsertUserSymbolPattern, UserSymbolPattern, hyperliquidKeys, HyperliquidKey, scanHistory, InsertScanHistoryItem, ScanHistoryItem, predictionHistory, InsertPredictionHistoryItem, PredictionHistoryItem, activeTrades, InsertActiveTrade, ActiveTrade, telegramSettings, InsertTelegramSetting, TelegramSetting, marketAlerts, InsertMarketAlert, MarketAlert, discoveredGems, DiscoveredGem, InsertDiscoveredGem, gemScanSettings, GemScanSetting, InsertGemScanSetting, autoTraderSettings, AutoTraderSetting, InsertAutoTraderSetting, autoTraderHistory, AutoTraderHistoryRow, InsertAutoTraderHistory, userSettings, exchangeTradeFills, ExchangeTradeFill, InsertExchangeTradeFill, exchangeHistorySyncState, ExchangeHistorySyncState, signalCalibrationObservations, SignalCalibrationObservation, InsertSignalCalibrationObservation } from "../drizzle/schema";
import { ENV } from './_core/env';
import { feedbackOutbox, FeedbackOutboxItem } from "../drizzle/schema";
import { decryptCredentialValue, encryptCredentialValue, isCurrentCredentialCiphertext } from "./lib/credentialCrypto";
import { assertSingleOwnerBatch } from "./lib/exchangeHistoryCore";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Signal History Queries
 */

/** Save a new signal to history */
export async function saveSignal(signal: InsertSignalHistory) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save signal: database not available");
    return null;
  }

  try {
    const result = await db.insert(signalHistory).values(signal);
    return result;
  } catch (error) {
    console.error("[Database] Failed to save signal:", error);
    throw error;
  }
}

/** Save a private, versioned shadow observation once per user sampling bucket. */
export async function saveSignalCalibrationObservation(observation: InsertSignalCalibrationObservation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available for signal calibration");
  return db.insert(signalCalibrationObservations).values(observation).onDuplicateKeyUpdate({
    set: { observationKey: sql`${signalCalibrationObservations.observationKey}` },
  });
}

/** Pending shadow observations are verified by the existing durable signal verifier. */
export async function getPendingSignalCalibrationObservations(limit = 20, now = new Date()): Promise<SignalCalibrationObservation[]> {
  const db = await getDb();
  if (!db) return [];
  const dueBefore = new Date(now.getTime() - 5 * 60 * 1000);
  return db
    .select()
    .from(signalCalibrationObservations)
    .where(and(
      eq(signalCalibrationObservations.outcome, "pending"),
      or(
        isNull(signalCalibrationObservations.lastCheckedAt),
        lte(signalCalibrationObservations.lastCheckedAt, dueBefore),
      ),
    ))
    .orderBy(signalCalibrationObservations.observedAt)
    .limit(Math.max(1, Math.min(500, Math.trunc(limit))));
}

export async function markSignalCalibrationObservationChecked(id: number, checkedAt = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available for signal calibration");
  return db.update(signalCalibrationObservations)
    .set({
      lastCheckedAt: checkedAt,
      checkCount: sql`${signalCalibrationObservations.checkCount} + 1`,
    })
    .where(eq(signalCalibrationObservations.id, id));
}

export async function updateSignalCalibrationObservationOutcome(
  id: number,
  outcome: "hit_tp" | "hit_sl" | "expired" | "ambiguous",
  exitPrice?: string,
  outcomeAt = new Date(),
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available for signal calibration");
  return db.update(signalCalibrationObservations)
    .set({
      outcome,
      actualExitPrice: exitPrice ?? null,
      outcomeAt,
      lastCheckedAt: outcomeAt,
      checkCount: sql`${signalCalibrationObservations.checkCount} + 1`,
    })
    .where(eq(signalCalibrationObservations.id, id));
}

export async function getSignalCalibrationObservations(userId: string, days = 30, modelVersion?: string): Promise<SignalCalibrationObservation[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - Math.max(1, Math.min(365, Math.trunc(days))) * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(signalCalibrationObservations)
    .where(and(
      eq(signalCalibrationObservations.userId, userId),
      gte(signalCalibrationObservations.observedAt, cutoff),
      modelVersion ? eq(signalCalibrationObservations.modelVersion, modelVersion) : undefined,
    ))
    .orderBy(desc(signalCalibrationObservations.observedAt));
}

/** Get all signals with optional filtering */
export async function getSignals(options?: {
  minConfidence?: number;
  limit?: number;
  outcome?: "pending" | "hit_tp" | "hit_sl" | "expired";
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get signals: database not available");
    return [];
  }

  try {
    let query = db.select().from(signalHistory);

    // Apply filters
    if (options?.minConfidence) {
      query = query.where(gte(signalHistory.confidence, options.minConfidence)) as any;
    }
    if (options?.outcome) {
      query = query.where(eq(signalHistory.outcome, options.outcome)) as any;
    }

    // Order by most recent first
    query = query.orderBy(desc(signalHistory.generatedAt)) as any;

    // Apply limit
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }

    const results = await query;
    return results;
  } catch (error) {
    console.error("[Database] Failed to get signals:", error);
    throw error;
  }
}

export type SignalOfTheDayCandidate = {
  entryQualityLabel?: string;
  entryQualityScore?: number;
};

/** True only for a still-pending, explicitly graded A/A+ signal eligible for homepage prominence. */
export function isSignalOfTheDayEligible(signal: {
  confidence: number;
  outcome: string;
  expiresAt: Date | null;
  metadata: string | null;
}, now = new Date()): boolean {
  if (signal.outcome !== "pending" || signal.confidence < 80) return false;
  if (signal.expiresAt && signal.expiresAt.getTime() <= now.getTime()) return false;
  try {
    const metadata = JSON.parse(signal.metadata ?? "{}") as SignalOfTheDayCandidate;
    return ["A", "A+"].includes(metadata.entryQualityLabel ?? "");
  } catch {
    return false;
  }
}

/** Select the highest-confidence, explicitly A/A+-graded, still-valid signal from the last 24 hours. */
export async function getSignalOfTheDay(now = new Date()) {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await db.select().from(signalHistory)
    .where(and(gte(signalHistory.generatedAt, since), eq(signalHistory.outcome, "pending")))
    .orderBy(desc(signalHistory.confidence), desc(signalHistory.generatedAt))
    .limit(100);

  const eligible = recent
    .filter(signal => isSignalOfTheDayEligible(signal, now))
    .map(signal => {
      let entryQualityScore = 0;
      try { entryQualityScore = Number(JSON.parse(signal.metadata ?? "{}").entryQualityScore ?? 0); } catch { /* excluded by eligibility */ }
      return { signal, entryQualityScore };
    })
    .sort((a, b) => b.signal.confidence - a.signal.confidence || b.entryQualityScore - a.entryQualityScore || b.signal.generatedAt.getTime() - a.signal.generatedAt.getTime());

  return eligible[0]?.signal ?? null;
}

/** Update signal outcome */
export async function updateSignalOutcome(
  signalId: number,
  outcome: "hit_tp" | "hit_sl" | "expired",
  actualExitPrice?: string
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update signal: database not available");
    return null;
  }

  try {
    const updateData: any = {
      outcome,
      outcomeAt: new Date(),
    };

    if (actualExitPrice) {
      updateData.actualExitPrice = actualExitPrice;
    }

    const result = await db
      .update(signalHistory)
      .set(updateData)
      .where(eq(signalHistory.id, signalId));

    return result;
  } catch (error) {
    console.error("[Database] Failed to update signal outcome:", error);
    throw error;
  }
}

export type FeedbackOutboxPayload = {
  signalId: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  outcome: "win" | "loss";
  confidence: number;
  strategy: string;
};

/** Persist a verified result once; the unique signal key makes verifier retries idempotent. */
export async function queueFeedbackOutbox(payload: FeedbackOutboxPayload): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available for feedback outbox");
  const existing = await db.select({ id: feedbackOutbox.id }).from(feedbackOutbox)
    .where(eq(feedbackOutbox.signalId, payload.signalId)).limit(1);
  if (existing.length > 0) return;
  await db.insert(feedbackOutbox).values({
    signalId: payload.signalId,
    symbol: payload.symbol,
    direction: payload.direction,
    entryPrice: String(payload.entry),
    exitPrice: String(payload.exit),
    outcome: payload.outcome,
    confidence: payload.confidence,
    strategy: payload.strategy,
  });
}

export async function getPendingFeedbackOutbox(limit = 50): Promise<FeedbackOutboxItem[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db.select().from(feedbackOutbox)
    .where(and(
      eq(feedbackOutbox.status, "pending"),
      or(isNull(feedbackOutbox.nextAttemptAt), lte(feedbackOutbox.nextAttemptAt, now)),
    ))
    .orderBy(feedbackOutbox.createdAt)
    .limit(limit);
}

/** 5m, 10m, 20m, … capped at six hours to avoid repeated outage timeouts. */
export function getFeedbackRetryDelayMs(attemptCount: number): number {
  const normalizedAttempt = Math.max(1, attemptCount);
  return Math.min(6 * 60 * 60 * 1000, 5 * 60 * 1000 * 2 ** (normalizedAttempt - 1));
}

export async function markFeedbackDelivered(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(feedbackOutbox).set({ status: "delivered", deliveredAt: now, lastAttemptAt: now, nextAttemptAt: null, lastError: null })
    .where(eq(feedbackOutbox.id, id));
}

export async function recordFeedbackDeliveryFailure(id: number, error: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const row = (await db.select({ attempts: feedbackOutbox.attemptCount }).from(feedbackOutbox)
    .where(eq(feedbackOutbox.id, id)).limit(1))[0];
  const attemptCount = (row?.attempts ?? 0) + 1;
  const lastAttemptAt = new Date();
  await db.update(feedbackOutbox).set({
    attemptCount,
    lastAttemptAt,
    nextAttemptAt: new Date(lastAttemptAt.getTime() + getFeedbackRetryDelayMs(attemptCount)),
    lastError: error.slice(0, 2000),
  }).where(eq(feedbackOutbox.id, id));
}

/** Get signal statistics */
export async function getSignalStats(minConfidence: number = 80) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get signal stats: database not available");
    return null;
  }

  try {
    const allSignals = await db
      .select()
      .from(signalHistory)
      .where(gte(signalHistory.confidence, minConfidence));

    const total = allSignals.length;
    const hitTp = allSignals.filter((s) => s.outcome === "hit_tp").length;
    const hitSl = allSignals.filter((s) => s.outcome === "hit_sl").length;
    const expired = allSignals.filter((s) => s.outcome === "expired").length;
    const pending = allSignals.filter((s) => s.outcome === "pending").length;

    const completed = hitTp + hitSl + expired;
    const winRate = completed > 0 ? (hitTp / completed) * 100 : 0;

    return {
      total,
      hitTp,
      hitSl,
      expired,
      pending,
      completed,
      winRate: winRate.toFixed(2),
    };
  } catch (error) {
    console.error("[Database] Failed to get signal stats:", error);
    throw error;
  }
}

/**
 * Notification Queries
 */

/** Save a new notification */
export async function saveNotification(notification: InsertNotification) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save notification: database not available");
    return null;
  }

  try {
    const result = await db.insert(notifications).values(notification);
    return result;
  } catch (error) {
    console.error("[Database] Failed to save notification:", error);
    throw error;
  }
}

/** Latest persisted event for one signal, used to make scheduled market monitoring retry-safe. */
export async function getLatestSignalNotification(signalId: number, type: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.signalId, signalId), eq(notifications.type, type as any)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all notifications */
export async function getNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get notifications: database not available");
    return [];
  }

  try {
    let query = db.select().from(notifications);

    // Filter unread only
    if (options?.unreadOnly) {
      query = query.where(eq(notifications.isRead, 0)) as any;
    }

    // Order by most recent first
    query = query.orderBy(desc(notifications.createdAt)) as any;

    // Apply limit
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }

    const results = await query;
    return results;
  } catch (error) {
    console.error("[Database] Failed to get notifications:", error);
    throw error;
  }
}

/** Mark notification as read */
export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot mark notification as read: database not available");
    return null;
  }

  try {
    const result = await db
      .update(notifications)
      .set({ isRead: 1 })
      .where(eq(notifications.id, notificationId));

    return result;
  } catch (error) {
    console.error("[Database] Failed to mark notification as read:", error);
    throw error;
  }
}

/** Mark all notifications as read */
export async function markAllNotificationsAsRead() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot mark all notifications as read: database not available");
    return null;
  }

  try {
    const result = await db
      .update(notifications)
      .set({ isRead: 1 })
      .where(eq(notifications.isRead, 0));

    return result;
  } catch (error) {
    console.error("[Database] Failed to mark all notifications as read:", error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

/** Get notification preferences (user-specific or global) */
export async function getNotificationPreferences(userId?: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get notification preferences: database not available");
    return null;
  }

  try {
    // Try to get user-specific preferences first
    if (userId) {
      const userPrefs = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      if (userPrefs.length > 0) {
        return userPrefs[0];
      }
    }

    // Fall back to global preferences (userId = null)
    const globalPrefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, 0))
      .limit(1);

    return globalPrefs.length > 0 ? globalPrefs[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get notification preferences:", error);
    throw error;
  }
}

/** Save or update notification preferences */
export async function saveNotificationPreferences(prefs: InsertNotificationPreferences) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save notification preferences: database not available");
    return null;
  }

  try {
    // Check if preferences already exist
    const existing = await getNotificationPreferences(prefs.userId || undefined);

    if (existing) {
      // Update existing preferences
      const result = await db
        .update(notificationPreferences)
        .set(prefs)
        .where(eq(notificationPreferences.id, existing.id));

      return { success: true, result };
    } else {
      // Insert new preferences
      const result = await db.insert(notificationPreferences).values(prefs);
      return { success: true, result };
    }
  } catch (error) {
    console.error("[Database] Failed to save notification preferences:", error);
    throw error;
  }
}

// ─── Confidence History ───────────────────────────────────────────────────────

/**
 * Save a daily confidence snapshot
 */
export async function saveConfidenceSnapshot(snapshot: InsertConfidenceHistory) {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(confidenceHistory).values(snapshot).onDuplicateKeyUpdate({
      set: {
        avgConfidence: snapshot.avgConfidence,
        totalSignals: snapshot.totalSignals,
        hitTP: snapshot.hitTP,
        hitSL: snapshot.hitSL,
        expired: snapshot.expired,
        winRate: snapshot.winRate,
        backendPatterns: snapshot.backendPatterns,
      },
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to save confidence snapshot:", error);
    return null;
  }
}

/**
 * Get confidence history for the last N days
 */
export async function getConfidenceHistory(days = 30) {
  const db = await getDb();
  if (!db) return [];
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return await db
      .select()
      .from(confidenceHistory)
      .where(gte(confidenceHistory.date, cutoffDate))
      .orderBy(desc(confidenceHistory.date))
      .limit(days);
  } catch (error) {
    console.error("[Database] Failed to get confidence history:", error);
    return [];
  }
}

/**
 * Build today's confidence snapshot from signal history
 */
export async function buildDailySnapshot(backendPatterns = 0) {
  const db = await getDb();
  if (!db) return null;
  try {
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = new Date(today + "T00:00:00.000Z");

    const signals = await db
      .select()
      .from(signalHistory)
      .where(gte(signalHistory.generatedAt, startOfDay));

    if (signals.length === 0) return null;

    const hitTP = signals.filter((s) => s.outcome === "hit_tp").length;
    const hitSL = signals.filter((s) => s.outcome === "hit_sl").length;
    const expired = signals.filter((s) => s.outcome === "expired").length;
    const resolved = hitTP + hitSL;
    const winRate = resolved > 0 ? Math.round((hitTP / resolved) * 100) : 0;
    const avgConfidence = Math.round(
      signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
    );

    const snapshot: InsertConfidenceHistory = {
      date: today,
      avgConfidence,
      totalSignals: signals.length,
      hitTP,
      hitSL,
      expired,
      winRate,
      backendPatterns,
    };

    await saveConfidenceSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    console.error("[Database] Failed to build daily snapshot:", error);
    return null;
  }
}

// ─── Binance API Key Helpers ───────────────────────────────────────────────

/**
 * Simple symmetric encryption for API keys using a server-side secret.
 * Uses XOR with the JWT_SECRET to obfuscate stored keys.
 */
function encryptKey(value: string): string {
  return encryptCredentialValue(value, ENV.cookieSecret);
}

function decryptKey(value: string): string {
  return decryptCredentialValue(value, ENV.cookieSecret);
}

export async function saveBinanceApiKey(data: {
  userId: number;
  apiKey: string;
  apiSecret: string;
  label?: string;
  isTestnet?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Deactivate existing keys for this user first
  await db.update(binanceApiKeys)
    .set({ isActive: 0 })
    .where(eq(binanceApiKeys.userId, data.userId));
  // Insert new key
  await db.insert(binanceApiKeys).values({
    userId: data.userId,
    apiKey: encryptKey(data.apiKey),
    apiSecret: encryptKey(data.apiSecret),
    label: data.label || "My Binance API",
    isActive: 1,
    isTestnet: data.isTestnet ? 1 : 0,
    lastVerifiedAt: new Date(),
  });
}

export async function getBinanceApiKey(userId: number): Promise<{ apiKey: string; apiSecret: string; label: string; isTestnet: boolean; lastVerifiedAt: Date | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(binanceApiKeys)
    .where(eq(binanceApiKeys.userId, userId))
    .orderBy(desc(binanceApiKeys.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row.isActive) return null;
  const apiKey = decryptKey(row.apiKey);
  const apiSecret = decryptKey(row.apiSecret);
  if (!isCurrentCredentialCiphertext(row.apiKey) || !isCurrentCredentialCiphertext(row.apiSecret)) {
    await db.update(binanceApiKeys).set({
      apiKey: encryptKey(apiKey),
      apiSecret: encryptKey(apiSecret),
    }).where(eq(binanceApiKeys.id, row.id));
  }
  return {
    apiKey,
    apiSecret,
    label: row.label || "My Binance API",
    isTestnet: row.isTestnet === 1,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

export async function deleteBinanceApiKey(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(binanceApiKeys)
    .set({ isActive: 0 })
    .where(eq(binanceApiKeys.userId, userId));
}

export async function hasBinanceApiKey(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: binanceApiKeys.id })
    .from(binanceApiKeys)
    .where(eq(binanceApiKeys.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// ─── Gem Watchlist Helpers ────────────────────────────────────────────────────

export async function getGemWatchlist(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gemWatchlist).where(eq(gemWatchlist.userId, userId)).orderBy(desc(gemWatchlist.createdAt));
}

export async function addGemToWatchlist(item: InsertGemWatchlistItem) {
  const db = await getDb();
  if (!db) return null;
  // Check if already exists
  const existing = await db.select().from(gemWatchlist)
    .where(eq(gemWatchlist.userId, item.userId))
    .then(rows => rows.find(r => r.symbol === item.symbol));
  if (existing) return existing;
  await db.insert(gemWatchlist).values(item);
  const inserted = await db.select().from(gemWatchlist)
    .where(eq(gemWatchlist.userId, item.userId))
    .orderBy(desc(gemWatchlist.createdAt))
    .then(rows => rows[0]);
  return inserted ?? null;
}

export async function removeGemFromWatchlist(userId: number, symbol: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(gemWatchlist)
    .where(eq(gemWatchlist.userId, userId));
  // Re-insert all except the removed one (MySQL doesn't support compound where easily)
  // Actually use a subquery approach - just delete by userId and symbol match
}

export async function toggleGemAlert(userId: number, symbol: string, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  // Update alertEnabled for matching row
  const rows = await db.select().from(gemWatchlist).where(eq(gemWatchlist.userId, userId));
  const row = rows.find(r => r.symbol === symbol);
  if (row) {
    await db.update(gemWatchlist)
      .set({ alertEnabled: enabled ? 1 : 0 })
      .where(eq(gemWatchlist.id, row.id));
  }
}

export async function getGemAlertsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(gemWatchlist).where(eq(gemWatchlist.userId, userId));
  return rows.filter(r => r.alertEnabled === 1).map(r => r.symbol);
}

// ─── CEX API Keys (Bybit / OKX) ──────────────────────────────────────────────

export async function saveCexApiKey(data: {
  userId: number;
  exchange: "bybit" | "okx" | "asterdex" | "mexc" | "kucoin" | "gateio" | "bitget";
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  label?: string;
  isTestnet?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Deactivate only an existing key for this exact user+exchange.
  await db.update(cexApiKeys)
    .set({ isActive: 0 })
    .where(and(
      eq(cexApiKeys.userId, data.userId),
      eq(cexApiKeys.exchange, data.exchange),
    ));
  await db.insert(cexApiKeys).values({
    userId: data.userId,
    exchange: data.exchange,
    apiKey: encryptKey(data.apiKey),
    apiSecret: encryptKey(data.apiSecret),
    passphrase: data.passphrase ? encryptKey(data.passphrase) : null,
    label: data.label || `My ${data.exchange.toUpperCase()} API`,
    isActive: 1,
    isTestnet: data.isTestnet ? 1 : 0,
    lastVerifiedAt: new Date(),
  });
}

export async function getCexApiKey(userId: number, exchange: "bybit" | "okx" | "asterdex" | "mexc" | "kucoin" | "gateio" | "bitget"): Promise<{ apiKey: string; apiSecret: string; passphrase: string | null; label: string; isTestnet: boolean; lastVerifiedAt: Date | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(cexApiKeys)
    .where(and(
      eq(cexApiKeys.userId, userId),
      eq(cexApiKeys.exchange, exchange),
      eq(cexApiKeys.isActive, 1),
    ))
    .orderBy(desc(cexApiKeys.createdAt));
  const row = rows[0];
  if (!row) return null;
  const apiKey = decryptKey(row.apiKey);
  const apiSecret = decryptKey(row.apiSecret);
  const passphrase = row.passphrase ? decryptKey(row.passphrase) : null;
  if (
    !isCurrentCredentialCiphertext(row.apiKey)
    || !isCurrentCredentialCiphertext(row.apiSecret)
    || (row.passphrase !== null && !isCurrentCredentialCiphertext(row.passphrase))
  ) {
    await db.update(cexApiKeys).set({
      apiKey: encryptKey(apiKey),
      apiSecret: encryptKey(apiSecret),
      passphrase: passphrase ? encryptKey(passphrase) : null,
    }).where(eq(cexApiKeys.id, row.id));
  }
  return {
    apiKey,
    apiSecret,
    passphrase,
    label: row.label || `My ${exchange.toUpperCase()} API`,
    isTestnet: row.isTestnet === 1,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

/** Users that explicitly enabled a non-zero AsterDEX balance floor. */
export async function getAsterBalanceAlertUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userSettings).where(and(
    eq(userSettings.asterBalanceAlertEnabled, 1),
    gte(userSettings.asterBalanceAlertFloor, 1),
  ));
}

export async function markAsterBalanceAlertDelivered(userId: number, deliveredAt = new Date()) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSettings)
    .set({ asterBalanceAlertLastNotifiedAt: deliveredAt })
    .where(eq(userSettings.userId, userId));
}

export async function updateCexVerificationState(input: {
  userId: number;
  exchange: "bybit" | "okx" | "asterdex" | "mexc" | "kucoin" | "gateio" | "bitget";
  availableBalance: string;
  totalBalance: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(cexApiKeys)
    .set({
      lastVerifiedAt: new Date(),
      lastVerifiedAvailableBalance: input.availableBalance,
      lastVerifiedTotalBalance: input.totalBalance,
    })
    .where(and(
      eq(cexApiKeys.userId, input.userId),
      eq(cexApiKeys.exchange, input.exchange),
      eq(cexApiKeys.isActive, 1),
    ));
}

export async function getCexVerificationState(userId: number, exchange: "bybit" | "okx" | "asterdex" | "mexc" | "kucoin" | "gateio" | "bitget") {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    lastVerifiedAt: cexApiKeys.lastVerifiedAt,
    availableBalance: cexApiKeys.lastVerifiedAvailableBalance,
    totalBalance: cexApiKeys.lastVerifiedTotalBalance,
  }).from(cexApiKeys).where(and(
    eq(cexApiKeys.userId, userId),
    eq(cexApiKeys.exchange, exchange),
    eq(cexApiKeys.isActive, 1),
  )).orderBy(desc(cexApiKeys.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function deleteCexApiKey(userId: number, exchange: "bybit" | "okx" | "asterdex" | "mexc" | "kucoin" | "gateio" | "bitget"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(cexApiKeys)
    .set({ isActive: 0 })
    .where(and(
      eq(cexApiKeys.userId, userId),
      eq(cexApiKeys.exchange, exchange),
    ));
}

export async function hasCexApiKey(userId: number, exchange: "bybit" | "okx" | "asterdex" | "mexc" | "kucoin" | "gateio" | "bitget"): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: cexApiKeys.id })
    .from(cexApiKeys)
    .where(and(
      eq(cexApiKeys.userId, userId),
      eq(cexApiKeys.exchange, exchange),
      eq(cexApiKeys.isActive, 1),
    ))
    .limit(1);
  return rows.length > 0;
}

// ─── Private Exchange Trade-History Learning ─────────────────────────────────

/**
 * Insert only unseen fills for one user, exchange, and source account.
 * The database compound unique index is the final concurrency-safe guard.
 */
export async function insertExchangeTradeFills(
  rows: InsertExchangeTradeFill[],
): Promise<{ inserted: number; duplicates: number }> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 };
  assertSingleOwnerBatch(rows);
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const first = rows[0];
  const existing = await db.select({ externalFillId: exchangeTradeFills.externalFillId })
    .from(exchangeTradeFills)
    .where(and(
      eq(exchangeTradeFills.userId, first.userId),
      eq(exchangeTradeFills.exchange, first.exchange),
      eq(exchangeTradeFills.sourceAccountHash, first.sourceAccountHash),
    ));
  const existingIds = new Set(existing.map((row) => row.externalFillId));
  const batchIds = new Set<string>();
  const unseen = rows.filter((row) => {
    if (existingIds.has(row.externalFillId) || batchIds.has(row.externalFillId)) return false;
    batchIds.add(row.externalFillId);
    return true;
  });

  if (unseen.length > 0) {
    await db.insert(exchangeTradeFills).values(unseen).onDuplicateKeyUpdate({
      set: { externalFillId: sql`${exchangeTradeFills.externalFillId}` },
    });
  }
  return { inserted: unseen.length, duplicates: rows.length - unseen.length };
}

/** Return only deterministic closing outcomes belonging to the requested user. */
export async function getUserExchangeLearningFills(userId: number): Promise<ExchangeTradeFill[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(exchangeTradeFills)
    .where(and(
      eq(exchangeTradeFills.userId, userId),
      eq(exchangeTradeFills.eligibleForLearning, 1),
    ))
    .orderBy(exchangeTradeFills.executedAtMs);
}

export async function upsertExchangeHistorySyncState(input: {
  userId: number;
  exchange: string;
  sourceAccountHash: string;
  status: "never" | "running" | "complete" | "partial" | "failed";
  cursor?: string | null;
  rowsFetched?: number;
  rowsInserted?: number;
  eligibleOutcomes?: number;
  earliestImportedAtMs?: number | null;
  latestImportedAtMs?: number | null;
  retentionNote?: string | null;
  lastError?: string | null;
  lastAttemptAt?: Date | null;
  lastSuccessAt?: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values = {
    ...input,
    rowsFetched: input.rowsFetched ?? 0,
    rowsInserted: input.rowsInserted ?? 0,
    eligibleOutcomes: input.eligibleOutcomes ?? 0,
  };
  await db.insert(exchangeHistorySyncState).values(values).onDuplicateKeyUpdate({
    set: {
      status: input.status,
      cursor: input.cursor,
      rowsFetched: input.rowsFetched,
      rowsInserted: input.rowsInserted,
      eligibleOutcomes: input.eligibleOutcomes,
      earliestImportedAtMs: input.earliestImportedAtMs,
      latestImportedAtMs: input.latestImportedAtMs,
      retentionNote: input.retentionNote,
      lastError: input.lastError,
      lastAttemptAt: input.lastAttemptAt,
      lastSuccessAt: input.lastSuccessAt,
    },
  });
}

export async function getExchangeHistorySyncState(
  userId: number,
  exchange: string,
  sourceAccountHash: string,
): Promise<ExchangeHistorySyncState | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(exchangeHistorySyncState)
    .where(and(
      eq(exchangeHistorySyncState.userId, userId),
      eq(exchangeHistorySyncState.exchange, exchange),
      eq(exchangeHistorySyncState.sourceAccountHash, sourceAccountHash),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestExchangeHistorySyncState(
  userId: number,
  exchange: string,
): Promise<ExchangeHistorySyncState | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(exchangeHistorySyncState)
    .where(and(
      eq(exchangeHistorySyncState.userId, userId),
      eq(exchangeHistorySyncState.exchange, exchange),
    ))
    .orderBy(desc(exchangeHistorySyncState.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Trade Taken Helpers ──────────────────────────────────────────────────────

/** Mark a signal as "trade taken" by the user */
export async function markSignalTradeTaken(
  signalId: number,
  exchange: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(signalHistory)
    .set({
      tradeTaken: 1,
      tradeTakenAt: new Date(),
      tradeTakenExchange: exchange,
    })
    .where(eq(signalHistory.id, signalId));
}

/** Get a single signal by ID */
export async function getSignalById(signalId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(signalHistory)
    .where(eq(signalHistory.id, signalId))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all signals marked as trade taken */
export async function getTradeTakenSignals(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(signalHistory)
    .where(eq(signalHistory.tradeTaken, 1))
    .orderBy(desc(signalHistory.tradeTakenAt))
    .limit(limit);
}

// ─── User Inverse Patterns ────────────────────────────────────────────────────

/**
 * Save (upsert) a user's inverse patterns derived from their uploaded trade history.
 * Deletes existing patterns for the user first, then inserts the new set atomically.
 */
export async function saveUserPatterns(
  userId: number,
  patterns: Array<{
    patternType: "LONG_FAILURE" | "SHORT_FAILURE" | "FOMO_ENTRY" | "PANIC_SELL";
    confidence: number;
    description: string;
    action: string;
    tradeCount: number;
    totalWins: number;
    totalLosses: number;
  }>,
  source: "manual" | "exchange" = "manual",
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save user patterns: database not available");
    return;
  }
  // Replace only this provenance layer; never erase another private source.
  await db.delete(userPatterns).where(and(
    eq(userPatterns.userId, userId),
    eq(userPatterns.source, source),
  ));
  // Insert new patterns (skip if empty — user cleared history)
  if (patterns.length === 0) return;
  const rows: InsertUserPattern[] = patterns.map((p) => ({
    userId,
    source,
    patternType: p.patternType,
    confidence: p.confidence,
    description: p.description,
    action: p.action,
    tradeCount: p.tradeCount,
    totalWins: p.totalWins,
    totalLosses: p.totalLosses,
  }));
  await db.insert(userPatterns).values(rows);
}

/**
 * Retrieve all stored inverse patterns for a user.
 */
export async function getUserPatterns(userId: number): Promise<UserPattern[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userPatterns)
    .where(eq(userPatterns.userId, userId))
    .orderBy(desc(userPatterns.confidence));
}

/**
 * Delete all stored inverse patterns for a user.
 */
export async function deleteUserPatterns(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(userPatterns).where(eq(userPatterns.userId, userId));
}

// ─── User Symbol Patterns ───────────────────────────────────────────────

/**
 * Save (upsert) per-symbol patterns for a user.
 * Deletes all existing symbol patterns first, then inserts the new set.
 */
export async function saveUserSymbolPatterns(
  userId: number,
  patterns: Array<{
    symbol: string;
    tradeCount: number;
    wins: number;
    losses: number;
    winRate: number;
    avgPnlCents: number;
    totalPnlCents: number;
    dominantSide: string;
    bias: string;
    confidenceAdjustment: number;
    action: string;
    summary: string;
  }>,
  source: "manual" | "exchange" = "manual",
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save user symbol patterns: database not available");
    return;
  }
  await db.delete(userSymbolPatterns).where(and(
    eq(userSymbolPatterns.userId, userId),
    eq(userSymbolPatterns.source, source),
  ));
  if (patterns.length === 0) return;
  const rows: InsertUserSymbolPattern[] = patterns.map((p) => ({
    userId,
    source,
    symbol: p.symbol,
    tradeCount: p.tradeCount,
    wins: p.wins,
    losses: p.losses,
    winRate: p.winRate,
    avgPnlCents: p.avgPnlCents,
    totalPnlCents: p.totalPnlCents,
    dominantSide: p.dominantSide,
    bias: p.bias,
    confidenceAdjustment: p.confidenceAdjustment,
    action: p.action,
    summary: p.summary,
  }));
  await db.insert(userSymbolPatterns).values(rows);
}

/**
 * Retrieve all stored symbol patterns for a user, ordered by absolute confidence adjustment.
 */
export async function getUserSymbolPatterns(userId: number): Promise<UserSymbolPattern[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userSymbolPatterns)
    .where(eq(userSymbolPatterns.userId, userId));
}

/**
 * Retrieve the symbol pattern for a specific pair, or null if not found.
 */
export async function getUserSymbolPattern(
  userId: number,
  symbol: string
): Promise<UserSymbolPattern | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(userSymbolPatterns)
    .where(eq(userSymbolPatterns.userId, userId))
    .limit(1);
  // Filter in JS since drizzle doesn't support AND with varchar easily here
  return rows.find(r => r.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}

/**
 * Delete all stored symbol patterns for a user.
 */
export async function deleteUserSymbolPatterns(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(userSymbolPatterns).where(eq(userSymbolPatterns.userId, userId));
}

// ─── Hyperliquid Key helpers ──────────────────────────────────────────────────

import crypto from "node:crypto";

const HL_ENC_KEY = (() => {
  const secret = process.env.JWT_SECRET ?? "default-hl-enc-secret";
  return crypto.createHash("sha256").update(secret).digest();
})();

function encryptPrivateKey(raw: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", HL_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function decryptPrivateKey(stored: string): string {
  const [ivHex, encHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", HL_ENC_KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export async function saveHyperliquidKey(data: {
  userId: number;
  privateKey: string;
  walletAddress: string;
  label?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encrypted = encryptPrivateKey(data.privateKey);
  // Delete any existing key for this user first (one key per user)
  await db.delete(hyperliquidKeys).where(eq(hyperliquidKeys.userId, data.userId));
  await db.insert(hyperliquidKeys).values({
    userId: data.userId,
    encryptedPrivateKey: encrypted,
    walletAddress: data.walletAddress.toLowerCase(),
    label: data.label ?? "My Hyperliquid Wallet",
    isActive: 1,
  });
}

export async function getHyperliquidKey(userId: number): Promise<{ privateKey: string; walletAddress: string; label: string; lastVerifiedAt: Date | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(hyperliquidKeys).where(eq(hyperliquidKeys.userId, userId)).limit(1);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    privateKey: decryptPrivateKey(row.encryptedPrivateKey),
    walletAddress: row.walletAddress,
    label: row.label ?? "My Hyperliquid Wallet",
    lastVerifiedAt: row.lastVerifiedAt ?? null,
  };
}

/** Read-only account identity for public account and history queries. */
export async function getHyperliquidWalletAddress(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ walletAddress: hyperliquidKeys.walletAddress })
    .from(hyperliquidKeys)
    .where(and(
      eq(hyperliquidKeys.userId, userId),
      eq(hyperliquidKeys.isActive, 1),
    ))
    .limit(1);
  return rows[0]?.walletAddress ?? null;
}

export async function deleteHyperliquidKey(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(hyperliquidKeys).where(eq(hyperliquidKeys.userId, userId));
}

export async function hasHyperliquidKey(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: hyperliquidKeys.id }).from(hyperliquidKeys).where(eq(hyperliquidKeys.userId, userId)).limit(1);
  return rows.length > 0;
}

export async function markHyperliquidKeyVerified(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(hyperliquidKeys)
    .set({ lastVerifiedAt: new Date() })
    .where(eq(hyperliquidKeys.userId, userId));
}

// ─── Scan History helpers ─────────────────────────────────────────────────────

export async function saveScan(item: InsertScanHistoryItem): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scanHistory).values(item);
}

export async function listScans(userId: number, limit = 50): Promise<ScanHistoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scanHistory)
    .where(eq(scanHistory.userId, userId))
    .orderBy(desc(scanHistory.createdAt))
    .limit(limit);
}

export async function deleteScans(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(scanHistory).where(eq(scanHistory.userId, userId));
}

// ─── Prediction History helpers ───────────────────────────────────────────────

export async function savePrediction(item: InsertPredictionHistoryItem): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(predictionHistory).values(item);
}

export async function listPredictions(userId: number, limit = 50): Promise<PredictionHistoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(predictionHistory)
    .where(eq(predictionHistory.userId, userId))
    .orderBy(desc(predictionHistory.createdAt))
    .limit(limit);
}

export async function deletePredictions(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(predictionHistory).where(eq(predictionHistory.userId, userId));
}


// ─── Active Trades ──────────────────────────────────────────────────────────────

/** Create a new active trade entry */
export async function createActiveTrade(data: Omit<InsertActiveTrade, "id" | "createdAt" | "updatedAt">): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(activeTrades).values(data as any);
  return (result as any).insertId ?? null;
}

/** Get all open active trades for a user */
export async function getOpenTrades(userId: number): Promise<ActiveTrade[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(activeTrades)
    .where(and(eq(activeTrades.userId, userId), eq(activeTrades.status, "open")))
    .orderBy(desc(activeTrades.createdAt));
}

/** Get all active trades for a user (including closed) */
export async function getAllTrades(userId: number, limit = 50): Promise<ActiveTrade[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(activeTrades)
    .where(eq(activeTrades.userId, userId))
    .orderBy(desc(activeTrades.createdAt))
    .limit(limit);
}

/** Update active trade P&L and last price */
export async function updateTradePrice(tradeId: number, lastPrice: string, pnlPct: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(activeTrades)
    .set({ lastPrice, currentPnlPct: pnlPct, lastCheckedAt: new Date() })
    .where(eq(activeTrades.id, tradeId));
}

/** Close an active trade */
export async function closeTrade(tradeId: number, status: "closed_tp" | "closed_sl" | "closed_manual" | "expired", closedPrice: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(activeTrades)
    .set({ status, closedPrice, closedAt: new Date() })
    .where(eq(activeTrades.id, tradeId));
}

/** Mark trade as SL warned */
export async function markTradeSlWarned(tradeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(activeTrades)
    .set({ slWarned: 1, warningsSent: 1 })
    .where(eq(activeTrades.id, tradeId));
}

/** Get all open trades across all users (for background monitoring) */
export async function getAllOpenTrades(): Promise<ActiveTrade[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(activeTrades)
    .where(eq(activeTrades.status, "open"));
}

/** Get a single trade by ID */
export async function getTradeById(tradeId: number): Promise<ActiveTrade | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(activeTrades)
    .where(eq(activeTrades.id, tradeId))
    .limit(1);
  return rows[0] ?? null;
}

/** Update trade stop loss */
export async function updateTradeSL(tradeId: number, newSL: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(activeTrades)
    .set({ stopLoss: newSL })
    .where(eq(activeTrades.id, tradeId));
}

/** Update trade take profit */
export async function updateTradeTP(tradeId: number, newTP: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(activeTrades)
    .set({ takeProfit: newTP })
    .where(eq(activeTrades.id, tradeId));
}

// ─── Telegram Settings ──────────────────────────────────────────────────────────

/** Get Telegram settings for a user */
export async function getTelegramSettings(userId: number): Promise<TelegramSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(telegramSettings)
    .where(eq(telegramSettings.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Save or update Telegram settings */
export async function saveTelegramSettings(userId: number, data: Partial<InsertTelegramSetting>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getTelegramSettings(userId);
  if (existing) {
    await db.update(telegramSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(telegramSettings.id, existing.id));
  } else {
    await db.insert(telegramSettings).values({ userId, chatId: data.chatId ?? "", ...data } as any);
  }
}

/** Get Telegram settings by chat ID (for bot webhook) */
export async function getTelegramSettingsByChatId(chatId: string): Promise<TelegramSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select()
    .from(telegramSettings)
    .where(eq(telegramSettings.chatId, chatId))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all active Telegram settings (for broadcast) */
export async function getActiveTelegramUsers(): Promise<TelegramSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(telegramSettings)
    .where(and(eq(telegramSettings.isActive, 1), eq(telegramSettings.isVerified, 1)));
}

/** Record a successfully delivered high-confidence Telegram alert for rate limiting. */
export async function markTelegramHighConfAlertSent(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(telegramSettings)
    .set({ lastHighConfAlertAt: new Date(), updatedAt: new Date() })
    .where(eq(telegramSettings.userId, userId));
}

// ─── Market Alerts ──────────────────────────────────────────────────────────────

/** Save a market alert */
export async function saveMarketAlert(data: Omit<InsertMarketAlert, "id" | "createdAt">): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(marketAlerts).values(data as any);
  return (result as any).insertId ?? null;
}

/** Get active market alerts */
export async function getActiveMarketAlerts(): Promise<MarketAlert[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(marketAlerts)
    .where(eq(marketAlerts.isActive, 1))
    .orderBy(desc(marketAlerts.createdAt))
    .limit(20);
}

/** Expire old market alerts */
export async function expireOldAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(marketAlerts)
    .set({ isActive: 0 })
    .where(and(
      eq(marketAlerts.isActive, 1),
      lte(marketAlerts.expiresAt, new Date())
    ));
}


// ─── Discovered Gems Helpers ─────────────────────────────────────────────────

/** Get the latest batch of discovered gems */
export async function getLatestGemBatch(): Promise<{ gems: DiscoveredGem[]; batchId: string | null; scannedAt: Date | null }> {
  const db = await getDb();
  if (!db) return { gems: [], batchId: null, scannedAt: null };
  
  // Get the most recent gem to find the latest batchId
  const latest = await db.select().from(discoveredGems)
    .orderBy(desc(discoveredGems.scannedAt))
    .limit(1);
  
  if (!latest[0]) return { gems: [], batchId: null, scannedAt: null };
  
  const batchId = latest[0].batchId;
  const gems = await db.select().from(discoveredGems)
    .where(eq(discoveredGems.batchId, batchId))
    .orderBy(desc(discoveredGems.gemScore));
  
  return { gems, batchId, scannedAt: latest[0].scannedAt };
}

/** Get gem batch history (unique batches with counts) */
export async function getGemBatchHistory(limit: number = 10): Promise<Array<{ batchId: string; scannedAt: Date; count: number; topGem: string }>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get all recent gems ordered by time
  const recentGems = await db.select().from(discoveredGems)
    .orderBy(desc(discoveredGems.scannedAt))
    .limit(limit * 20); // Fetch enough to cover N batches
  
  // Group by batchId
  const batches = new Map<string, { scannedAt: Date; count: number; topGem: string }>();
  for (const gem of recentGems) {
    if (!batches.has(gem.batchId)) {
      batches.set(gem.batchId, { scannedAt: gem.scannedAt, count: 0, topGem: gem.symbol });
    }
    batches.get(gem.batchId)!.count++;
  }
  
  return Array.from(batches.entries())
    .slice(0, limit)
    .map(([batchId, data]) => ({ batchId, ...data }));
}

/** Get or create gem scan settings for a user */
export async function getGemScanSettings(userId: number): Promise<GemScanSetting | null> {
  const db = await getDb();
  if (!db) return null;
  
  const rows = await db.select().from(gemScanSettings)
    .where(eq(gemScanSettings.userId, userId))
    .limit(1);
  
  return rows[0] || null;
}

/** Toggle gem scanning on/off */
export async function toggleGemScanning(userId: number, enabled: boolean): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };
  
  const existing = await db.select().from(gemScanSettings)
    .where(eq(gemScanSettings.userId, userId))
    .limit(1);
  
  if (existing[0]) {
    await db.update(gemScanSettings)
      .set({ isEnabled: enabled ? 1 : 0 })
      .where(eq(gemScanSettings.userId, userId));
  } else {
    await db.insert(gemScanSettings).values({
      userId,
      isEnabled: enabled ? 1 : 0,
      scanIntervalMinutes: 60,
    });
  }
  
  return { success: true };
}

/** Save gem alert preferences for a user (upsert) */
export async function saveGemAlertPreferences(userId: number, prefs: {
  minConfidence: number;
  enableEmail: number;
  enableTelegram: number;
  enableBrowser: number;
  notifyEmail: string | null;
  telegramChatId: string | null;
  scanIntervalMinutes: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db.select().from(gemScanSettings)
    .where(eq(gemScanSettings.userId, userId))
    .limit(1);

  if (existing[0]) {
    await db.update(gemScanSettings)
      .set({
        minConfidence: prefs.minConfidence,
        enableEmail: prefs.enableEmail,
        enableTelegram: prefs.enableTelegram,
        enableBrowser: prefs.enableBrowser,
        notifyEmail: prefs.notifyEmail,
        telegramChatId: prefs.telegramChatId,
        scanIntervalMinutes: prefs.scanIntervalMinutes,
      })
      .where(eq(gemScanSettings.userId, userId));
  } else {
    await db.insert(gemScanSettings).values({
      userId,
      isEnabled: 1,
      minConfidence: prefs.minConfidence,
      enableEmail: prefs.enableEmail,
      enableTelegram: prefs.enableTelegram,
      enableBrowser: prefs.enableBrowser,
      notifyEmail: prefs.notifyEmail,
      telegramChatId: prefs.telegramChatId,
      scanIntervalMinutes: prefs.scanIntervalMinutes,
    });
  }
}


// ─── Auto Trader Helpers ──────────────────────────────────────────────────────

/** Get auto-trader settings for a user (by string userId/openId) */
export async function getAutoTraderSettings(userId: string): Promise<AutoTraderSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(autoTraderSettings).where(eq(autoTraderSettings.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/** Get all settings explicitly marked active so persistent worker recovery can resume them. */
export async function getActiveAutoTraderSettings(): Promise<AutoTraderSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(autoTraderSettings).where(eq(autoTraderSettings.isActive, true));
}

/** Resolve a recovery callback strictly through its platform-issued task UID. */
export async function getAutoTraderSettingsByRecoveryTaskUid(taskUid: string): Promise<AutoTraderSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(autoTraderSettings)
    .where(eq(autoTraderSettings.recoveryTaskUid, taskUid))
    .limit(1);
  return rows[0] ?? null;
}

/** Save or update auto-trader settings */
export async function saveAutoTraderSettings(userId: string, data: Partial<InsertAutoTraderSetting>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getAutoTraderSettings(userId);
  if (existing) {
    await db.update(autoTraderSettings).set({ ...data, updatedAt: new Date() }).where(eq(autoTraderSettings.id, existing.id));
  } else {
    await db.insert(autoTraderSettings).values({ userId, ...data } as any);
  }
}

/** Update auto-trader status fields (for the running loop) */
export async function updateAutoTraderStatus(userId: string, status: {
  currentStatus?: string;
  currentSymbol?: string | null;
  currentDirection?: string | null;
  currentEntryPrice?: string | null;
  tradesToday?: number;
  lastTradeClosedAt?: Date | null;
  dailyPnl?: string;
  totalPnl?: string;
  isActive?: boolean;
  lastScanAt?: Date | null;
  lastScanSymbol?: string | null;
  lastScanCount?: number | null;
  lastDeepScanCount?: number | null;
  lastUnavailableCount?: number | null;
  lastAvailableBalance?: string | null;
  lastCalculatedMargin?: string | null;
  lastScanBest?: string | null;
  recoveryTaskUid?: string | null;
  workerHeartbeatAt?: Date | null;
  lastWorkerError?: string | null;
  lastRecoveryAt?: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(autoTraderSettings).set({ ...status, updatedAt: new Date() } as any).where(eq(autoTraderSettings.userId, userId));
}

/** Log an auto-trade to history */
export async function logAutoTrade(trade: InsertAutoTraderHistory): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(autoTraderHistory).values(trade);
  return (result as any)[0]?.insertId ?? null;
}

/** Update an auto-trade history entry (on close) */
export async function closeAutoTrade(tradeId: number, data: {
  exitPrice: string;
  pnl: string;
  outcome: string;
  durationSeconds: number;
  closedAt: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(autoTraderHistory).set(data as any).where(eq(autoTraderHistory.id, tradeId));
}

/** Persist only an already exchange-verified, tighter trailing stop. */
export async function updateAutoTradeTrailingStop(tradeId: number, stopLoss: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(autoTraderHistory).set({
    stopLoss,
    trailingStopActive: true,
    trailingStopUpdatedAt: new Date(),
  } as any).where(eq(autoTraderHistory.id, tradeId));
}

/** Get recent auto-trade history for a user */
export async function getAutoTraderHistory(userId: string, limit = 20): Promise<AutoTraderHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(autoTraderHistory)
    .where(eq(autoTraderHistory.userId, userId))
    .orderBy(desc(autoTraderHistory.openedAt))
    .limit(limit);
}

/** Get today's auto-trade count for a user */
export async function getAutoTraderTodayCount(userId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await db.select().from(autoTraderHistory)
    .where(and(eq(autoTraderHistory.userId, userId), gte(autoTraderHistory.openedAt, today)));
  return rows.length;
}

/** Get open auto-trades for a user */
export async function getOpenAutoTrades(userId: string): Promise<AutoTraderHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(autoTraderHistory)
    .where(and(eq(autoTraderHistory.userId, userId), eq(autoTraderHistory.outcome, "open")));
}
