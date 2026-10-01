import { bigint, boolean, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Signal History table for tracking AI-generated trading signals and their outcomes.
 * Used for performance verification and continuous learning.
 */
export const signalHistory = mysqlTable("signalHistory", {
  id: int("id").autoincrement().primaryKey(),
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Signal direction: LONG or SHORT */
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  /** Strategy that generated this signal */
  strategy: varchar("strategy", { length: 64 }).notNull(),
  /** Entry price at signal generation */
  entryPrice: text("entryPrice").notNull(),
  /** Stop loss price */
  stopLoss: text("stopLoss").notNull(),
  /** Take profit target */
  takeProfit: text("takeProfit").notNull(),
  /** AI confidence score (0-100) */
  confidence: int("confidence").notNull(),
  /** Risk/reward ratio */
  riskRewardRatio: text("riskRewardRatio"),
  /** Signal generation timestamp */
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  /** Signal expiry timestamp (validity window) */
  expiresAt: timestamp("expiresAt"),
  /** Outcome status: pending, hit_tp, hit_sl, expired */
  outcome: mysqlEnum("outcome", ["pending", "hit_tp", "hit_sl", "expired"]).default("pending").notNull(),
  /** Timestamp when outcome was determined */
  outcomeAt: timestamp("outcomeAt"),
  /** Actual price at which TP/SL was hit (if applicable) */
  actualExitPrice: text("actualExitPrice"),
  /** Additional metadata (JSON string) */
  metadata: text("metadata"),
  /** Whether the user manually confirmed they took this trade (0=no, 1=yes) */
  tradeTaken: int("tradeTaken").default(0).notNull(),
  /** Timestamp when user confirmed trade taken */
  tradeTakenAt: timestamp("tradeTakenAt"),
  /** Exchange where trade was taken (e.g. 'binance', 'bybit', 'manual') */
  tradeTakenExchange: varchar("tradeTakenExchange", { length: 32 }),
  /** Whether the trade was auto-verified against exchange positions (0=no, 1=yes) */
  tradeVerified: int("tradeVerified").default(0).notNull(),
});

export type SignalHistory = typeof signalHistory.$inferSelect;
export type InsertSignalHistory = typeof signalHistory.$inferInsert;

/**
 * Private, versioned observations used to measure evidence-score calibration.
 * These rows are shadow data only and never authorize or size a live order.
 */
export const signalCalibrationObservations = mysqlTable("signalCalibrationObservations", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  observationKey: varchar("observationKey", { length: 128 }).notNull(),
  modelVersion: varchar("modelVersion", { length: 64 }).notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  timeframe: varchar("timeframe", { length: 16 }).default("5m+1m").notNull(),
  evidenceScore: int("evidenceScore").notNull(),
  technicalScore: int("technicalScore").notNull(),
  microstructureScore: int("microstructureScore").notNull(),
  entryQuality: varchar("entryQuality", { length: 8 }).notNull(),
  directionsAgree: boolean("directionsAgree").default(false).notNull(),
  executionEligible: boolean("executionEligible").default(false).notNull(),
  entryPrice: varchar("entryPrice", { length: 32 }).notNull(),
  takeProfit: varchar("takeProfit", { length: 32 }).notNull(),
  stopLoss: varchar("stopLoss", { length: 32 }).notNull(),
  outcome: mysqlEnum("outcome", ["pending", "hit_tp", "hit_sl", "expired", "ambiguous"]).default("pending").notNull(),
  actualExitPrice: varchar("actualExitPrice", { length: 32 }),
  observedAt: timestamp("observedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  checkCount: int("checkCount").default(0).notNull(),
  outcomeAt: timestamp("outcomeAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("signalCalibration_user_observation_unique").on(table.userId, table.observationKey),
]);

export type SignalCalibrationObservation = typeof signalCalibrationObservations.$inferSelect;
export type InsertSignalCalibrationObservation = typeof signalCalibrationObservations.$inferInsert;

/**
 * Feedback Outbox table — stores each verified TP/SL outcome before it is sent
 * to the external continuous-learning backend. The unique signal key makes
 * queued delivery idempotent across verifier retries and backend outages.
 */
export const feedbackOutbox = mysqlTable("feedbackOutbox", {
  id: int("id").autoincrement().primaryKey(),
  signalId: int("signalId").notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  entryPrice: text("entryPrice").notNull(),
  exitPrice: text("exitPrice").notNull(),
  outcome: mysqlEnum("outcome", ["win", "loss"]).notNull(),
  confidence: int("confidence").notNull(),
  strategy: varchar("strategy", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "delivered"]).default("pending").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  /** Earliest retry time after a failed backend delivery attempt. */
  nextAttemptAt: timestamp("nextAttemptAt"),
  deliveredAt: timestamp("deliveredAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("feedbackOutbox_signal_unique").on(table.signalId)]);

export type FeedbackOutboxItem = typeof feedbackOutbox.$inferSelect;
export type InsertFeedbackOutboxItem = typeof feedbackOutbox.$inferInsert;

/**
 * Notifications table for real-time user alerts
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  /** Type of notification */
  type: mysqlEnum("type", ["signal_verified", "signal_hit_tp", "signal_hit_sl", "signal_expired", "system"]).notNull(),
  /** Notification title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Notification message */
  message: text("message").notNull(),
  /** Reference to signal (if applicable) */
  signalId: int("signalId"),
  /** Whether notification has been read */
  isRead: int("isRead").default(0).notNull(), // 0 = unread, 1 = read
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Additional metadata (JSON string) */
  metadata: text("metadata"),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Notification Preferences table for user notification settings
 */
export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (if user-specific preferences, null for global) */
  userId: int("userId"),
  /** Email address for email notifications */
  email: varchar("email", { length: 320 }),
  /** Phone number for SMS notifications */
  phone: varchar("phone", { length: 20 }),
  /** Enable browser notifications */
  enableBrowser: int("enableBrowser").default(1).notNull(),
  /** Enable email notifications */
  enableEmail: int("enableEmail").default(0).notNull(),
  /** Enable SMS notifications */
  enableSMS: int("enableSMS").default(0).notNull(),
  /** Enable signal_hit_tp notifications */
  notifyHitTP: int("notifyHitTP").default(1).notNull(),
  /** Enable signal_hit_sl notifications */
  notifyHitSL: int("notifyHitSL").default(1).notNull(),
  /** Enable signal_expired notifications */
  notifyExpired: int("notifyExpired").default(0).notNull(),
  /** Enable signal_verified notifications */
  notifyVerified: int("notifyVerified").default(1).notNull(),
  /** Enable market condition update notifications */
  notifyMarketUpdates: int("notifyMarketUpdates").default(1).notNull(),
  /** Enable system notifications */
  notifySystem: int("notifySystem").default(1).notNull(),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferences.$inferInsert;

/**
 * Confidence History table for tracking AI confidence trends over time.
 * Records daily snapshots of signal accuracy and win rates for visualization.
 */
export const confidenceHistory = mysqlTable("confidenceHistory", {
  id: int("id").autoincrement().primaryKey(),
  /** Date of this snapshot (YYYY-MM-DD) */
  date: varchar("date", { length: 10 }).notNull(),
  /** Average confidence score for signals generated on this date */
  avgConfidence: int("avgConfidence").notNull(),
  /** Total number of signals generated on this date */
  totalSignals: int("totalSignals").notNull(),
  /** Number of signals that hit TP */
  hitTP: int("hitTP").default(0).notNull(),
  /** Number of signals that hit SL */
  hitSL: int("hitSL").default(0).notNull(),
  /** Number of signals that expired */
  expired: int("expired").default(0).notNull(),
  /** Win rate percentage (hitTP / (hitTP + hitSL) * 100) */
  winRate: int("winRate").default(0).notNull(),
  /** Backend patterns count at time of snapshot */
  backendPatterns: int("backendPatterns").default(0).notNull(),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("confidenceHistory_date_unique").on(table.date)]);

export type ConfidenceHistory = typeof confidenceHistory.$inferSelect;
export type InsertConfidenceHistory = typeof confidenceHistory.$inferInsert;

/**
 * Binance API Keys table for storing user Binance Futures API credentials.
 * Keys are stored encrypted. Used for live position tracking and order execution.
 */
export const binanceApiKeys = mysqlTable("binanceApiKeys", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Binance API key (stored encrypted) */
  apiKey: text("apiKey").notNull(),
  /** Binance API secret (stored encrypted) */
  apiSecret: text("apiSecret").notNull(),
  /** User-defined label for this key pair */
  label: varchar("label", { length: 64 }).default("My Binance API"),
  /** Whether this key is currently active */
  isActive: int("isActive").default(1).notNull(),
  /** Testnet or mainnet */
  isTestnet: int("isTestnet").default(0).notNull(),
  /** Last verified timestamp */
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BinanceApiKey = typeof binanceApiKeys.$inferSelect;
export type InsertBinanceApiKey = typeof binanceApiKeys.$inferInsert;

/**
 * CEX API Keys table — stores Bybit and OKX Futures API credentials.
 * Keys are stored encrypted. Used for live position tracking and order execution.
 * (Binance uses the legacy binanceApiKeys table; Bybit/OKX use this table.)
 */
export const cexApiKeys = mysqlTable("cexApiKeys", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Exchange identifier: 'bybit' | 'okx' */
  exchange: varchar("exchange", { length: 16 }).notNull(),
  /** API key (stored encrypted) */
  apiKey: text("apiKey").notNull(),
  /** API secret (stored encrypted) */
  apiSecret: text("apiSecret").notNull(),
  /** OKX passphrase (required for OKX only) */
  passphrase: text("passphrase"),
  /** User-defined label */
  label: varchar("label", { length: 64 }).default("My API Key"),
  /** Whether this key is currently active */
  isActive: int("isActive").default(1).notNull(),
  /** Testnet or mainnet */
  isTestnet: int("isTestnet").default(0).notNull(),
  /** Last verified timestamp */
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  /** Last verified available balance, written only after a successful authenticated balance check */
  lastVerifiedAvailableBalance: text("lastVerifiedAvailableBalance"),
  /** Last verified total account balance, written only after a successful authenticated balance check */
  lastVerifiedTotalBalance: text("lastVerifiedTotalBalance"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CexApiKey = typeof cexApiKeys.$inferSelect;
export type InsertCexApiKey = typeof cexApiKeys.$inferInsert;

/**
 * Private normalized exchange fills used to rebuild a single user's inverse patterns.
 * Raw exchange payloads and credentials are intentionally not stored here.
 */
export const exchangeTradeFills = mysqlTable("exchangeTradeFills", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  exchange: varchar("exchange", { length: 16 }).notNull(),
  /** One-way fingerprint of the exchange account/connection; never a credential. */
  sourceAccountHash: varchar("sourceAccountHash", { length: 64 }).notNull(),
  externalFillId: varchar("externalFillId", { length: 128 }).notNull(),
  externalOrderId: varchar("externalOrderId", { length: 128 }),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  side: mysqlEnum("side", ["BUY", "SELL"]).notNull(),
  positionSide: varchar("positionSide", { length: 16 }),
  positionEffect: mysqlEnum("positionEffect", ["OPEN", "CLOSE", "UNKNOWN"]).default("UNKNOWN").notNull(),
  price: text("price").notNull(),
  quantity: text("quantity").notNull(),
  fee: text("fee"),
  feeAsset: varchar("feeAsset", { length: 16 }),
  realizedPnl: text("realizedPnl"),
  /** Exchange-provided Unix epoch milliseconds. */
  executedAtMs: bigint("executedAtMs", { mode: "number" }).notNull(),
  /** Only deterministic closing outcomes with known realized PnL enter learning. */
  eligibleForLearning: int("eligibleForLearning").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("exchangeTradeFills_user_exchange_account_fill_unique").on(
    table.userId,
    table.exchange,
    table.sourceAccountHash,
    table.externalFillId,
  ),
]);

export type ExchangeTradeFill = typeof exchangeTradeFills.$inferSelect;
export type InsertExchangeTradeFill = typeof exchangeTradeFills.$inferInsert;

/**
 * Per-user import status for the selected one-time-after-verification/manual-refresh model.
 */
export const exchangeHistorySyncState = mysqlTable("exchangeHistorySyncState", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  exchange: varchar("exchange", { length: 16 }).notNull(),
  sourceAccountHash: varchar("sourceAccountHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["never", "running", "complete", "partial", "failed"]).default("never").notNull(),
  cursor: text("cursor"),
  rowsFetched: int("rowsFetched").default(0).notNull(),
  rowsInserted: int("rowsInserted").default(0).notNull(),
  eligibleOutcomes: int("eligibleOutcomes").default(0).notNull(),
  earliestImportedAtMs: bigint("earliestImportedAtMs", { mode: "number" }),
  latestImportedAtMs: bigint("latestImportedAtMs", { mode: "number" }),
  retentionNote: text("retentionNote"),
  lastError: text("lastError"),
  lastAttemptAt: timestamp("lastAttemptAt"),
  lastSuccessAt: timestamp("lastSuccessAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("exchangeHistorySyncState_user_exchange_account_unique").on(
    table.userId,
    table.exchange,
    table.sourceAccountHash,
  ),
]);

export type ExchangeHistorySyncState = typeof exchangeHistorySyncState.$inferSelect;
export type InsertExchangeHistorySyncState = typeof exchangeHistorySyncState.$inferInsert;

/**
 * Gem Watchlist table for persisting user-saved gems across sessions.
 */
export const gemWatchlist = mysqlTable("gemWatchlist", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Trading pair symbol (e.g., "BTC/USDT") */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Exchange where gem was found */
  exchange: varchar("exchange", { length: 32 }).notNull(),
  /** Risk level when added */
  riskLevel: mysqlEnum("riskLevel", ["VERY_HIGH", "HIGH", "MEDIUM", "LOW"]).notNull(),
  /** Gem score when added */
  gemScore: int("gemScore").notNull(),
  /** Whether to send alerts for this gem */
  alertEnabled: int("alertEnabled").default(0).notNull(),
  /** Price when added */
  priceAtAdd: text("priceAtAdd"),
  /** Additional metadata (JSON) */
  metadata: text("metadata"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GemWatchlistItem = typeof gemWatchlist.$inferSelect;
export type InsertGemWatchlistItem = typeof gemWatchlist.$inferInsert;

/**
 * User Inverse Patterns table — persists the failure/bias patterns extracted from a user's
 * uploaded trade history CSV. Patterns are re-applied automatically on every login so the
 * InverseIQ signal engine can personalise confidence scores without requiring a re-upload.
 */
export const userPatterns = mysqlTable("userPatterns", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Provenance keeps manual CSV and connected-exchange learning isolated. */
  source: varchar("source", { length: 16 }).default("manual").notNull(),
  /** Pattern type from InverseEngine */
  patternType: mysqlEnum("patternType", ["LONG_FAILURE", "SHORT_FAILURE", "FOMO_ENTRY", "PANIC_SELL"]).notNull(),
  /** Confidence score for this pattern (0-100) */
  confidence: int("confidence").notNull(),
  /** Human-readable description of the pattern */
  description: text("description").notNull(),
  /** Recommended action: INVERT_LONG | INVERT_SHORT | WAIT */
  action: varchar("action", { length: 32 }).notNull(),
  /** Number of trades analysed to derive this pattern */
  tradeCount: int("tradeCount").default(0).notNull(),
  /** Total wins in the uploaded history */
  totalWins: int("totalWins").default(0).notNull(),
  /** Total losses in the uploaded history */
  totalLosses: int("totalLosses").default(0).notNull(),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Last updated timestamp (re-upload overwrites) */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPattern = typeof userPatterns.$inferSelect;
export type InsertUserPattern = typeof userPatterns.$inferInsert;

/**
 * User Symbol Patterns table — persists per-pair performance statistics extracted
 * from the user's uploaded trade history. Used to boost or suppress AI signal
 * confidence on a symbol-by-symbol basis (e.g. "user wins 72% of BTCUSDT trades").
 */
export const userSymbolPatterns = mysqlTable("userSymbolPatterns", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Provenance keeps manual CSV and connected-exchange learning isolated. */
  source: varchar("source", { length: 16 }).default("manual").notNull(),
  /** Normalised symbol, e.g. BTCUSDT */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Total trades on this pair */
  tradeCount: int("tradeCount").default(0).notNull(),
  /** Winning trades */
  wins: int("wins").default(0).notNull(),
  /** Losing trades */
  losses: int("losses").default(0).notNull(),
  /** Win rate 0-100 */
  winRate: int("winRate").default(0).notNull(),
  /** Average PnL per trade in USDT (stored as integer cents to avoid float issues) */
  avgPnlCents: int("avgPnlCents").default(0).notNull(),
  /** Total realised PnL in USDT cents */
  totalPnlCents: int("totalPnlCents").default(0).notNull(),
  /** Dominant side: BUY | SELL | MIXED */
  dominantSide: varchar("dominantSide", { length: 8 }).default("MIXED").notNull(),
  /** Directional bias: LONG_BIAS | SHORT_BIAS | NEUTRAL */
  bias: varchar("bias", { length: 16 }).default("NEUTRAL").notNull(),
  /** Confidence adjustment delta (-25 to +25) */
  confidenceAdjustment: int("confidenceAdjustment").default(0).notNull(),
  /** Recommended action: BOOST | SUPPRESS | NEUTRAL */
  action: varchar("action", { length: 16 }).default("NEUTRAL").notNull(),
  /** Human-readable summary for UI and LLM injection */
  summary: text("summary").notNull(),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Last updated timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSymbolPattern = typeof userSymbolPatterns.$inferSelect;
export type InsertUserSymbolPattern = typeof userSymbolPatterns.$inferInsert;

/**
 * Hyperliquid Keys table — stores the user's Hyperliquid wallet private key
 * (AES-256 encrypted at rest) for programmatic EIP-712 order signing.
 * No API key/secret needed — Hyperliquid authenticates via wallet signature.
 */
export const hyperliquidKeys = mysqlTable("hyperliquidKeys", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Encrypted private key (AES-256-CBC, hex-encoded IV:ciphertext) */
  encryptedPrivateKey: text("encryptedPrivateKey").notNull(),
  /** Derived wallet address (lowercase, for display and verification) */
  walletAddress: varchar("walletAddress", { length: 42 }).notNull(),
  /** User-defined label */
  label: varchar("label", { length: 64 }).default("My Hyperliquid Wallet"),
  /** Whether this key is currently active */
  isActive: int("isActive").default(1).notNull(),
  /** Last verified timestamp */
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HyperliquidKey = typeof hyperliquidKeys.$inferSelect;
export type InsertHyperliquidKey = typeof hyperliquidKeys.$inferInsert;

/**
 * Scan History table — persists each FuturesScanner result (single-coin and best-coin scans).
 * Allows users to review past scans and track how verdicts played out.
 */
export const scanHistory = mysqlTable("scanHistory", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Scan type: 'single' for scanCoin, 'best' for bestCoinNow */
  scanType: mysqlEnum("scanType", ["single", "best"]).default("single").notNull(),
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** AI verdict direction: LONG or SHORT */
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  /** Confidence level: HIGH | MEDIUM | LOW */
  confidence: varchar("confidence", { length: 8 }).notNull(),
  /** Entry price at scan time */
  entryPrice: text("entryPrice"),
  /** Take profit 1 */
  tp1: text("tp1"),
  /** Take profit 2 */
  tp2: text("tp2"),
  /** Stop loss */
  sl: text("sl"),
  /** Risk/reward ratio */
  riskReward: text("riskReward"),
  /** Whether this was flagged as a bad entry point */
  isBadEntry: int("isBadEntry").default(0).notNull(),
  /** Current price at scan time */
  currentPrice: text("currentPrice"),
  /** Full AI analysis text */
  analysis: text("analysis"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScanHistoryItem = typeof scanHistory.$inferSelect;
export type InsertScanHistoryItem = typeof scanHistory.$inferInsert;

/**
 * Prediction History table — persists each TradePredictor result.
 * Allows users to review past direction predictions.
 */
export const predictionHistory = mysqlTable("predictionHistory", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Trading pair symbol */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Position side: long or short */
  side: mysqlEnum("side", ["long", "short"]).notNull(),
  /** Entry price */
  entryPrice: text("entryPrice").notNull(),
  /** Leverage */
  leverage: int("leverage").default(1).notNull(),
  /** AI verdict: UP | DOWN | UNKNOWN */
  verdict: varchar("verdict", { length: 8 }).notNull(),
  /** Probability 0-100 */
  probability: int("probability").default(0).notNull(),
  /** Confidence level: HIGH | MEDIUM | LOW */
  confidence: varchar("confidence", { length: 8 }).notNull(),
  /** Key reason from LLM */
  keyReason: text("keyReason"),
  /** Suggested action: HOLD | ADD | REDUCE | EXIT */
  suggestedAction: varchar("suggestedAction", { length: 16 }),
  /** Current price at prediction time */
  currentPrice: text("currentPrice"),
  /** PnL percentage at prediction time */
  pnlPct: text("pnlPct"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PredictionHistoryItem = typeof predictionHistory.$inferSelect;
export type InsertPredictionHistoryItem = typeof predictionHistory.$inferInsert;

/**
 * Active Trades table — tracks trades the user has manually marked as "I took this trade".
 * Stores live P&L status and triggers alerts when trade moves against user.
 */
export const activeTrades = mysqlTable("activeTrades", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Reference to the signal that generated this trade (optional) */
  signalId: int("signalId"),
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Trade direction: LONG or SHORT */
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  /** Entry price */
  entryPrice: text("entryPrice").notNull(),
  /** Take profit target */
  takeProfit: text("takeProfit").notNull(),
  /** Stop loss level */
  stopLoss: text("stopLoss").notNull(),
  /** Optional TP2 */
  takeProfit2: text("takeProfit2"),
  /** Exchange where trade was taken */
  exchange: varchar("exchange", { length: 32 }),
  /** Trade status: open, closed_tp, closed_sl, closed_manual, expired */
  status: mysqlEnum("status", ["open", "closed_tp", "closed_sl", "closed_manual", "expired"]).default("open").notNull(),
  /** Current P&L percentage (updated periodically) */
  currentPnlPct: text("currentPnlPct"),
  /** Current price (last checked) */
  lastPrice: text("lastPrice"),
  /** Last time the trade was checked/updated */
  lastCheckedAt: timestamp("lastCheckedAt"),
  /** Number of warnings sent for this trade */
  warningsSent: int("warningsSent").default(0).notNull(),
  /** Whether user has been warned about SL proximity */
  slWarned: int("slWarned").default(0).notNull(),
  /** Closed price (when trade is closed) */
  closedPrice: text("closedPrice"),
  /** Closed at timestamp */
  closedAt: timestamp("closedAt"),
  /** Creation timestamp (when user marked the trade) */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ActiveTrade = typeof activeTrades.$inferSelect;
export type InsertActiveTrade = typeof activeTrades.$inferInsert;

/**
 * Telegram Settings table — stores user's Telegram chat ID for receiving trade alerts.
 * Users connect via a Telegram bot link and verify with a code.
 */
export const telegramSettings = mysqlTable("telegramSettings", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (references users.id) */
  userId: int("userId").notNull(),
  /** Telegram chat ID (numeric, from bot interaction) */
  chatId: varchar("chatId", { length: 32 }).notNull(),
  /** Telegram username (optional, for display) */
  username: varchar("username", { length: 64 }),
  /** Whether Telegram alerts are enabled */
  isActive: int("isActive").default(1).notNull(),
  /** Alert on trade going against user (approaching SL) */
  alertOnSlApproach: int("alertOnSlApproach").default(1).notNull(),
  /** Alert on TP hit */
  alertOnTpHit: int("alertOnTpHit").default(1).notNull(),
  /** Alert on market warnings (big sell-offs, volatility spikes) */
  alertOnMarketWarning: int("alertOnMarketWarning").default(1).notNull(),
  /** Alert on new high-confidence signals */
  alertOnHighConfSignal: int("alertOnHighConfSignal").default(0).notNull(),
  /** Minimum signal confidence required for Telegram high-confidence alerts */
  highConfMinConfidence: int("highConfMinConfidence").default(95).notNull(),
  /** Minimum minutes between high-confidence Telegram alerts (5, 15, 30, or 60) */
  highConfAlertIntervalMinutes: int("highConfAlertIntervalMinutes").default(5).notNull(),
  /** Timestamp of the most recently delivered high-confidence Telegram alert */
  lastHighConfAlertAt: timestamp("lastHighConfAlertAt"),
  /** Alert on new gem discoveries */
  alertOnGems: int("alertOnGems").default(1).notNull(),
  /** Verification code (used during linking) */
  verificationCode: varchar("verificationCode", { length: 16 }),
  /** Whether the account is verified */
  isVerified: int("isVerified").default(0).notNull(),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Update timestamp */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TelegramSetting = typeof telegramSettings.$inferSelect;
export type InsertTelegramSetting = typeof telegramSettings.$inferInsert;

/**
 * Market Alerts table — stores market-wide warnings (flash crashes, volatility spikes, etc.)
 * Generated automatically by the market monitor and displayed to all users.
 */
export const marketAlerts = mysqlTable("marketAlerts", {
  id: int("id").autoincrement().primaryKey(),
  /** Alert type */
  alertType: mysqlEnum("alertType", ["flash_crash", "volatility_spike", "funding_extreme", "liquidation_cascade", "whale_movement"]).notNull(),
  /** Severity: low, medium, high, critical */
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  /** Alert title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Alert message / description */
  message: text("message").notNull(),
  /** Affected symbols (comma-separated) */
  affectedSymbols: text("affectedSymbols"),
  /** Whether this alert is still active */
  isActive: int("isActive").default(1).notNull(),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Expiry timestamp */
  expiresAt: timestamp("expiresAt"),
});

export type MarketAlert = typeof marketAlerts.$inferSelect;
export type InsertMarketAlert = typeof marketAlerts.$inferInsert;


/**
 * Discovered Gems table — stores gems found by the periodic background scanner.
 * Each scan batch gets a unique batchId so the frontend can display the latest batch.
 */
export const discoveredGems = mysqlTable("discoveredGems", {
  id: int("id").autoincrement().primaryKey(),
  /** Batch identifier — all gems from one scan share the same batchId */
  batchId: varchar("batchId", { length: 64 }).notNull(),
  /** Trading pair symbol (e.g., "BTC/USDT") */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Exchange where gem was found */
  exchange: varchar("exchange", { length: 32 }).notNull(),
  /** Price at discovery */
  price: text("price").notNull(),
  /** 24h price change percent */
  priceChange24h: text("priceChange24h").notNull(),
  /** 7d price change percent */
  priceChange7d: text("priceChange7d"),
  /** 24h volume in USD */
  volume24h: text("volume24h").notNull(),
  /** Dip depth percent from 7d high */
  dipDepth: text("dipDepth").notNull(),
  /** Recovery momentum score (0-100) */
  recoveryMomentum: int("recoveryMomentum").notNull(),
  /** Volume spike ratio vs 7d avg */
  volumeSpike: text("volumeSpike").notNull(),
  /** Liquidity score (0-100) */
  liquidityScore: int("liquidityScore").notNull(),
  /** Composite gem score (0-100) */
  gemScore: int("gemScore").notNull(),
  /** Risk level */
  riskLevel: mysqlEnum("riskLevel", ["VERY_HIGH", "HIGH", "MEDIUM", "LOW"]).notNull(),
  /** Human-readable reason */
  reason: text("reason").notNull(),
  /** Entry zone low price */
  entryZoneLow: text("entryZoneLow").notNull(),
  /** Entry zone high price */
  entryZoneHigh: text("entryZoneHigh").notNull(),
  /** Target price */
  targetPrice: text("targetPrice").notNull(),
  /** Stop loss price */
  stopLoss: text("stopLoss").notNull(),
  /** Potential gain percent */
  potentialGain: text("potentialGain").notNull(),
  /** Tags (JSON array) */
  tags: text("tags").notNull(),
  /** Whether notification was sent for this gem */
  notificationSent: int("notificationSent").default(0).notNull(),
  /** Scan timestamp */
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
});

export type DiscoveredGem = typeof discoveredGems.$inferSelect;
export type InsertDiscoveredGem = typeof discoveredGems.$inferInsert;

/**
 * Gem scan settings — stores the heartbeat task UID and scan config.
 */
export const gemScanSettings = mysqlTable("gemScanSettings", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (owner) */
  userId: int("userId").notNull(),
  /** Whether continuous scanning is enabled */
  isEnabled: int("isEnabled").default(1).notNull(),
  /** Scan interval in minutes */
  scanIntervalMinutes: int("scanIntervalMinutes").default(60).notNull(),
  /** Minimum confidence threshold (0-100) to trigger alert */
  minConfidence: int("minConfidence").default(80).notNull(),
  /** Enable email notifications */
  enableEmail: int("enableEmail").default(1).notNull(),
  /** Enable Telegram notifications */
  enableTelegram: int("enableTelegram").default(1).notNull(),
  /** Enable browser/push notifications */
  enableBrowser: int("enableBrowser").default(0).notNull(),
  /** User email for notifications (optional override) */
  notifyEmail: varchar("notifyEmail", { length: 320 }),
  /** Heartbeat task UID (for managing the cron job) */
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  /** Telegram chat ID for notifications */
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  /** Last scan timestamp */
  lastScanAt: timestamp("lastScanAt"),
  /** Creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GemScanSetting = typeof gemScanSettings.$inferSelect;
export type InsertGemScanSetting = typeof gemScanSettings.$inferInsert;

/**
 * User Settings table for storing default exchange preferences and alert configurations.
 */
export const userSettings = mysqlTable("userSettings", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (owner) */
  userId: int("userId").notNull().unique(),
  /** Default exchange for trading (binance, bybit, okx, hyperliquid, asterdex) */
  defaultExchange: varchar("defaultExchange", { length: 32 }).default("binance").notNull(),
  /** Default leverage for futures trades */
  defaultLeverage: int("defaultLeverage").default(10).notNull(),
  /** Default position size as percentage of account balance (1-100) */
  defaultPositionSizePct: int("defaultPositionSizePct").default(10).notNull(),
  /** Default order type (market or limit) */
  defaultOrderType: varchar("defaultOrderType", { length: 16 }).default("market").notNull(),
  /** Email address for notifications */
  notifyEmail: varchar("notifyEmail", { length: 320 }),
  /** Telegram chat ID for notifications */
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  /** Enable email notifications globally */
  enableEmail: int("enableEmail").default(1).notNull(),
  /** Enable Telegram notifications globally */
  enableTelegram: int("enableTelegram").default(0).notNull(),
  /** Enable browser push notifications */
  enableBrowserNotifications: int("enableBrowserNotifications").default(1).notNull(),
  /** Futures signal alert threshold (0-100) */
  futuresAlertThreshold: int("futuresAlertThreshold").default(75).notNull(),
  /** Spot gem alert threshold (0-100) */
  spotAlertThreshold: int("spotAlertThreshold").default(80).notNull(),
  /** Auto-close losing positions after X% loss (0 = disabled) */
  autoStopLossPct: int("autoStopLossPct").default(0).notNull(),
  /** Bad entry filter mode: 'hide' = skip bad entries and scan next, 'deprioritize' = show with warning, 'show' = no filter */
  badEntryFilter: varchar("badEntryFilter", { length: 16 }).default("deprioritize").notNull(),
  /** Enable alerts when verified AsterDEX account equity drops below the configured USD floor */
  asterBalanceAlertEnabled: int("asterBalanceAlertEnabled").default(0).notNull(),
  /** AsterDEX account-equity floor in whole USD; 0 disables threshold evaluation */
  asterBalanceAlertFloor: int("asterBalanceAlertFloor").default(0).notNull(),
  /** Last time the AsterDEX balance threshold alert was delivered */
  asterBalanceAlertLastNotifiedAt: timestamp("asterBalanceAlertLastNotifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = typeof userSettings.$inferInsert;

/**
 * ML Model State table for persisting trained model weights and metadata.
 * Used by the self-adaptive ML engine for daily retraining persistence.
 */
export const mlModelState = mysqlTable("mlModelState", {
  id: int("id").autoincrement().primaryKey(),
  /** Model identifier (e.g., "signal_direction_v1") */
  modelId: varchar("modelId", { length: 64 }).notNull(),
  /** Serialized model state (JSON string of tree ensemble weights) */
  modelData: text("modelData").notNull(),
  /** Training accuracy on validation set (0-100) */
  accuracy: int("accuracy").default(0).notNull(),
  /** Number of training samples used */
  trainingSamples: int("trainingSamples").default(0).notNull(),
  /** Feature importance JSON (top features and their scores) */
  featureImportance: text("featureImportance"),
  /** Training window start timestamp */
  trainingWindowStart: timestamp("trainingWindowStart"),
  /** Training window end timestamp */
  trainingWindowEnd: timestamp("trainingWindowEnd"),
  /** When this model was trained */
  trainedAt: timestamp("trainedAt").defaultNow().notNull(),
  /** Model version (increments with each retrain) */
  version: int("version").default(1).notNull(),
});
export type MlModelState = typeof mlModelState.$inferSelect;
export type InsertMlModelState = typeof mlModelState.$inferInsert;


/**
 * Auto Trader Settings — per-user configuration for the automated trading loop.
 * Controls margin, leverage, limits, and activation state.
 */
export const autoTraderSettings = mysqlTable("autoTraderSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  /** Whether the auto-trader loop is currently active */
  isActive: boolean("isActive").default(false).notNull(),
  /** Legacy fixed-dollar field retained for migration compatibility; dynamic mode ignores it. */
  marginPerTrade: int("marginPerTrade").default(50).notNull(),
  /** Percentage of currently available Hyperliquid collateral used for each new entry. */
  marginPercent: int("marginPercent").default(25).notNull(),
  /** Leverage multiplier (1-50) */
  leverage: int("leverage").default(10).notNull(),
  /** Maximum concurrent open positions (1-3) */
  maxConcurrent: int("maxConcurrent").default(1).notNull(),
  /** Maximum trades per day (0 = unlimited) */
  maxDailyTrades: int("maxDailyTrades").default(10).notNull(),
  /** Cooldown between trades in seconds */
  cooldownSeconds: int("cooldownSeconds").default(60).notNull(),
  /** Minimum confidence threshold (0-100) */
  minConfidence: int("minConfidence").default(70).notNull(),
  /** Preferred exchange for execution */
  exchange: varchar("exchange", { length: 32 }).default("hyperliquid").notNull(),
  /** Whether to send Telegram notifications for auto-trade events */
  telegramNotify: boolean("telegramNotify").default(true).notNull(),
  /** Maximum drawdown per trade before force-close (percentage, 0 = disabled) */
  maxDrawdownPct: int("maxDrawdownPct").default(0).notNull(),
  /** Symbols to exclude from scanning (comma-separated) */
  excludeSymbols: text("excludeSymbols"),
  /** Only trade these symbols (comma-separated, empty = all) */
  onlySymbols: text("onlySymbols"),
  /** Current status: idle | scanning | executing | in_position | cooldown | error */
  currentStatus: varchar("currentStatus", { length: 32 }).default("idle").notNull(),
  /** Current active symbol (if in position) */
  currentSymbol: varchar("currentSymbol", { length: 32 }),
  /** Current position direction */
  currentDirection: varchar("currentDirection", { length: 8 }),
  /** Current entry price */
  currentEntryPrice: varchar("currentEntryPrice", { length: 32 }),
  /** Trades executed today */
  tradesToday: int("tradesToday").default(0).notNull(),
  /** Last trade closed at */
  lastTradeClosedAt: timestamp("lastTradeClosedAt"),
  /** Daily P&L in USDC */
  dailyPnl: varchar("dailyPnl", { length: 32 }).default("0"),
  /** Total P&L since activation */
  totalPnl: varchar("totalPnl", { length: 32 }).default("0"),
  /** Timestamp of last completed scan cycle */
  lastScanAt: timestamp("lastScanAt"),
  /** Symbol currently being scanned (or last scanned) */
  lastScanSymbol: varchar("lastScanSymbol", { length: 32 }),
  /** Number of active Hyperliquid pairs considered by the shared market snapshot */
  lastScanCount: int("lastScanCount"),
  /** Number of rate-limit-safe candidates that completed deep candle/order-book analysis */
  lastDeepScanCount: int("lastDeepScanCount"),
  /** Number of selected deep-scan candidates without sufficient venue-native data */
  lastUnavailableCount: int("lastUnavailableCount"),
  /** Available Hyperliquid trading collateral used by the latest dynamic margin decision. */
  lastAvailableBalance: varchar("lastAvailableBalance", { length: 32 }),
  /** Dynamic USDC margin calculated for the latest eligible entry attempt. */
  lastCalculatedMargin: varchar("lastCalculatedMargin", { length: 32 }),
  /** Best signal found in last scan (symbol + confidence) */
  lastScanBest: varchar("lastScanBest", { length: 128 }),
  /** User-owned Heartbeat task used for periodic worker health and recovery checks */
  recoveryTaskUid: varchar("recoveryTaskUid", { length: 65 }),
  /** Last time the real-time worker completed a healthy cycle */
  workerHeartbeatAt: timestamp("workerHeartbeatAt"),
  /** Last worker or recovery failure retained for diagnostics */
  lastWorkerError: varchar("lastWorkerError", { length: 512 }),
  /** Last time the scheduled recovery job reconciled this trader */
  lastRecoveryAt: timestamp("lastRecoveryAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AutoTraderSetting = typeof autoTraderSettings.$inferSelect;
export type InsertAutoTraderSetting = typeof autoTraderSettings.$inferInsert;

/**
 * Auto Trader History — log of all trades executed by the auto-trader.
 */
export const autoTraderHistory = mysqlTable("autoTraderHistory", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  /** Trading pair symbol (e.g. "BTC", "ETH") */
  symbol: varchar("symbol", { length: 32 }).notNull(),
  /** Trade direction */
  direction: varchar("direction", { length: 8 }).notNull(),
  /** Entry price */
  entryPrice: varchar("entryPrice", { length: 32 }).notNull(),
  /** Exit price (null if still open) */
  exitPrice: varchar("exitPrice", { length: 32 }),
  /** Position size in USDC */
  positionSize: varchar("positionSize", { length: 32 }).notNull(),
  /** Margin used */
  marginUsed: varchar("marginUsed", { length: 32 }).notNull(),
  /** Leverage used */
  leverage: int("leverage").notNull(),
  /** Take profit price */
  takeProfit: varchar("takeProfit", { length: 32 }),
  /** Stop loss price */
  stopLoss: varchar("stopLoss", { length: 32 }),
  /** Original stop loss retained as the immutable 1R basis for trailing protection */
  initialStopLoss: varchar("initialStopLoss", { length: 32 }),
  /** Whether a verified server-side trailing-stop update has been applied */
  trailingStopActive: boolean("trailingStopActive").default(false).notNull(),
  /** Most recent verified trailing-stop update time */
  trailingStopUpdatedAt: timestamp("trailingStopUpdatedAt"),
  /** Realized P&L in USDC */
  pnl: varchar("pnl", { length: 32 }),
  /** Outcome: open | tp_hit | sl_hit | manual_close | force_close */
  outcome: varchar("outcome", { length: 32 }).default("open").notNull(),
  /** Duration in seconds */
  durationSeconds: int("durationSeconds"),
  /** Signal confidence that triggered this trade */
  signalConfidence: int("signalConfidence"),
  /** Entry quality grade */
  entryQuality: varchar("entryQuality", { length: 8 }),
  /** Error message if execution failed */
  errorMessage: text("errorMessage"),
  /** Opened at */
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  /** Closed at */
  closedAt: timestamp("closedAt"),
});
export type AutoTraderHistoryRow = typeof autoTraderHistory.$inferSelect;
export type InsertAutoTraderHistory = typeof autoTraderHistory.$inferInsert;
