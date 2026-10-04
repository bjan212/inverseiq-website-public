import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parse as parseCookie } from "cookie";
import * as db from "./db";
import { sendMultiChannelNotification } from "./marketMonitor";
import axios from "axios";
import { ENV } from "./_core/env";
import { fetchSentiment, fetchSentimentBatch } from "./lib/sentimentEngine";
import { computeValiditySeconds } from "./lib/validityTimer";
import { fetchSocialSentiment } from "./lib/socialSentiment";
import { computeVolumeProfile } from "./lib/volumeProfile";
import { getExchangesForSymbol, fetchMultiExchangeUniverse } from "./lib/exchangeUniverse";
import { startAutoTrader, stopAutoTrader, getAutoTraderStatus, isAutoTraderRunning } from "./lib/autoTrader";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { buildBinanceProtectionOrders, buildBybitPositionProtection, buildOkxPositionProtection, validateCexProtection } from "./lib/cexTpsl";
import { normalizeAiStats } from "./aiStatsNormalization";
import { resolveAutoTraderHyperliquidCollateral } from "./lib/hyperliquidBalance";
import { autoTraderStopInputSchema } from "./lib/autoTraderStop";
import { autoTraderStartConfirmationSchema } from "./lib/autoTraderStart";
import { ensureAutoTraderRecoveryTask } from "./lib/autoTraderRecovery";
import { AUTO_TRADER_MARGIN_PERCENT } from "../shared/autoTraderMargin";
import { filterSignalCalibrationRowsByModelVersion, SIGNAL_CALIBRATION_MODEL_VERSION, summarizeSignalCalibration } from "../shared/signalCalibration";
import { PRIVATE_HISTORY_EXCHANGES } from "./lib/exchangeHistoryCore";
import { syncUserExchangeHistory } from "./lib/exchangeHistorySync";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  exchangeHistory: router({
    /** User-triggered idempotent refresh; no recurring background synchronization. */
    refresh: protectedProcedure
      .input(z.object({ exchange: z.enum(PRIVATE_HISTORY_EXCHANGES) }))
      .mutation(async ({ ctx, input }) => {
        return syncUserExchangeHistory(ctx.user!.id, input.exchange);
      }),
    status: protectedProcedure
      .input(z.object({ exchange: z.enum(PRIVATE_HISTORY_EXCHANGES) }))
      .query(async ({ ctx, input }) => {
        const state = await db.getLatestExchangeHistorySyncState(ctx.user!.id, input.exchange);
        if (!state) return null;
        return {
          exchange: state.exchange,
          status: state.status,
          rowsFetched: state.rowsFetched,
          rowsInserted: state.rowsInserted,
          eligibleOutcomes: state.eligibleOutcomes,
          earliestImportedAtMs: state.earliestImportedAtMs,
          latestImportedAtMs: state.latestImportedAtMs,
          retentionNote: state.retentionNote,
          lastError: state.lastError,
          lastAttemptAt: state.lastAttemptAt,
          lastSuccessAt: state.lastSuccessAt,
        };
      }),
  }),

  // Signal History Router
  signals: router({
    /** Save a new signal to history */
    save: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          direction: z.enum(["LONG", "SHORT"]),
          strategy: z.string(),
          entryPrice: z.string(),
          stopLoss: z.string(),
          takeProfit: z.string(),
          confidence: z.number().int().min(0).max(100),
          riskRewardRatio: z.string().optional(),
          expiresAt: z.date().optional(),
          metadata: z.string().optional(),
          entryQualityLabel: z.enum(["A+", "A", "B", "C", "D", "F"]).optional(),
          entryQualityScore: z.number().min(0).max(100).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const existingMetadata = input.metadata ? JSON.parse(input.metadata) : {};
        const metadata = JSON.stringify({ ...existingMetadata, entryQualityLabel: input.entryQualityLabel, entryQualityScore: input.entryQualityScore });
        const { entryQualityLabel, entryQualityScore, ...signalInput } = input;
        const result = await db.saveSignal({ ...signalInput, metadata });
        if (entryQualityLabel) {
          const { notifyQualifiedHighConfidenceSignal } = await import("./lib/telegramBot");
          void notifyQualifiedHighConfidenceSignal({
            symbol: input.symbol, direction: input.direction, entryPrice: input.entryPrice,
            takeProfit: input.takeProfit, stopLoss: input.stopLoss, confidence: input.confidence, entryQualityLabel,
          }).catch(error => console.warn("[Telegram] High-confidence signal delivery failed:", error));
        }
        
        // Send multi-channel notification for high-confidence signals
        if (input.confidence >= 80) {
          // result is MySqlRawQueryResult - extract insertId for the signal id
          const insertId = Array.isArray(result) ? (result[0] as any)?.insertId : 0;
          await sendMultiChannelNotification(
            "signal_verified",
            `🎯 New High-Confidence Signal: ${input.symbol}`,
            `${input.symbol} ${input.direction} signal with ${input.confidence}% confidence. Entry: ${input.entryPrice}, TP: ${input.takeProfit}`,
            {
              id: insertId || 0,
              symbol: input.symbol,
              direction: input.direction,
              entryPrice: input.entryPrice,
              takeProfit: input.takeProfit,
              stopLoss: input.stopLoss,
              confidence: input.confidence,
            }
          );
        }
        
        return { success: true, result };
      }),

    /** Get all signals with optional filtering */
    list: publicProcedure
      .input(
        z
          .object({
            minConfidence: z.number().int().min(0).max(100).optional(),
            limit: z.number().int().positive().optional(),
            outcome: z.enum(["pending", "hit_tp", "hit_sl", "expired"]).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const signals = await db.getSignals(input);
        return signals;
      }),

    /** Highest-quality valid signal logged in the last 24 hours for homepage prominence. */
    signalOfTheDay: publicProcedure.query(async () => {
      return db.getSignalOfTheDay();
    }),

    /** Update signal outcome */
    updateOutcome: publicProcedure
      .input(
        z.object({
          signalId: z.number().int().positive(),
          outcome: z.enum(["hit_tp", "hit_sl", "expired"]),
          actualExitPrice: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await db.updateSignalOutcome(
          input.signalId,
          input.outcome,
          input.actualExitPrice
        );
        return { success: true, result };
      }),

    /** Mark a signal as trade taken by the user */
    markTradeTaken: publicProcedure
      .input(z.object({
        signalId: z.number().int().positive(),
        exchange: z.string().default("manual"),
      }))
      .mutation(async ({ input }) => {
        await db.markSignalTradeTaken(input.signalId, input.exchange);
        return { success: true };
      }),

    /** Cross-verify a trade taken signal against all connected exchange accounts */
    verifyTradeTaken: publicProcedure
      .input(z.object({
        signalId: z.number().int().positive(),
        symbol: z.string(),
        direction: z.enum(["LONG", "SHORT"]),
        entryPrice: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 1;
        const results: { exchange: string; matched: boolean; positionSize?: string; positionSide?: string; entryPrice?: string; }[] = [];
        const cleanSymbol = input.symbol.replace("/", "").replace("-PERP", "").toUpperCase();
        const priceTolerancePct = 0.02; // 2% tolerance on entry price match

        // Helper: check if a position matches the signal
        const isMatch = (pos: any, exchange: string) => {
          const posSymbol = (pos.symbol || pos.instId || "").replace("-USDT-SWAP", "USDT").replace("-", "").toUpperCase();
          const symbolMatch = posSymbol.includes(cleanSymbol) || cleanSymbol.includes(posSymbol.replace("USDT", ""));
          const sideMatch = input.direction === "LONG"
            ? (pos.side === "Buy" || pos.side === "long" || parseFloat(pos.positionAmt ?? pos.pos ?? pos.size ?? "0") > 0)
            : (pos.side === "Sell" || pos.side === "short" || parseFloat(pos.positionAmt ?? pos.pos ?? pos.size ?? "0") < 0);
          const posEntry = parseFloat(pos.entryPrice ?? pos.avgPrice ?? pos.avgPx ?? "0");
          const priceMatch = posEntry === 0 || Math.abs(posEntry - input.entryPrice) / input.entryPrice < priceTolerancePct;
          return symbolMatch && sideMatch && priceMatch;
        };

        // Check Binance
        try {
          const binKey = await db.getBinanceApiKey(userId);
          if (binKey) {
            const crypto = await import("crypto");
            const ts = Date.now();
            const qs = `timestamp=${ts}&symbol=${cleanSymbol}`;
            const sig = crypto.createHmac("sha256", binKey.apiSecret).update(qs).digest("hex");
            const r = await axios.get(`https://fapi.binance.com/fapi/v2/positionRisk?${qs}&signature=${sig}`, {
              headers: { "X-MBX-APIKEY": binKey.apiKey }, timeout: 8000,
            });
            const pos = (r.data as any[]).find((p: any) => isMatch(p, "binance") && parseFloat(p.positionAmt) !== 0);
            results.push({ exchange: "binance", matched: !!pos, positionSize: pos?.positionAmt, positionSide: pos?.positionSide, entryPrice: pos?.entryPrice });
          }
        } catch { results.push({ exchange: "binance", matched: false }); }

        // Check Bybit
        try {
          const bybitKey = await db.getCexApiKey(userId, "bybit");
          if (bybitKey) {
            const crypto = await import("crypto");
            const ts = Date.now().toString();
            const qs = `api_key=${bybitKey.apiKey}&category=linear&symbol=${cleanSymbol}&recv_window=5000&timestamp=${ts}`;
            const sig = crypto.createHmac("sha256", bybitKey.apiSecret).update(qs).digest("hex");
            const r = await axios.get(`https://api.bybit.com/v5/position/list?${qs}&sign=${sig}`, { timeout: 8000 });
            const positions = r.data?.result?.list ?? [];
            const pos = positions.find((p: any) => isMatch(p, "bybit") && parseFloat(p.size) > 0);
            results.push({ exchange: "bybit", matched: !!pos, positionSize: pos?.size, positionSide: pos?.side, entryPrice: pos?.avgPrice });
          }
        } catch { results.push({ exchange: "bybit", matched: false }); }

        // Check OKX
        try {
          const okxKey = await db.getCexApiKey(userId, "okx");
          if (okxKey?.passphrase) {
            const crypto = await import("crypto");
            const ts = new Date().toISOString();
            const path = "/api/v5/account/positions";
            const sig = crypto.createHmac("sha256", okxKey.apiSecret).update(ts + "GET" + path).digest("base64");
            const r = await axios.get(`https://www.okx.com${path}`, {
              headers: { "OK-ACCESS-KEY": okxKey.apiKey, "OK-ACCESS-SIGN": sig, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": okxKey.passphrase },
              timeout: 8000,
            });
            const pos = (r.data?.data ?? []).find((p: any) => isMatch(p, "okx") && parseFloat(p.pos) !== 0);
            results.push({ exchange: "okx", matched: !!pos, positionSize: pos?.pos, positionSide: parseFloat(pos?.pos ?? "0") > 0 ? "long" : "short", entryPrice: pos?.avgPx });
          }
        } catch { results.push({ exchange: "okx", matched: false }); }

        const anyMatch = results.some(r => r.matched);
        const matchedExchanges = results.filter(r => r.matched).map(r => r.exchange);

        // Mark as verified in DB if any match found
        if (anyMatch) {
          await db.markSignalTradeTaken(input.signalId, matchedExchanges.join(","));
        }

        return { verified: anyMatch, matchedExchanges, results };
      }),
    /** Get all signals marked as trade taken */
    tradeTaken: publicProcedure
      .query(async () => {
        const signals = await db.getTradeTakenSignals(50);
        return signals;
      }),

    /** Get signal statistics */
    stats: publicProcedure
      .input(
        z
          .object({
            minConfidence: z.number().int().min(0).max(100).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const stats = await db.getSignalStats(input?.minConfidence);
        return stats;
      }),
  }),

  // Notification Router
  notifications: router({
    /** Save a new notification */
    save: publicProcedure
      .input(
        z.object({
          type: z.enum(["signal_verified", "signal_hit_tp", "signal_hit_sl", "signal_expired", "system"]),
          title: z.string(),
          message: z.string(),
          signalId: z.number().int().positive().optional(),
          metadata: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await db.saveNotification(input);
        return { success: true, result };
      }),

    /** Get all notifications */
    list: publicProcedure
      .input(
        z
          .object({
            limit: z.number().int().positive().optional(),
            unreadOnly: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const notifications = await db.getNotifications(input);
        return notifications;
      }),

    /** Mark notification as read */
    markAsRead: publicProcedure
      .input(
        z.object({
          notificationId: z.number().int().positive(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await db.markNotificationAsRead(input.notificationId);
        return { success: true, result };
      }),

    /** Mark all notifications as read */
    markAllAsRead: publicProcedure
      .mutation(async () => {
        const result = await db.markAllNotificationsAsRead();
        return { success: true, result };
      }),
  }),

  // Notification Preferences Router
  notificationPreferences: router({
    /** Get notification preferences */
    get: publicProcedure
      .input(
        z
          .object({
            userId: z.number().int().positive().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const prefs = await db.getNotificationPreferences(input?.userId);
        return prefs;
      }),

    /** Save or update notification preferences */
    save: publicProcedure
      .input(
        z.object({
          userId: z.number().int().positive().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          enableBrowser: z.number().int().min(0).max(1).optional(),
          enableEmail: z.number().int().min(0).max(1).optional(),
          enableSMS: z.number().int().min(0).max(1).optional(),
          notifyHitTP: z.number().int().min(0).max(1).optional(),
          notifyHitSL: z.number().int().min(0).max(1).optional(),
          notifyExpired: z.number().int().min(0).max(1).optional(),
          notifyVerified: z.number().int().min(0).max(1).optional(),
          notifyMarketUpdates: z.number().int().min(0).max(1).optional(),
          notifySystem: z.number().int().min(0).max(1).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await db.saveNotificationPreferences(input);
        return result;
      }),
  }),

  // AI Backend Proxy Router (server-side to avoid CORS)
  aiBackend: router({
    /** Get AI engine health and stats (proxied from backend) */
    stats: publicProcedure.query(async () => {
      const backendUrl = ENV.inverseiqBackendUrl;
      if (!backendUrl) {
        return {
          available: false,
          error: "Backend URL not configured",
          data: null,
        };
      }
      try {
        const [healthRes, statsRes] = await Promise.allSettled([
          axios.get(`${backendUrl}/api/health`, { timeout: 8000 }),
          axios.get(`${backendUrl}/api/ai/stats`, { timeout: 8000 }),
        ]);

        const health =
          healthRes.status === "fulfilled" ? healthRes.value.data : null;
        const stats = statsRes.status === "fulfilled"
          ? normalizeAiStats(statsRes.value.data)
          : null;

        // Try detailed stats endpoint
        let detailed = null;
        try {
          const detailedRes = await axios.get(
            `${backendUrl}/api/ai/continuous-learning`,
            { timeout: 8000 }
          );
          detailed = detailedRes.data;
        } catch {
          // not all backends expose this endpoint
        }

        return {
          available: !!health,
          health,
          stats,
          detailed,
          error: null,
        };
      } catch (err: any) {
        return {
          available: false,
          error: err?.message ?? "Backend unreachable",
          data: null,
        };
      }
    }),

    /** Submit signal outcome feedback to backend for continuous learning */
    submitFeedback: publicProcedure
      .input(
        z.object({
          signalId: z.string(),
          symbol: z.string(),
          direction: z.enum(["LONG", "SHORT"]),
          entryPrice: z.number(),
          exitPrice: z.number(),
          outcome: z.enum(["TP_HIT", "SL_HIT", "EXPIRED"]),
          profitPercent: z.number(),
          holdingPeriodMs: z.number().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const backendUrl = ENV.inverseiqBackendUrl;
        if (!backendUrl) return { success: false, error: "Backend not configured" };
        try {
          const res = await axios.post<unknown>(
            `${backendUrl}/api/feedback/signal-outcome`,
            input,
            { timeout: 10000 }
          );
          return { success: true, data: res.data };
        } catch (err: any) {
          return { success: false, error: err?.message ?? "Feedback failed" };
        }
      }),
  }),

  // Confidence History Router
  confidenceHistory: router({
    /** Get confidence history for trend charts */
    list: publicProcedure
      .input(
        z
          .object({
            days: z.number().int().positive().max(90).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const history = await db.getConfidenceHistory(input?.days ?? 30);
        return history;
      }),

    /** Trigger a daily snapshot build (admin use) */
    buildSnapshot: publicProcedure
      .input(
        z
          .object({
            backendPatterns: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .mutation(async ({ input }) => {
        const snapshot = await db.buildDailySnapshot(input?.backendPatterns ?? 0);
        return { success: !!snapshot, snapshot };
      }),
  }),

  // Binance API Key Management Router
  binance: router({
    /** Save Binance API key for the authenticated user. */
    saveApiKey: protectedProcedure
      .input(
        z.object({
          apiKey: z.string().min(10, "API key too short"),
          apiSecret: z.string().min(10, "API secret too short"),
          label: z.string().optional(),
          isTestnet: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveBinanceApiKey({
          userId,
          apiKey: input.apiKey,
          apiSecret: input.apiSecret,
          label: input.label,
          isTestnet: input.isTestnet,
        });
        return { success: true };
      }),

    /** Check if the authenticated user has a Binance API key configured. */
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const hasKey = await db.hasBinanceApiKey(userId);
      return { hasKey };
    }),

    /** Get Binance API key metadata (never returns the actual key/secret). */
    getApiKeyInfo: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getBinanceApiKey(userId);
      if (!keyData) return null;
      return {
        label: keyData.label,
        isTestnet: keyData.isTestnet,
        lastVerifiedAt: keyData.lastVerifiedAt,
        // Return masked key for display
        maskedApiKey: keyData.apiKey.slice(0, 6) + "*".repeat(Math.max(0, keyData.apiKey.length - 10)) + keyData.apiKey.slice(-4),
      };
    }),

    /** Remove Binance API key. */
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteBinanceApiKey(userId);
      return { success: true };
    }),

    /** Verify Binance API key and begin private history learning. */
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getBinanceApiKey(userId);
      if (!keyData) {
        return { success: false, error: "No API key configured" };
      }
      try {
        const crypto = await import("crypto");
        const baseUrl = keyData.isTestnet
          ? "https://testnet.binancefuture.com"
          : "https://fapi.binance.com";
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = crypto
          .createHmac("sha256", keyData.apiSecret)
          .update(queryString)
          .digest("hex");
        const response = await axios.get(
          `${baseUrl}/fapi/v2/account?${queryString}&signature=${signature}`,
          { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
        );
        const account = response.data;
        void syncUserExchangeHistory(userId, "binance").catch((error) => {
          console.error(`[ExchangeHistory] Binance post-verification import failed for user ${userId}:`, error);
        });
        return {
          success: true,
          totalWalletBalance: account.totalWalletBalance,
          availableBalance: account.availableBalance,
          totalUnrealizedProfit: account.totalUnrealizedProfit,
          canTrade: account.canTrade,
          historyImportStarted: true,
        };
      } catch (err: any) {
        const msg = err?.response?.data?.msg || err?.message || "Verification failed";
        return { success: false, error: msg };
      }
    }),

    /** Fetch open positions from Binance Futures. */
    getPositions: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getBinanceApiKey(userId);
      if (!keyData) return { positions: [], error: "No API key configured" };
      try {
        const crypto = await import("crypto");
        const baseUrl = keyData.isTestnet
          ? "https://testnet.binancefuture.com"
          : "https://fapi.binance.com";
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = crypto
          .createHmac("sha256", keyData.apiSecret)
          .update(queryString)
          .digest("hex");
        const response = await axios.get(
          `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
          { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
        );
        // Filter only positions with non-zero size
        const positions = (response.data as any[]).filter(
          (p: any) => parseFloat(p.positionAmt) !== 0
        );
        return { positions };
      } catch (err: any) {
        const msg = err?.response?.data?.msg || err?.message || "Failed to fetch positions";
        return { positions: [], error: msg };
      }
    }),

    /** Place a futures market order on Binance. */
    placeOrder: protectedProcedure
      .input(
        z.object({
          symbol: z.string(),
          side: z.enum(["BUY", "SELL"]),
          quantity: z.number().positive(),
          leverage: z.number().int().min(1).max(125).optional(),
          orderType: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
          price: z.number().optional(),
          takeProfit: z.number().positive().optional(),
          stopLoss: z.number().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        const keyData = await db.getBinanceApiKey(userId);
        if (!keyData) return { success: false, error: "No API key configured" };
        const protectionValidation = validateCexProtection({
          symbol: input.symbol,
          entrySide: input.side,
          entryPrice: input.orderType === "LIMIT" ? input.price : undefined,
          takeProfit: input.takeProfit,
          stopLoss: input.stopLoss,
        });
        if (!protectionValidation.ok) return { success: false, error: protectionValidation.error };
        if ((input.takeProfit || input.stopLoss) && input.orderType !== "MARKET") {
          return { success: false, error: "Binance exchange-side TP/SL is available only for market entries; limit entries remain unprotected until filled" };
        }
        try {
          const crypto = await import("crypto");
          const baseUrl = keyData.isTestnet
            ? "https://testnet.binancefuture.com"
            : "https://fapi.binance.com";
          // Set leverage first if specified
          if (input.leverage) {
            const lvTs = Date.now();
            const cleanSym = input.symbol.replace("/", "").replace("USDT", "") + "USDT";
            const lvQs = `symbol=${cleanSym}&leverage=${input.leverage}&timestamp=${lvTs}`;
            const lvSig = crypto.createHmac("sha256", keyData.apiSecret).update(lvQs).digest("hex");
            await axios.post(
              `${baseUrl}/fapi/v1/leverage?${lvQs}&signature=${lvSig}`,
              {},
              { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
            );
          }
          // Place order (market or limit)
          const timestamp = Date.now();
          const cleanSymbol = input.symbol.replace("/", "").replace("USDT", "") + "USDT";
          const isLimit = input.orderType === "LIMIT" && input.price;
          const priceParam = isLimit ? `&price=${input.price}&timeInForce=GTC` : "";
          const queryString = `symbol=${cleanSymbol}&side=${input.side}&type=${input.orderType}&quantity=${input.quantity}${priceParam}&timestamp=${timestamp}`;
          const signature = crypto
            .createHmac("sha256", keyData.apiSecret)
            .update(queryString)
            .digest("hex");
          const response = await axios.post(
            `${baseUrl}/fapi/v1/order?${queryString}&signature=${signature}`,
            {},
            { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
          );
          const protection: { status: "not_requested" | "active" | "failed"; error?: string } = { status: "not_requested" };
          if (input.takeProfit && input.stopLoss) {
            try {
              const orders = buildBinanceProtectionOrders({
                symbol: cleanSymbol,
                entrySide: input.side,
                takeProfit: input.takeProfit,
                stopLoss: input.stopLoss,
              });
              for (const order of orders) {
                const protectionTs = Date.now();
                const protectionQs = new URLSearchParams({ ...order, timestamp: String(protectionTs) }).toString();
                const protectionSig = crypto.createHmac("sha256", keyData.apiSecret).update(protectionQs).digest("hex");
                const protectionRes = await axios.post(
                  `${baseUrl}/fapi/v1/algoOrder?${protectionQs}&signature=${protectionSig}`,
                  {},
                  { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 },
                );
                if (protectionRes.data?.code && protectionRes.data.code !== 0) {
                  throw new Error(protectionRes.data?.msg ?? "Binance rejected a TP/SL algo order");
                }
              }
              protection.status = "active";
            } catch (protectionError: any) {
              protection.status = "failed";
              protection.error = protectionError?.response?.data?.msg || protectionError?.message || "Binance TP/SL placement failed";
            }
          }
          return { success: true, order: response.data, protection };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Order failed";
          return { success: false, error: msg };
        }
      }),
  }),

  // Gem Watchlist Router
  gems: router({
    /** Get user's gem watchlist */
    getWatchlist: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return [];
      return db.getGemWatchlist(ctx.user.id);
    }),

    /** Add gem to watchlist */
    addToWatchlist: publicProcedure
      .input(z.object({
        symbol: z.string(),
        exchange: z.string(),
        riskLevel: z.enum(["VERY_HIGH", "HIGH", "MEDIUM", "LOW"]),
        gemScore: z.number(),
        priceAtAdd: z.string().optional(),
        metadata: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) return { success: false, error: "Not authenticated" };
        const item = await db.addGemToWatchlist({
          userId: ctx.user.id,
          symbol: input.symbol,
          exchange: input.exchange,
          riskLevel: input.riskLevel,
          gemScore: input.gemScore,
          priceAtAdd: input.priceAtAdd,
          metadata: input.metadata,
          alertEnabled: 0,
        });
        return { success: true, item };
      }),

    /** Remove gem from watchlist */
    removeFromWatchlist: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) return { success: false };
        await db.removeGemFromWatchlist(ctx.user.id, input.symbol);
        return { success: true };
      }),

    /** Toggle alert for a gem */
    toggleAlert: publicProcedure
      .input(z.object({ symbol: z.string(), enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) return { success: false };
        await db.toggleGemAlert(ctx.user.id, input.symbol, input.enabled);
        return { success: true };
      }),

    /** Get symbols with alerts enabled for current user */
    getAlertSymbols: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return [];
      return db.getGemAlertsForUser(ctx.user.id);
    }),

    /** Get the latest batch of discovered gems */
    getLatest: publicProcedure.query(async () => {
      return db.getLatestGemBatch();
    }),

    /** Get gem scan history (last N batches) */
    getHistory: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
      .query(async ({ input }) => {
        return db.getGemBatchHistory(input.limit);
      }),

    /** Trigger a manual scan (protected — owner only) */
    triggerScan: protectedProcedure.mutation(async () => {
      const { runGemScan } = await import("./lib/gemScannerServer");
      return runGemScan();
    }),

    /** Enable/disable continuous scanning via Heartbeat */
    toggleScanning: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        return db.toggleGemScanning(userId, input.enabled);
      }),

    /** Get scan settings */
    getScanSettings: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return db.getGemScanSettings(userId);
    }),

    /** Save gem alert preferences (confidence threshold, notification channels) */
    saveAlertPreferences: protectedProcedure
      .input(z.object({
        minConfidence: z.number().min(0).max(100).default(80),
        enableEmail: z.boolean().default(true),
        enableTelegram: z.boolean().default(true),
        enableBrowser: z.boolean().default(false),
        notifyEmail: z.string().email().optional(),
        telegramChatId: z.string().optional(),
        scanIntervalMinutes: z.number().min(15).max(1440).default(60),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveGemAlertPreferences(userId, {
          minConfidence: input.minConfidence,
          enableEmail: input.enableEmail ? 1 : 0,
          enableTelegram: input.enableTelegram ? 1 : 0,
          enableBrowser: input.enableBrowser ? 1 : 0,
          notifyEmail: input.notifyEmail ?? null,
          telegramChatId: input.telegramChatId ?? null,
          scanIntervalMinutes: input.scanIntervalMinutes,
        });
        return { success: true };
      }),

    /** Get gem alert preferences */
    getAlertPreferences: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const settings = await db.getGemScanSettings(userId);
      // Auto-populate telegramChatId from main telegramSettings if not set in gem settings
      let chatId = settings?.telegramChatId ?? null;
      if (!chatId) {
        const tgSettings = await db.getTelegramSettings(userId);
        if (tgSettings?.chatId && tgSettings.isVerified) {
          chatId = tgSettings.chatId;
        }
      }
      return {
        minConfidence: settings?.minConfidence ?? 80,
        enableEmail: (settings?.enableEmail ?? 1) === 1,
        enableTelegram: (settings?.enableTelegram ?? 1) === 1,
        enableBrowser: (settings?.enableBrowser ?? 0) === 1,
        notifyEmail: settings?.notifyEmail ?? null,
        telegramChatId: chatId,
        scanIntervalMinutes: settings?.scanIntervalMinutes ?? 60,
        isEnabled: (settings?.isEnabled ?? 0) === 1,
      };
    }),

    /** Send a test alert to verify email/Telegram configuration */
    sendTestAlert: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const settings = await db.getGemScanSettings(userId);
      if (!settings) {
        return { success: false, error: "No alert preferences saved yet. Save your preferences first." };
      }

      const testMessage = `🧪 InverseIQ Test Alert\n\nThis is a test notification from your Gem Finder alert settings.\n\nIf you received this, your notification channels are configured correctly!\n\n⏰ ${new Date().toISOString()}`;
      const results: string[] = [];

      // Test Email
      if (settings.enableEmail === 1) {
        try {
          const { notifyOwner } = await import("./_core/notification");
          const sent = await notifyOwner({ title: "🧪 InverseIQ Test Alert", content: testMessage });
          results.push(sent ? "✅ Email sent" : "❌ Email failed");
        } catch (e: any) {
          results.push(`❌ Email error: ${e.message}`);
        }
      }

      // Test Telegram
      if (settings.enableTelegram === 1 && settings.telegramChatId) {
        try {
          const botToken = ENV.telegramBotToken;
          if (botToken) {
            const tgRes = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: settings.telegramChatId,
              text: testMessage,
              parse_mode: "Markdown",
            });
            results.push(tgRes.data?.ok ? "✅ Telegram sent" : "❌ Telegram failed");
          } else {
            results.push("❌ Telegram bot token not configured");
          }
        } catch (e: any) {
          results.push(`❌ Telegram error: ${e.message}`);
        }
      }

      if (results.length === 0) {
        return { success: false, error: "No notification channels are enabled" };
      }

      const allSuccess = results.every(r => r.startsWith("✅"));
      return { success: allSuccess, details: results.join(", "), error: allSuccess ? undefined : results.filter(r => r.startsWith("❌")).join(", ") };
    }),
  }),

  // ─── Bybit API Router ────────────────────────────────────────────────────────
  bybit: router({
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return { hasKey: await db.hasCexApiKey(userId, "bybit") };
    }),
    getApiKeyInfo: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "bybit");
      if (!keyData) return null;
      return {
        maskedApiKey: keyData.apiKey.slice(0, 6) + "*".repeat(Math.max(0, keyData.apiKey.length - 10)) + keyData.apiKey.slice(-4),
        label: keyData.label,
        isTestnet: keyData.isTestnet,
        lastVerifiedAt: keyData.lastVerifiedAt,
      };
    }),
    saveApiKey: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(10, "API key too short"),
        apiSecret: z.string().min(10, "API secret too short"),
        label: z.string().optional(),
        isTestnet: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "bybit", ...input });
        return { success: true };
      }),
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "bybit");
      return { success: true };
    }),
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "bybit");
      if (!keyData) return { success: false, error: "No API key configured" };
      try {
        const crypto = await import("crypto");
        const baseUrl = keyData.isTestnet
          ? "https://api-testnet.bybit.com"
          : "https://api.bybit.com";
        const timestamp = Date.now().toString();
        const recvWindow = "5000";
        const queryString = `api_key=${keyData.apiKey}&recv_window=${recvWindow}&timestamp=${timestamp}`;
        const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
        const response = await axios.get(
          `${baseUrl}/v5/account/wallet-balance?accountType=UNIFIED&${queryString}&sign=${signature}`,
          { timeout: 10000 }
        );
        const result = response.data?.result?.list?.[0];
        void syncUserExchangeHistory(userId, "bybit").catch((error) => {
          console.error(`[ExchangeHistory] Bybit post-verification import failed for user ${userId}:`, error);
        });
        return {
          success: true,
          totalWalletBalance: result?.totalWalletBalance ?? "0",
          availableBalance: result?.totalAvailableBalance ?? "0",
          historyImportStarted: true,
        };
      } catch (err: any) {
        const msg = err?.response?.data?.retMsg || err?.message || "Verification failed";
        return { success: false, error: msg };
      }
    }),
    placeOrder: protectedProcedure
      .input(z.object({
        symbol: z.string(),
        side: z.enum(["Buy", "Sell"]),
        qty: z.string(),
        leverage: z.number().int().min(1).max(100).optional(),
        orderType: z.enum(["Market", "Limit"]).default("Market"),
        price: z.string().optional(),
        takeProfit: z.number().positive().optional(),
        stopLoss: z.number().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        const keyData = await db.getCexApiKey(userId, "bybit");
        if (!keyData) return { success: false, error: "No API key configured" };
        const entrySide = input.side === "Buy" ? "BUY" : "SELL" as const;
        const protectionValidation = validateCexProtection({
          symbol: input.symbol,
          entrySide,
          entryPrice: input.orderType === "Limit" && input.price ? Number(input.price) : undefined,
          takeProfit: input.takeProfit,
          stopLoss: input.stopLoss,
        });
        if (!protectionValidation.ok) return { success: false, error: protectionValidation.error };
        if ((input.takeProfit || input.stopLoss) && input.orderType !== "Market") {
          return { success: false, error: "Bybit exchange-side TP/SL is available only for market entries; limit entries remain unprotected until filled" };
        }
        try {
          const crypto = await import("crypto");
          const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
          const cleanSymbol = input.symbol.replace("/", "").replace("USDT", "") + "USDT";
          if (input.leverage) {
            const lvTs = Date.now().toString();
            const lvBody = JSON.stringify({ category: "linear", symbol: cleanSymbol, buyLeverage: String(input.leverage), sellLeverage: String(input.leverage) });
            const lvStr = lvTs + keyData.apiKey + "5000" + lvBody;
            const lvSig = crypto.createHmac("sha256", keyData.apiSecret).update(lvStr).digest("hex");
            await axios.post(`${baseUrl}/v5/position/set-leverage`, lvBody, {
              headers: { "X-BAPI-API-KEY": keyData.apiKey, "X-BAPI-TIMESTAMP": lvTs, "X-BAPI-SIGN": lvSig, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" },
              timeout: 10000,
            });
          }
          const timestamp = Date.now().toString();
          const orderBody: Record<string, string | boolean> = { category: "linear", symbol: cleanSymbol, side: input.side, orderType: input.orderType ?? "Market", qty: input.qty };
          if (input.orderType === "Limit" && input.price) { orderBody.price = input.price; orderBody.timeInForce = "GTC"; }
          const body = JSON.stringify(orderBody);
          const signStr = timestamp + keyData.apiKey + "5000" + body;
          const signature = crypto.createHmac("sha256", keyData.apiSecret).update(signStr).digest("hex");
          const response = await axios.post(`${baseUrl}/v5/order/create`, body, {
            headers: { "X-BAPI-API-KEY": keyData.apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-SIGN": signature, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" },
            timeout: 10000,
          });
          if (response.data?.retCode && response.data.retCode !== 0) {
            return { success: false, error: response.data?.retMsg ?? "Bybit order rejected" };
          }
          const protection: { status: "not_requested" | "active" | "failed"; error?: string } = { status: "not_requested" };
          if (input.takeProfit && input.stopLoss) {
            try {
              const protectionBody = JSON.stringify(buildBybitPositionProtection({
                symbol: cleanSymbol,
                takeProfit: input.takeProfit,
                stopLoss: input.stopLoss,
              }));
              const protectionTs = Date.now().toString();
              const protectionSignature = crypto.createHmac("sha256", keyData.apiSecret)
                .update(protectionTs + keyData.apiKey + "5000" + protectionBody)
                .digest("hex");
              const protectionRes = await axios.post(`${baseUrl}/v5/position/trading-stop`, protectionBody, {
                headers: { "X-BAPI-API-KEY": keyData.apiKey, "X-BAPI-TIMESTAMP": protectionTs, "X-BAPI-SIGN": protectionSignature, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" },
                timeout: 10000,
              });
              if (protectionRes.data?.retCode && protectionRes.data.retCode !== 0) {
                throw new Error(protectionRes.data?.retMsg ?? "Bybit rejected position TP/SL");
              }
              protection.status = "active";
            } catch (protectionError: any) {
              protection.status = "failed";
              protection.error = protectionError?.response?.data?.retMsg || protectionError?.message || "Bybit TP/SL placement failed";
            }
          }
          return { success: true, order: response.data, protection };
        } catch (err: any) {
          const msg = err?.response?.data?.retMsg || err?.message || "Order failed";
          return { success: false, error: msg };
        }
      }),
    getPositions: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "bybit");
      if (!keyData) return [];
      try {
        const crypto = await import("crypto");
        const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
        const timestamp = Date.now().toString();
        const queryString = `api_key=${keyData.apiKey}&category=linear&settleCoin=USDT&recv_window=5000&timestamp=${timestamp}`;
        const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
        const response = await axios.get(`${baseUrl}/v5/position/list?${queryString}&sign=${signature}`, { timeout: 10000 });
        return (response.data?.result?.list ?? []).filter((p: any) => parseFloat(p.size) > 0).map((p: any) => ({
          symbol: p.symbol, side: p.side === "Buy" ? "long" : "short",
          size: p.size, entryPrice: p.avgPrice, markPrice: p.markPrice,
          unrealizedPnl: p.unrealisedPnl, leverage: p.leverage, exchange: "bybit",
        }));
      } catch { return []; }
    }),
    /** Manual idempotent refresh of the authenticated user's private Bybit history. */
    importTradeHistory: protectedProcedure
      .input(z.object({ limit: z.number().int().min(10).max(500).optional().default(200) }))
      .mutation(async ({ ctx }) => {
        const result = await syncUserExchangeHistory(ctx.user!.id, "bybit");
        return {
          ...result,
          tradesImported: result.rowsInserted,
          message: result.success
            ? `Imported ${result.rowsInserted} new rows; ${result.duplicatesIgnored} duplicates ignored; ${result.eligibleOutcomes} private outcomes analyzed.`
            : result.error,
        };
      }),
  }),

  // ─── OKX API Router ──────────────────────────────────────────────────────────
  okx: router({
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return { hasKey: await db.hasCexApiKey(userId, "okx") };
    }),
    getApiKeyInfo: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "okx");
      if (!keyData) return null;
      return {
        maskedApiKey: keyData.apiKey.slice(0, 6) + "*".repeat(Math.max(0, keyData.apiKey.length - 10)) + keyData.apiKey.slice(-4),
        label: keyData.label,
        isTestnet: keyData.isTestnet,
        lastVerifiedAt: keyData.lastVerifiedAt,
        hasPassphrase: !!keyData.passphrase,
      };
    }),
    saveApiKey: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(10, "API key too short"),
        apiSecret: z.string().min(10, "API secret too short"),
        passphrase: z.string().min(1, "OKX passphrase is required"),
        label: z.string().optional(),
        isTestnet: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "okx", ...input });
        return { success: true };
      }),
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "okx");
      return { success: true };
    }),
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "okx");
      if (!keyData) return { success: false, error: "No API key configured" };
      if (!keyData.passphrase) return { success: false, error: "OKX passphrase not set" };
      try {
        const crypto = await import("crypto");
        const baseUrl = "https://www.okx.com";
        const timestamp = new Date().toISOString();
        const method = "GET";
        const path = "/api/v5/account/balance";
        const prehash = timestamp + method + path;
        const signature = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
        const response = await axios.get(`${baseUrl}${path}`, {
          headers: {
            "OK-ACCESS-KEY": keyData.apiKey,
            "OK-ACCESS-SIGN": signature,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": keyData.passphrase,
            ...(keyData.isTestnet ? { "x-simulated-trading": "1" } : {}),
          },
          timeout: 10000,
        });
        const balData = response.data?.data?.[0];
        void syncUserExchangeHistory(userId, "okx").catch((error) => {
          console.error(`[ExchangeHistory] OKX post-verification import failed for user ${userId}:`, error);
        });
        return {
          success: true,
          totalWalletBalance: balData?.totalEq ?? "0",
          availableBalance: balData?.adjEq ?? "0",
          historyImportStarted: true,
        };
      } catch (err: any) {
        const msg = err?.response?.data?.msg || err?.message || "Verification failed";
        return { success: false, error: msg };
      }
    }),
    placeOrder: protectedProcedure
      .input(z.object({
        symbol: z.string(),
        side: z.enum(["buy", "sell"]),
        sz: z.string(),
        leverage: z.number().int().min(1).max(100).optional(),
        ordType: z.enum(["market", "limit"]).default("market"),
        px: z.string().optional(),
        takeProfit: z.number().positive().optional(),
        stopLoss: z.number().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        const keyData = await db.getCexApiKey(userId, "okx");
        if (!keyData) return { success: false, error: "No API key configured" };
        if (!keyData.passphrase) return { success: false, error: "OKX passphrase not set" };
        const entrySide = input.side === "buy" ? "BUY" : "SELL" as const;
        const protectionValidation = validateCexProtection({
          symbol: input.symbol,
          entrySide,
          entryPrice: input.ordType === "limit" && input.px ? Number(input.px) : undefined,
          takeProfit: input.takeProfit,
          stopLoss: input.stopLoss,
        });
        if (!protectionValidation.ok) return { success: false, error: protectionValidation.error };
        if ((input.takeProfit || input.stopLoss) && input.ordType !== "market") {
          return { success: false, error: "OKX exchange-side TP/SL is available only for market entries; limit entries remain unprotected until filled" };
        }
        try {
          const crypto = await import("crypto");
          const baseUrl = "https://www.okx.com";
          const cleanSymbol = input.symbol.replace("/", "-").replace("USDT", "") + "-USDT-SWAP";
          if (input.leverage) {
            const lvTs = new Date().toISOString();
            const lvBody = JSON.stringify({ instId: cleanSymbol, lever: String(input.leverage), mgnMode: "cross" });
            const lvPrehash = lvTs + "POST" + "/api/v5/account/set-leverage" + lvBody;
            const lvSig = crypto.createHmac("sha256", keyData.apiSecret).update(lvPrehash).digest("base64");
            await axios.post(`${baseUrl}/api/v5/account/set-leverage`, lvBody, {
              headers: { "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": lvSig, "OK-ACCESS-TIMESTAMP": lvTs, "OK-ACCESS-PASSPHRASE": keyData.passphrase, "Content-Type": "application/json" },
              timeout: 10000,
            });
          }
          const timestamp = new Date().toISOString();
          const orderObj: Record<string, string> = { instId: cleanSymbol, tdMode: "cross", side: input.side, ordType: input.ordType ?? "market", sz: input.sz };
          if (input.ordType === "limit" && input.px) { orderObj.px = input.px; }
          const body = JSON.stringify(orderObj);
          const prehash = timestamp + "POST" + "/api/v5/trade/order" + body;
          const signature = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
          const response = await axios.post(`${baseUrl}/api/v5/trade/order`, body, {
            headers: { "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": signature, "OK-ACCESS-TIMESTAMP": timestamp, "OK-ACCESS-PASSPHRASE": keyData.passphrase, "Content-Type": "application/json" },
            timeout: 10000,
          });
          const entryResult = response.data?.data?.[0];
          if (response.data?.code !== "0" || (entryResult && entryResult.sCode !== "0")) {
            return { success: false, error: entryResult?.sMsg || response.data?.msg || "OKX order rejected" };
          }
          const protection: { status: "not_requested" | "active" | "failed"; error?: string } = { status: "not_requested" };
          if (input.takeProfit && input.stopLoss) {
            try {
              const protectionObj = buildOkxPositionProtection({
                symbol: cleanSymbol,
                entrySide,
                takeProfit: input.takeProfit,
                stopLoss: input.stopLoss,
              });
              const protectionBody = JSON.stringify(protectionObj);
              const protectionTs = new Date().toISOString();
              const protectionPrehash = protectionTs + "POST" + "/api/v5/trade/order-algo" + protectionBody;
              const protectionSig = crypto.createHmac("sha256", keyData.apiSecret).update(protectionPrehash).digest("base64");
              const protectionRes = await axios.post(`${baseUrl}/api/v5/trade/order-algo`, protectionBody, {
                headers: { "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": protectionSig, "OK-ACCESS-TIMESTAMP": protectionTs, "OK-ACCESS-PASSPHRASE": keyData.passphrase, "Content-Type": "application/json" },
                timeout: 10000,
              });
              const protectionResult = protectionRes.data?.data?.[0];
              if (protectionRes.data?.code !== "0" || (protectionResult && protectionResult.sCode !== "0")) {
                throw new Error(protectionResult?.sMsg || protectionRes.data?.msg || "OKX rejected position TP/SL");
              }
              protection.status = "active";
            } catch (protectionError: any) {
              protection.status = "failed";
              protection.error = protectionError?.response?.data?.msg || protectionError?.message || "OKX TP/SL placement failed";
            }
          }
          return { success: true, order: response.data, protection };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Order failed";
          return { success: false, error: msg };
        }
      }),
    getPositions: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "okx");
      if (!keyData || !keyData.passphrase) return [];
      try {
        const crypto = await import("crypto");
        const baseUrl = "https://www.okx.com";
        const timestamp = new Date().toISOString();
        const path = "/api/v5/account/positions";
        const prehash = timestamp + "GET" + path;
        const signature = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
        const response = await axios.get(`${baseUrl}${path}`, {
          headers: { "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": signature, "OK-ACCESS-TIMESTAMP": timestamp, "OK-ACCESS-PASSPHRASE": keyData.passphrase },
          timeout: 10000,
        });
        return (response.data?.data ?? []).filter((p: any) => parseFloat(p.pos) !== 0).map((p: any) => ({
          symbol: p.instId, side: parseFloat(p.pos) > 0 ? "long" : "short",
          size: Math.abs(parseFloat(p.pos)), entryPrice: p.avgPx, markPrice: p.markPx,
          unrealizedPnl: p.upl, leverage: p.lever, exchange: "okx",
        }));
      } catch { return []; }
    }),
    /** Manual idempotent refresh of the authenticated user's private OKX history. */
    importTradeHistory: protectedProcedure
      .input(z.object({ limit: z.number().int().min(10).max(500).optional().default(200) }))
      .mutation(async ({ ctx }) => {
        const result = await syncUserExchangeHistory(ctx.user!.id, "okx");
        return {
          ...result,
          tradesImported: result.rowsInserted,
          message: result.success
            ? `Imported ${result.rowsInserted} new rows; ${result.duplicatesIgnored} duplicates ignored; ${result.eligibleOutcomes} private outcomes analyzed.`
            : result.error,
        };
      }),
  }),

  // MEXC Exchange Router
  mexc: router({
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return db.hasCexApiKey(userId, "mexc" as any);
    }),
    saveApiKey: protectedProcedure
      .input(z.object({ apiKey: z.string().min(10), apiSecret: z.string().min(10), label: z.string().optional(), isTestnet: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "mexc" as any, ...input });
        return { success: true };
      }),
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "mexc" as any);
      return { success: true };
    }),
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "mexc" as any);
      if (!keyData) return { success: false, error: "No API key configured" };
      try {
        const crypto = await import("crypto");
        const ts = Date.now().toString();
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(`timestamp=${ts}`).digest("hex");
        const response = await axios.get("https://api.mexc.com/api/v3/account", {
          headers: { "X-MEXC-APIKEY": keyData.apiKey },
          params: { timestamp: ts, signature: sig },
          timeout: 10000,
        });
        const bal = response.data?.balances?.find((b: any) => b.asset === "USDT");
        void syncUserExchangeHistory(userId, "mexc").catch((error) => {
          console.error(`[ExchangeHistory] MEXC post-verification import failed for user ${userId}:`, error);
        });
        return { success: true, totalWalletBalance: bal?.free ?? "0", availableBalance: bal?.free ?? "0", historyImportStarted: true };
      } catch (err: any) {
        return { success: false, error: err?.response?.data?.msg || err?.message || "Verification failed" };
      }
    }),
    getPositions: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      const keyData = await db.getCexApiKey(userId, "mexc" as any);
      if (!keyData) return [];
      try {
        const crypto = await import("crypto");
        const ts = Date.now().toString();
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(`timestamp=${ts}`).digest("hex");
        const response = await axios.get("https://contract.mexc.com/api/v1/private/position/open_positions", {
          headers: { "ApiKey": keyData.apiKey, "Request-Time": ts, "Signature": sig },
          timeout: 10000,
        });
        return (response.data?.data ?? []).map((p: any) => ({
          symbol: p.symbol, side: p.positionType === 1 ? "long" : "short",
          size: p.holdVol, entryPrice: p.openAvgPrice, markPrice: p.closeAvgPrice,
          unrealizedPnl: p.unrealisedPnl, leverage: p.leverage, exchange: "mexc",
        }));
      } catch { return []; }
    }),
  }),

  // KuCoin Exchange Router
  kucoin: router({
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return db.hasCexApiKey(userId, "kucoin" as any);
    }),
    saveApiKey: protectedProcedure
      .input(z.object({ apiKey: z.string().min(10), apiSecret: z.string().min(10), passphrase: z.string().min(1), label: z.string().optional(), isTestnet: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "kucoin" as any, ...input });
        return { success: true };
      }),
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "kucoin" as any);
      return { success: true };
    }),
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "kucoin" as any);
      if (!keyData || !keyData.passphrase) return { success: false, error: "API key or passphrase missing" };
      try {
        const crypto = await import("crypto");
        const ts = Date.now().toString();
        const path = "/api/v1/accounts";
        const prehash = ts + "GET" + path;
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
        const pp = crypto.createHmac("sha256", keyData.apiSecret).update(keyData.passphrase).digest("base64");
        const response = await axios.get(`https://api.kucoin.com${path}`, {
          headers: { "KC-API-KEY": keyData.apiKey, "KC-API-SIGN": sig, "KC-API-TIMESTAMP": ts, "KC-API-PASSPHRASE": pp, "KC-API-KEY-VERSION": "2" },
          timeout: 10000,
        });
        const usdt = response.data?.data?.find((a: any) => a.currency === "USDT" && a.type === "trade");
        void syncUserExchangeHistory(userId, "kucoin").catch((error) => {
          console.error(`[ExchangeHistory] KuCoin post-verification import failed for user ${userId}:`, error);
        });
        return { success: true, totalWalletBalance: usdt?.balance ?? "0", availableBalance: usdt?.available ?? "0", historyImportStarted: true };
      } catch (err: any) {
        return { success: false, error: err?.response?.data?.msg || err?.message || "Verification failed" };
      }
    }),
    getPositions: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      const keyData = await db.getCexApiKey(userId, "kucoin" as any);
      if (!keyData || !keyData.passphrase) return [];
      try {
        const crypto = await import("crypto");
        const ts = Date.now().toString();
        const path = "/api/v1/positions";
        const prehash = ts + "GET" + path;
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
        const pp = crypto.createHmac("sha256", keyData.apiSecret).update(keyData.passphrase).digest("base64");
        const response = await axios.get(`https://api-futures.kucoin.com${path}`, {
          headers: { "KC-API-KEY": keyData.apiKey, "KC-API-SIGN": sig, "KC-API-TIMESTAMP": ts, "KC-API-PASSPHRASE": pp, "KC-API-KEY-VERSION": "2" },
          timeout: 10000,
        });
        return (response.data?.data ?? []).map((p: any) => ({
          symbol: p.symbol, side: p.currentQty > 0 ? "long" : "short",
          size: Math.abs(p.currentQty), entryPrice: p.avgEntryPrice, markPrice: p.markPrice,
          unrealizedPnl: p.unrealisedPnl, leverage: p.leverage, exchange: "kucoin",
        }));
      } catch { return []; }
    }),
  }),

  // Gate.io Exchange Router
  gateio: router({
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return db.hasCexApiKey(userId, "gateio" as any);
    }),
    saveApiKey: protectedProcedure
      .input(z.object({ apiKey: z.string().min(10), apiSecret: z.string().min(10), label: z.string().optional(), isTestnet: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "gateio" as any, ...input });
        return { success: true };
      }),
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "gateio" as any);
      return { success: true };
    }),
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "gateio" as any);
      if (!keyData) return { success: false, error: "No API key configured" };
      try {
        const crypto = await import("crypto");
        const ts = Math.floor(Date.now() / 1000).toString();
        const path = "/api/v4/futures/usdt/accounts";
        const prehash = `GET\n${path}\n\n${ts}`;
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("hex");
        const response = await axios.get(`https://api.gateio.ws${path}`, {
          headers: { "KEY": keyData.apiKey, "SIGN": sig, "Timestamp": ts },
          timeout: 10000,
        });
        void syncUserExchangeHistory(userId, "gateio").catch((error) => {
          console.error(`[ExchangeHistory] Gate.io post-verification import failed for user ${userId}:`, error);
        });
        return { success: true, totalWalletBalance: response.data?.total ?? "0", availableBalance: response.data?.available ?? "0", historyImportStarted: true };
      } catch (err: any) {
        return { success: false, error: err?.response?.data?.message || err?.message || "Verification failed" };
      }
    }),
    getPositions: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      const keyData = await db.getCexApiKey(userId, "gateio" as any);
      if (!keyData) return [];
      try {
        const crypto = await import("crypto");
        const ts = Math.floor(Date.now() / 1000).toString();
        const path = "/api/v4/futures/usdt/positions";
        const prehash = `GET\n${path}\n\n${ts}`;
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("hex");
        const response = await axios.get(`https://api.gateio.ws${path}`, {
          headers: { "KEY": keyData.apiKey, "SIGN": sig, "Timestamp": ts },
          timeout: 10000,
        });
        return (response.data ?? []).filter((p: any) => p.size !== 0).map((p: any) => ({
          symbol: p.contract, side: p.size > 0 ? "long" : "short",
          size: Math.abs(p.size), entryPrice: p.entry_price, markPrice: p.mark_price,
          unrealizedPnl: p.unrealised_pnl, leverage: p.leverage, exchange: "gateio",
        }));
      } catch { return []; }
    }),
  }),

  // Bitget Exchange Router
  bitget: router({
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return db.hasCexApiKey(userId, "bitget" as any);
    }),
    saveApiKey: protectedProcedure
      .input(z.object({ apiKey: z.string().min(10), apiSecret: z.string().min(10), passphrase: z.string().min(1), label: z.string().optional(), isTestnet: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "bitget" as any, ...input });
        return { success: true };
      }),
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "bitget" as any);
      return { success: true };
    }),
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "bitget" as any);
      if (!keyData || !keyData.passphrase) return { success: false, error: "API key or passphrase missing" };
      try {
        const crypto = await import("crypto");
        const ts = Date.now().toString();
        const path = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";
        const prehash = ts + "GET" + path;
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
        const response = await axios.get(`https://api.bitget.com${path}`, {
          headers: { "ACCESS-KEY": keyData.apiKey, "ACCESS-SIGN": sig, "ACCESS-TIMESTAMP": ts, "ACCESS-PASSPHRASE": keyData.passphrase },
          timeout: 10000,
        });
        const acct = response.data?.data?.[0];
        void syncUserExchangeHistory(userId, "bitget").catch((error) => {
          console.error(`[ExchangeHistory] Bitget post-verification import failed for user ${userId}:`, error);
        });
        return { success: true, totalWalletBalance: acct?.equity ?? "0", availableBalance: acct?.available ?? "0", historyImportStarted: true };
      } catch (err: any) {
        return { success: false, error: err?.response?.data?.msg || err?.message || "Verification failed" };
      }
    }),
    getPositions: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      const keyData = await db.getCexApiKey(userId, "bitget" as any);
      if (!keyData || !keyData.passphrase) return [];
      try {
        const crypto = await import("crypto");
        const ts = Date.now().toString();
        const path = "/api/v2/mix/position/all-position?productType=USDT-FUTURES";
        const prehash = ts + "GET" + path;
        const sig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
        const response = await axios.get(`https://api.bitget.com${path}`, {
          headers: { "ACCESS-KEY": keyData.apiKey, "ACCESS-SIGN": sig, "ACCESS-TIMESTAMP": ts, "ACCESS-PASSPHRASE": keyData.passphrase },
          timeout: 10000,
        });
        return (response.data?.data ?? []).map((p: any) => ({
          symbol: p.symbol, side: p.holdSide,
          size: p.total, entryPrice: p.openPriceAvg, markPrice: p.markPrice,
          unrealizedPnl: p.unrealizedPL, leverage: p.leverage, exchange: "bitget",
        }));
      } catch { return []; }
    }),
  }),

  // AI Trade Analyzer Router
  // ── AI Trade Analyzer Router ────────────────────────────────────────────────
  tradeAnalyzer: router({
    /**
     * Multi-timeframe technical indicators: RSI, MACD, BB across 15m / 1H / 4H / 1D
     * Plus funding rate, open interest trend, and volume delta (buy vs sell pressure)
     */
    indicators: publicProcedure
      .input(z.object({
        symbol: z.string(),
        exchange: z.string().default("binance"),
      }))
      .query(async ({ input }) => {
        // Normalize: strip slashes, suffixes, and convert USDC to USDT for kline fetching
        let sym = input.symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").replace("USDC", "USDT").toUpperCase();
        // Ensure it ends with USDT for the kline API
        if (!sym.endsWith("USDT")) sym = `${sym}USDT`;

        // Helper: compute RSI-14, MACD(12,26,9), BB(20,2) from a closes array
        function computeIndicators(closes: number[], highs: number[], lows: number[], volumes: number[]) {
          const n = closes.length;
          if (n < 30) return null;

          // RSI-14 (Wilder smoothing)
          const rsiPeriod = 14;
          let avgGain = 0, avgLoss = 0;
          for (let i = 1; i <= rsiPeriod; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) avgGain += diff; else avgLoss -= diff;
          }
          avgGain /= rsiPeriod; avgLoss /= rsiPeriod;
          for (let i = rsiPeriod + 1; i < n; i++) {
            const diff = closes[i] - closes[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
            avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
          }
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          const rsi = Math.round((100 - 100 / (1 + rs)) * 10) / 10;

          // EMA helper
          const ema = (arr: number[], period: number, startIdx = 0): number[] => {
            const k = 2 / (period + 1);
            const result: number[] = [];
            let e = arr[startIdx];
            result.push(e);
            for (let i = startIdx + 1; i < arr.length; i++) {
              e = arr[i] * k + e * (1 - k);
              result.push(e);
            }
            return result;
          };

          // MACD(12,26,9)
          const ema12 = ema(closes, 12);
          const ema26 = ema(closes, 26);
          const macdLine = ema12.map((v, i) => v - ema26[i]);
          const signalLine = ema(macdLine, 9);
          const lastMacd = macdLine[macdLine.length - 1];
          const lastSignal = signalLine[signalLine.length - 1];
          const histogram = lastMacd - lastSignal;
          const macdCrossing = macdLine.length >= 2
            ? (macdLine[macdLine.length - 2] < signalLine[signalLine.length - 2] && lastMacd > lastSignal ? "bullish_cross"
              : macdLine[macdLine.length - 2] > signalLine[signalLine.length - 2] && lastMacd < lastSignal ? "bearish_cross"
              : "none")
            : "none";

          // Bollinger Bands(20,2)
          const bbPeriod = 20;
          const bbSlice = closes.slice(n - bbPeriod);
          const bbMid = bbSlice.reduce((a, b) => a + b, 0) / bbPeriod;
          const stdDev = Math.sqrt(bbSlice.reduce((a, b) => a + (b - bbMid) ** 2, 0) / bbPeriod);
          const bbUpper = bbMid + 2 * stdDev;
          const bbLower = bbMid - 2 * stdDev;
          const currentPrice = closes[n - 1];
          const bbPosition = Math.round(((currentPrice - bbLower) / (bbUpper - bbLower)) * 100 * 10) / 10;
          const bbWidth = Math.round(((bbUpper - bbLower) / bbMid) * 100 * 100) / 100; // squeeze indicator

          // Volume delta (last 5 candles: buy pressure vs sell pressure using close vs open)
          const recentCandles = 10;
          let buyVol = 0, sellVol = 0;
          for (let i = n - recentCandles; i < n; i++) {
            if (closes[i] >= (highs[i] + lows[i]) / 2) buyVol += volumes[i];
            else sellVol += volumes[i];
          }
          const totalVol = buyVol + sellVol;
          const volumeDelta = totalVol > 0 ? Math.round(((buyVol - sellVol) / totalVol) * 100) : 0;

          // Volume trend (recent 10 vs prior 10)
          const recentVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
          const prevVol = volumes.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
          const volumeTrend = recentVol > prevVol * 1.2 ? "increasing" : recentVol < prevVol * 0.8 ? "decreasing" : "stable";

          // EMA 20/50/200 trend
          const ema20 = ema(closes, 20);
          const ema50 = ema(closes, 50);
          const lastEma20 = ema20[ema20.length - 1];
          const lastEma50 = ema50[ema50.length - 1];
          const emaTrend = lastEma20 > lastEma50 ? "bullish" : lastEma20 < lastEma50 ? "bearish" : "neutral";

          return {
            rsi,
            macd: {
              line: Math.round(lastMacd * 10000) / 10000,
              signal: Math.round(lastSignal * 10000) / 10000,
              histogram: Math.round(histogram * 10000) / 10000,
              crossing: macdCrossing,
            },
            bollingerBands: {
              upper: Math.round(bbUpper * 100) / 100,
              mid: Math.round(bbMid * 100) / 100,
              lower: Math.round(bbLower * 100) / 100,
              position: bbPosition,
              width: bbWidth,
            },
            volumeTrend,
            volumeDelta,
            emaTrend,
            ema20: Math.round(lastEma20 * 100) / 100,
            ema50: Math.round(lastEma50 * 100) / 100,
            currentPrice,
            candleCount: n,
          };
        }

        // Fetch klines for a given timeframe (OKX primary, Bybit fallback)
        const _svBybitIv = (iv: string) => ({ "1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","6h":"360","12h":"720","1d":"D","1w":"W" }[iv] ?? "60");
        const _svOkxIv   = (iv: string) => ({ "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","6h":"6H","12h":"12H","1d":"1D","1w":"1W" }[iv] ?? "1H");
        const _svOkxInst = (s: string) => `${s.replace(/USDT$/, '')}-USDT-SWAP`;
        const _H = { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0)" };
        async function fetchKlines(interval: string, limit = 150) {
          // Primary: OKX
          try {
            const r = await axios.get(
              `https://www.okx.com/api/v5/market/candles?instId=${_svOkxInst(sym)}&bar=${_svOkxIv(interval)}&limit=${limit}`,
              { headers: _H, timeout: 8000 }
            );
            const list: string[][] = (r.data?.data ?? []).reverse();
            if (list.length > 5) return {
              closes: list.map(c => parseFloat(c[4])),
              highs:  list.map(c => parseFloat(c[2])),
              lows:   list.map(c => parseFloat(c[3])),
              volumes:list.map(c => parseFloat(c[5])),
            };
          } catch { /* fall through */ }
          // Fallback: Bybit
          const bvIv = _svBybitIv(interval);
          const r = await axios.get(
            `https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${bvIv}&limit=${limit}`,
            { headers: _H, timeout: 8000 }
          );
          const list: string[][] = (r.data?.result?.list ?? []).reverse();
          if (!list.length) throw new Error(`No klines for ${sym} ${interval}`);
          return {
            closes: list.map(c => parseFloat(c[4])),
            highs:  list.map(c => parseFloat(c[2])),
            lows:   list.map(c => parseFloat(c[3])),
            volumes:list.map(c => parseFloat(c[5])),
          };
        }

        try {
          // Fetch all timeframes in parallel
          const [tf15m, tf1h, tf4h, tf1d, fundingResp, oiResp, sentimentResp] = await Promise.allSettled([
            fetchKlines("15m", 150),
            fetchKlines("1h", 150),
            fetchKlines("4h", 150),
            fetchKlines("1d", 100),
            axios.get(`https://www.okx.com/api/v5/public/funding-rate?instId=${_svOkxInst(sym)}`, { headers: _H, timeout: 5000 })
              .catch(() => axios.get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&limit=8`, { headers: _H, timeout: 5000 })),
            axios.get(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${_svOkxInst(sym)}&period=1H&limit=24`, { headers: _H, timeout: 5000 })
              .catch(() => axios.get(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=24`, { headers: _H, timeout: 5000 })),
            fetchSocialSentiment(sym),
          ]);

          const get15m = tf15m.status === "fulfilled" ? tf15m.value : null;
          const get1h = tf1h.status === "fulfilled" ? tf1h.value : null;
          const get4h = tf4h.status === "fulfilled" ? tf4h.value : null;
          const get1d = tf1d.status === "fulfilled" ? tf1d.value : null;

          const ind15m = get15m ? computeIndicators(get15m.closes, get15m.highs, get15m.lows, get15m.volumes) : null;
          const ind1h = get1h ? computeIndicators(get1h.closes, get1h.highs, get1h.lows, get1h.volumes) : null;
          const ind4h = get4h ? computeIndicators(get4h.closes, get4h.highs, get4h.lows, get4h.volumes) : null;
          const ind1d = get1d ? computeIndicators(get1d.closes, get1d.highs, get1d.lows, get1d.volumes) : null;

          // Funding rate (latest) — handle OKX format (data[0].fundingRate) or Bybit (result.list[].fundingRate)
          let fundingRate: number | null = null;
          let fundingTrend: "positive" | "negative" | "neutral" = "neutral";
          if (fundingResp.status === "fulfilled") {
            const okxFr = fundingResp.value.data?.data?.[0]?.fundingRate;
            if (okxFr != null) {
              fundingRate = Math.round(parseFloat(okxFr) * 10000 * 100) / 100;
              fundingTrend = parseFloat(okxFr) > 0.0001 ? "positive" : parseFloat(okxFr) < -0.0001 ? "negative" : "neutral";
            } else {
              const rates: { fundingRate: string }[] = fundingResp.value.data?.result?.list ?? [];
              if (rates.length > 0) {
                fundingRate = Math.round(parseFloat(rates[rates.length - 1].fundingRate) * 10000 * 100) / 100;
                const avgRate = rates.reduce((s, r) => s + parseFloat(r.fundingRate), 0) / rates.length;
                fundingTrend = avgRate > 0.0001 ? "positive" : avgRate < -0.0001 ? "negative" : "neutral";
              }
            }
          }

          // Open interest trend (last 24h) — handle OKX format (data[][1]) or Bybit (result.list[].openInterest)
          let oiTrend: "increasing" | "decreasing" | "stable" = "stable";
          let oiChange: number | null = null;
          if (oiResp.status === "fulfilled") {
            const okxOi: string[][] = oiResp.value.data?.data ?? [];
            if (okxOi.length >= 2) {
              const first = parseFloat(okxOi[0][1]);
              const last = parseFloat(okxOi[okxOi.length - 1][1]);
              oiChange = Math.round(((last - first) / first) * 100 * 100) / 100;
              oiTrend = oiChange > 2 ? "increasing" : oiChange < -2 ? "decreasing" : "stable";
            } else {
              const oiData: { openInterest: string }[] = oiResp.value.data?.result?.list ?? [];
              if (oiData.length >= 2) {
                const first = parseFloat(oiData[0].openInterest);
                const last = parseFloat(oiData[oiData.length - 1].openInterest);
                oiChange = Math.round(((last - first) / first) * 100 * 100) / 100;
                oiTrend = oiChange > 2 ? "increasing" : oiChange < -2 ? "decreasing" : "stable";
              }
            }
          }

          // Social Sentiment
          const sentiment = sentimentResp.status === "fulfilled" ? sentimentResp.value : null;

          // Volume Profile from 1h candles
          let vp = null;
          if (get1h) {
            const candles1h = get1h.closes.map((c, i) => ({
              ts: 0, open: c, high: get1h.highs[i], low: get1h.lows[i], close: c, volume: get1h.volumes[i]
            }));
            vp = computeVolumeProfile(candles1h, 50);
          }

          // Multi-timeframe confluence score (bullish/bearish alignment)
          const timeframes = [ind15m, ind1h, ind4h, ind1d];
          let bullishCount = 0, bearishCount = 0;
          for (const tf of timeframes) {
            if (!tf) continue;
            if (tf.rsi > 50 && tf.macd.histogram > 0 && tf.emaTrend === "bullish") bullishCount++;
            else if (tf.rsi < 50 && tf.macd.histogram < 0 && tf.emaTrend === "bearish") bearishCount++;
          }
          // Boost confluence with sentiment
          if (sentiment?.sentimentBias === "bullish") bullishCount += 0.5;
          else if (sentiment?.sentimentBias === "bearish") bearishCount += 0.5;
          const confluenceScore = bullishCount > bearishCount ? Math.round(bullishCount * 25) : bearishCount > bullishCount ? -Math.round(bearishCount * 25) : 0;
          const confluenceBias = confluenceScore > 0 ? "bullish" : confluenceScore < 0 ? "bearish" : "neutral";

          return {
            timeframes: {
              "15m": ind15m,
              "1h": ind1h,
              "4h": ind4h,
              "1d": ind1d,
            },
            fundingRate,
            fundingTrend,
            oiTrend,
            oiChange,
            confluenceScore,
            confluenceBias,
            // New: Volume Profile
            volumeProfile: vp ? {
              poc: vp.poc,
              vah: vp.vah,
              val: vp.val,
              vpBias: vp.vpBias,
              vpScore: vp.vpScore,
              priceVsPoc: vp.priceVsPoc,
            } : null,
            // New: Social Sentiment
            sentiment: sentiment ? {
              sentimentScore: sentiment.sentimentScore,
              sentimentLabel: sentiment.sentimentLabel,
              sentimentBias: sentiment.sentimentBias,
              fearGreedValue: sentiment.fearGreedValue,
              fearGreedLabel: sentiment.fearGreedLabel,
              isTrending: sentiment.isTrending,
              trendingRank: sentiment.trendingRank,
            } : null,
          };
        } catch {
          return {
            timeframes: { "15m": null, "1h": null, "4h": null, "1d": null },
            fundingRate: null,
            fundingTrend: "neutral" as const,
            oiTrend: "stable" as const,
            oiChange: null,
            confluenceScore: 0,
            confluenceBias: "neutral" as const,
            volumeProfile: null,
            sentiment: null,
          };
        }
      }),

    /**
     * Analyze a position using AI — returns expert futures trading advice
     * incorporating multi-timeframe indicators, funding rate, OI, and volume delta
     */
    analyze: publicProcedure
      .input(z.object({
        symbol: z.string(),
        side: z.enum(["long", "short"]),
        entryPrice: z.number(),
        currentPrice: z.number(),
        leverage: z.number(),
        size: z.number(),
        unrealizedPnl: z.number(),
        exchange: z.string(),
        signalId: z.number().optional(),
        additionalContext: z.string().optional(),
        /** Pre-formatted symbol pattern summary from the user's trade history (injected by frontend) */
        symbolPatternContext: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { invokeLLM } = await import("./_core/llm");
        const sym = input.symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").toUpperCase();

        const pnlPct = (input.currentPrice - input.entryPrice) / input.entryPrice * 100 * (input.side === "long" ? 1 : -1);
        const leveragedPnlPct = pnlPct * input.leverage;

        // Accurate liquidation price (isolated margin, 0.5% maintenance margin)
        const maintenanceMarginRate = 0.005;
        // Correct isolated-margin liquidation formula:
        // LONG: entry × (1 − (1 − MMR) / leverage)
        // SHORT: entry × (1 + (1 − MMR) / leverage)
        const liqPrice = input.side === "long"
          ? input.entryPrice * (1 - (1 - maintenanceMarginRate) / input.leverage)
          : input.entryPrice * (1 + (1 - maintenanceMarginRate) / input.leverage);
        const distanceToLiq = Math.abs((input.currentPrice - liqPrice) / input.currentPrice * 100);

        // Fetch live indicators for context
        let indicatorContext = "";
        try {
          // Fetch 1H and 4H indicators inline (OKX primary, Bybit fallback)
          const _aH = { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0)" };
          const _aOkxIv = (iv: string) => ({ "1m":"1m","5m":"5m","15m":"15m","1h":"1H","4h":"4H","1d":"1D" })[iv] ?? "1H";
          const _aBvIv  = (iv: string) => ({ "1m":"1","5m":"5","15m":"15","1h":"60","4h":"240","1d":"D" })[iv] ?? "60";
          const _aInst  = (s: string) => `${s.replace(/USDT$/, '')}-USDT-SWAP`;
          const fetchKlines = async (interval: string, limit = 150) => {
            // OKX primary
            try {
              const r = await axios.get(`https://www.okx.com/api/v5/market/candles?instId=${_aInst(sym)}&bar=${_aOkxIv(interval)}&limit=${limit}`, { headers: _aH, timeout: 8000 });
              const _list: string[][] = (r.data?.data ?? []).reverse();
              if (_list.length > 5) return {
                closes: _list.map(c => parseFloat(c[4])),
                highs: _list.map(c => parseFloat(c[2])),
                lows: _list.map(c => parseFloat(c[3])),
                volumes: _list.map(c => parseFloat(c[5])),
              };
            } catch { /* fall through */ }
            // Bybit fallback
            const r = await axios.get(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${_aBvIv(interval)}&limit=${limit}`, { headers: _aH, timeout: 8000 });
            const _list: string[][] = (r.data?.result?.list ?? []).reverse();
            if (!_list.length) throw new Error(`No klines for ${sym}`);
            return {
              closes: _list.map(c => parseFloat(c[4])),
              highs: _list.map(c => parseFloat(c[2])),
              lows: _list.map(c => parseFloat(c[3])),
              volumes: _list.map(c => parseFloat(c[5])),
            };
          };
          const calcRSI = (closes: number[]) => {
            const n = closes.length; const p = 14;
            let ag = 0, al = 0;
            for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i-1]; if (d > 0) ag += d; else al -= d; }
            ag /= p; al /= p;
            for (let i = p+1; i < n; i++) { const d = closes[i] - closes[i-1]; ag = (ag*(p-1)+(d>0?d:0))/p; al = (al*(p-1)+(d<0?-d:0))/p; }
            return al === 0 ? 100 : Math.round((100 - 100/(1+ag/al))*10)/10;
          };
          const calcEMA = (arr: number[], p: number) => { const k = 2/(p+1); let e = arr[0]; for (let i=1;i<arr.length;i++) e=arr[i]*k+e*(1-k); return e; };

          const [r1h, r4h, rFunding, rOI] = await Promise.allSettled([
            fetchKlines("1h", 150),
            fetchKlines("4h", 150),
            axios.get(`https://www.okx.com/api/v5/public/funding-rate?instId=${_aInst(sym)}`, { headers: _aH, timeout: 5000 })
              .catch(() => axios.get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&limit=3`, { headers: _aH, timeout: 5000 })),
            axios.get(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${_aInst(sym)}&period=1H&limit=8`, { headers: _aH, timeout: 5000 })
              .catch(() => axios.get(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=8`, { headers: _aH, timeout: 5000 })),
          ]);

          const lines: string[] = [];

          if (r1h.status === "fulfilled") {
            const { closes, volumes } = r1h.value;
            const rsi1h = calcRSI(closes);
            const ema12 = calcEMA(closes, 12); const ema26 = calcEMA(closes, 26);
            const macd1h = ema12 - ema26;
            const bbSlice = closes.slice(-20); const bbMid = bbSlice.reduce((a,b)=>a+b,0)/20;
            const std = Math.sqrt(bbSlice.reduce((a,b)=>a+(b-bbMid)**2,0)/20);
            const bbPos = Math.round(((closes[closes.length-1]-bbMid-2*std)/(4*std))*100);
            const recentVol = volumes.slice(-5).reduce((a,b)=>a+b,0)/5;
            const prevVol = volumes.slice(-10,-5).reduce((a,b)=>a+b,0)/5;
            const volTrend = recentVol > prevVol*1.15 ? "↑ rising" : recentVol < prevVol*0.85 ? "↓ falling" : "→ stable";
            lines.push(`**1H:** RSI ${rsi1h} | MACD ${macd1h > 0 ? "+" : ""}${macd1h.toFixed(4)} | BB position ${bbPos}% | Volume ${volTrend}`);
          }

          if (r4h.status === "fulfilled") {
            const { closes } = r4h.value;
            const rsi4h = calcRSI(closes);
            const ema12 = calcEMA(closes, 12); const ema26 = calcEMA(closes, 26);
            const macd4h = ema12 - ema26;
            const ema50 = calcEMA(closes, 50);
            const trend = closes[closes.length-1] > ema50 ? "above EMA50 (bullish)" : "below EMA50 (bearish)";
            lines.push(`**4H:** RSI ${rsi4h} | MACD ${macd4h > 0 ? "+" : ""}${macd4h.toFixed(4)} | Price ${trend}`);
          }

          if (rFunding.status === "fulfilled") {
            const okxFr = rFunding.value.data?.data?.[0]?.fundingRate;
            const fr = okxFr != null
              ? parseFloat(okxFr) * 100
              : parseFloat((rFunding.value.data?.result?.list ?? []).slice(-1)[0]?.fundingRate ?? "0") * 100;
            if (fr !== 0 || okxFr != null) {
              const frStr = fr > 0 ? `+${fr.toFixed(4)}%` : `${fr.toFixed(4)}%`;
              const frBias = fr > 0.01 ? "longs paying shorts (bearish pressure)" : fr < -0.01 ? "shorts paying longs (bullish pressure)" : "neutral";
              lines.push(`**Funding Rate:** ${frStr} — ${frBias}`);
            }
          }

          if (rOI.status === "fulfilled") {
            const okxOi: string[][] = rOI.value.data?.data ?? [];
            const oiData: { openInterest: string }[] = rOI.value.data?.result?.list ?? [];
            const oiArr = okxOi.length >= 2 ? okxOi.map(d => parseFloat(d[1])) : oiData.map(d => parseFloat(d.openInterest));
            if (oiArr.length >= 2) {
              const first = oiArr[0]; const last = oiArr[oiArr.length-1];
              const oiChg = ((last-first)/first*100).toFixed(2);
              const oiBias = parseFloat(oiChg) > 2 ? "rising OI (new money entering)" : parseFloat(oiChg) < -2 ? "falling OI (positions closing)" : "stable OI";
              lines.push(`**Open Interest (8h):** ${oiChg}% change — ${oiBias}`);
            }
          }

          indicatorContext = lines.length > 0 ? `\n\n**Live Market Data:**\n${lines.join("\n")}` : "";
        } catch { /* indicators unavailable — proceed without */ }

        const systemPrompt = `You are a highly profitable crypto futures trader and analyst with 10+ years of experience specializing in leveraged futures trading on major CEXs. You have deep expertise in risk management, technical analysis, liquidation mechanics, funding rates, open interest dynamics, and market microstructure. You are known for being brutally honest — you will tell a trader to cut their losses immediately if the data demands it, and you will identify when a trade has strong continuation potential. Your analysis is always grounded in price action, leverage mechanics, indicator confluence, and risk/reward math. You think like a professional prop trader, not a retail investor.`;

        const userPrompt = `Analyze this open futures position with full expert-level detail:

**Position Details:**
- Symbol: ${input.symbol}
- Direction: ${input.side.toUpperCase()}
- Exchange: ${input.exchange}
- Entry Price: $${input.entryPrice.toFixed(4)}
- Current Price: $${input.currentPrice.toFixed(4)}
- Leverage: ${input.leverage}x
- Position Size: ${input.size}
- Unrealized PnL: $${input.unrealizedPnl.toFixed(2)} (${leveragedPnlPct.toFixed(2)}% leveraged return)
- Raw price move vs entry: ${pnlPct.toFixed(2)}% ${pnlPct >= 0 ? "in your favour" : "AGAINST you"}
- Estimated liquidation price: $${liqPrice.toFixed(2)} (~${distanceToLiq.toFixed(1)}% away from current price)
${input.additionalContext ? `- Additional context: ${input.additionalContext}` : ""}${input.symbolPatternContext ? `\n\n**Your Personal Trade History on ${input.symbol}:**\n${input.symbolPatternContext}` : ""}${indicatorContext}

Provide a comprehensive expert analysis structured as follows:

**1. Position Health Score** (0-100)
State the score clearly as "Position Health Score: XX/100"

**2. Risk Level**
State clearly as "Risk Level: SAFE" / "Risk Level: CAUTION" / "Risk Level: DANGER" / "Risk Level: EXIT NOW"

**3. Direction Bias Assessment**
Based on the technical indicators and market data above, is the market currently aligned with or against this position? Assess each timeframe (1H, 4H) and state whether the indicators confirm or contradict the trade direction.

**4. Funding Rate & OI Analysis**
What do the funding rate and open interest data tell us about market positioning and potential squeeze risk?

**5. Key Decision**
State clearly as "Key Decision: HOLD" / "Key Decision: ADD" / "Key Decision: REDUCE" / "Key Decision: EXIT"
Provide specific reasoning for this decision based on the data above.

**6. Critical Price Levels**
- Caution level: price at which the trader should start monitoring closely
- Hard stop level: price at which the trader MUST exit to protect capital
- Recovery confirmation: price level that would confirm the trade is back on track

**7. Liquidation Risk Assessment**
With ${input.leverage}x leverage, how much margin is at risk? What is the realistic probability of liquidation given current momentum and volatility?

**8. Scenario Analysis**
- Bull case: what happens if the trade goes in your favour from here?
- Bear case: what is the realistic worst-case outcome?
- Most likely outcome based on current indicators?

Be direct, specific, and brutally honest. A losing trade must be called out clearly. Do not soften bad news.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          });
          const rawContent = response.choices?.[0]?.message?.content ?? "Analysis unavailable";
          const content = typeof rawContent === "string" ? rawContent : "Analysis unavailable";

          // Extract structured fields from the response
          const healthMatch = content.match(/Position Health Score[:\s]*(\d+)/i);
          const riskMatch = content.match(/Risk Level[:\s]*(SAFE|CAUTION|DANGER|EXIT NOW)/i);
          const decisionMatch = content.match(/Key Decision[:\s]*(HOLD|ADD|REDUCE|EXIT)/i);

          // Extract critical price levels
          const cautionMatch = content.match(/[Cc]aution level[:\s]*\$?([\d,]+\.?\d*)/);
          const stopMatch = content.match(/[Hh]ard stop[:\s]*\$?([\d,]+\.?\d*)/);
          const recoveryMatch = content.match(/[Rr]ecovery confirmation[:\s]*\$?([\d,]+\.?\d*)/);

          return {
            success: true,
            analysis: content,
            healthScore: healthMatch ? Math.min(100, Math.max(0, parseInt(healthMatch[1]))) : 50,
            riskLevel: (riskMatch?.[1] ?? "CAUTION") as "SAFE" | "CAUTION" | "DANGER" | "EXIT NOW",
            decision: (decisionMatch?.[1] ?? "HOLD") as "HOLD" | "ADD" | "REDUCE" | "EXIT",
            pnlPct,
            leveragedPnlPct,
            distanceToLiq,
            liqPrice,
            cautionPrice: cautionMatch ? parseFloat(cautionMatch[1].replace(",", "")) : null,
            hardStopPrice: stopMatch ? parseFloat(stopMatch[1].replace(",", "")) : null,
            recoveryPrice: recoveryMatch ? parseFloat(recoveryMatch[1].replace(",", "")) : null,
          };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message ?? "Analysis failed",
            analysis: "",
            healthScore: 50,
            riskLevel: "CAUTION" as const,
            decision: "HOLD" as const,
            pnlPct,
            leveragedPnlPct,
            distanceToLiq,
            liqPrice,
            cautionPrice: null,
            hardStopPrice: null,
            recoveryPrice: null,
          };
        }
      }),
  }),

  // ─── AsterDEX API Router ─────────────────────────────────────────────────────
  asterdex: router({
    /** Check if user has an AsterDEX API key configured */
    hasApiKey: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      return { hasKey: await db.hasCexApiKey(userId, "asterdex") };
    }),

    /** Get API key metadata (never returns the actual key/secret) */
    getApiKeyInfo: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "asterdex");
      if (!keyData) return null;
      const isV3 = keyData.apiKey.includes(":");
      return {
        maskedApiKey: isV3
          ? keyData.apiKey.split(":")[0].slice(0, 6) + "..." + keyData.apiKey.split(":")[0].slice(-4) + " (API Wallet)"
          : keyData.apiKey.slice(0, 6) + "*".repeat(Math.max(0, keyData.apiKey.length - 10)) + keyData.apiKey.slice(-4),
        label: keyData.label,
        isTestnet: false,
        lastVerifiedAt: keyData.lastVerifiedAt,
        isV3,
      };
    }),

    /** Save AsterDEX API key for the authenticated user. */
    saveApiKey: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(5, "Credentials too short"),
        apiSecret: z.string().min(10, "Secret/key too short"),
        label: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveCexApiKey({ userId, exchange: "asterdex", ...input });
        return { success: true };
      }),

    /** Remove AsterDEX API key */
    removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteCexApiKey(userId, "asterdex");
      return { success: true };
    }),

    /** Verify AsterDEX API key by fetching account balance */
    verifyApiKey: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const keyData = await db.getCexApiKey(userId, "asterdex");
      if (!keyData) return { success: false, error: "No API key configured" };

      const { parseAsterWalletCredentials, asterV3Get } = await import("./asterdexSigning");
      const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);

      if (isV3) {
        // V3 EIP-712 signing
        try {
          console.log(`[AsterDEX Verify] Using V3 EIP-712 signing`);
          console.log(`[AsterDEX Verify] userAddress: ${userAddress}`);
          console.log(`[AsterDEX Verify] signerAddress: ${signerAddress}`);
          console.log(`[AsterDEX Verify] privateKey length: ${privateKey.length}`);
            const balances = await asterV3Get("/fapi/v3/balance", {}, userAddress, signerAddress, privateKey);
            const usdt = (balances as any[]).find((b: any) => b.asset === "USDT");
            const availableBalance = usdt?.availableBalance ?? "0";
            const totalWalletBalance = usdt?.balance ?? "0";
            await db.updateCexVerificationState({ userId, exchange: "asterdex", availableBalance, totalBalance: totalWalletBalance });
	            void syncUserExchangeHistory(userId, "asterdex").catch((error) => {
	              console.error(`[ExchangeHistory] AsterDEX post-verification import failed for user ${userId}:`, error);
	            });
            return {
              success: true,
              availableBalance,
              totalWalletBalance,
	              historyImportStarted: true,
          };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Verification failed";
          const code = err?.response?.data?.code;
          const status = err?.response?.status;
          console.error(`[AsterDEX Verify] FAILED: status=${status} code=${code} msg=${msg}`);
          console.error(`[AsterDEX Verify] Full response:`, JSON.stringify(err?.response?.data));
          return { success: false, error: `${msg} (code: ${code || 'unknown'}, status: ${status || 'unknown'})` };
        }
      } else {
        // Legacy V1 HMAC signing
        try {
          const crypto = await import("crypto");
          const timestamp = Date.now();
          const queryString = `timestamp=${timestamp}&recvWindow=5000`;
          const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
          const response = await axios.get(
            `https://fapi.asterdex.com/fapi/v2/balance?${queryString}&signature=${signature}`,
            { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
          );
          const balances: any[] = response.data;
          const usdt = balances.find((b: any) => b.asset === "USDT");
          const availableBalance = usdt?.availableBalance ?? "0";
          const totalWalletBalance = usdt?.balance ?? "0";
          await db.updateCexVerificationState({ userId, exchange: "asterdex", availableBalance, totalBalance: totalWalletBalance });
	          void syncUserExchangeHistory(userId, "asterdex").catch((error) => {
	            console.error(`[ExchangeHistory] AsterDEX post-verification import failed for user ${userId}:`, error);
	          });
          return {
            success: true,
            availableBalance,
            totalWalletBalance,
	            historyImportStarted: true,
          };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Verification failed";
          return { success: false, error: msg };
        }
      }
    }),

    /** Last successfully verified AsterDEX balance. Never returns credentials. */
    getVerificationState: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      return db.getCexVerificationState(userId, "asterdex");
    }),

    /** Fetch open positions from AsterDEX Futures */
    getPositions: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      const keyData = await db.getCexApiKey(userId, "asterdex");
      if (!keyData) return { positions: [], error: "No API key configured" };

      const { parseAsterWalletCredentials, asterV3Get } = await import("./asterdexSigning");
      const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);

      if (isV3) {
        try {
          const data = await asterV3Get("/fapi/v3/positionRisk", {}, userAddress, signerAddress, privateKey);
          const positions = (data as any[]).filter((p: any) => parseFloat(p.positionAmt || p.notional || "0") !== 0);
          return { positions };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Failed to fetch positions";
          return { positions: [], error: msg };
        }
      } else {
        try {
          const crypto = await import("crypto");
          const timestamp = Date.now();
          const queryString = `timestamp=${timestamp}&recvWindow=5000`;
          const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
          const response = await axios.get(
            `https://fapi.asterdex.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
            { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
          );
          const positions = (response.data as any[]).filter((p: any) => parseFloat(p.positionAmt) !== 0);
          return { positions };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Failed to fetch positions";
          return { positions: [], error: msg };
        }
      }
    }),

    /** Fetch USDT available balance from AsterDEX */
    getBalance: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 1;
      const keyData = await db.getCexApiKey(userId, "asterdex");
      if (!keyData) return { balance: "0", error: "No API key configured" };

      const { parseAsterWalletCredentials, asterV3Get } = await import("./asterdexSigning");
      const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);

      if (isV3) {
        try {
          const balances = await asterV3Get("/fapi/v3/balance", {}, userAddress, signerAddress, privateKey);
          const usdt = (balances as any[]).find((b: any) => b.asset === "USDT");
          return { balance: usdt?.availableBalance ?? "0", totalBalance: usdt?.balance ?? "0" };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Failed to fetch balance";
          return { balance: "0", error: msg };
        }
      } else {
        try {
          const crypto = await import("crypto");
          const timestamp = Date.now();
          const queryString = `timestamp=${timestamp}&recvWindow=5000`;
          const signature = crypto.createHmac("sha256", keyData.apiSecret).update(queryString).digest("hex");
          const response = await axios.get(
            `https://fapi.asterdex.com/fapi/v2/balance?${queryString}&signature=${signature}`,
            { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
          );
          const balances: any[] = response.data;
          const usdt = balances.find((b: any) => b.asset === "USDT");
          return { balance: usdt?.availableBalance ?? "0", totalBalance: usdt?.balance ?? "0" };
        } catch (err: any) {
          const msg = err?.response?.data?.msg || err?.message || "Failed to fetch balance";
          return { balance: "0", error: msg };
        }
      }
    }),

    /** Set leverage for a symbol on AsterDEX */
    setLeverage: publicProcedure
      .input(z.object({
        symbol: z.string(),
        leverage: z.number().int().min(1).max(125),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 1;
        const keyData = await db.getCexApiKey(userId, "asterdex");
        if (!keyData) return { success: false, error: "No API key configured" };

        const { parseAsterWalletCredentials, asterV3Post } = await import("./asterdexSigning");
        const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);

        if (isV3) {
          try {
            const data = await asterV3Post("/fapi/v3/leverage", { symbol: input.symbol, leverage: input.leverage }, userAddress, signerAddress, privateKey);
            return { success: true, leverage: data?.leverage };
          } catch (err: any) {
            const msg = err?.response?.data?.msg || err?.message || "Failed to set leverage";
            return { success: false, error: msg };
          }
        } else {
          try {
            const crypto = await import("crypto");
            const timestamp = Date.now();
            const qs = `symbol=${input.symbol}&leverage=${input.leverage}&timestamp=${timestamp}&recvWindow=5000`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            const response = await axios.post(
              `https://fapi.asterdex.com/fapi/v1/leverage?${qs}&signature=${sig}`,
              {},
              { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
            );
            return { success: true, leverage: response.data?.leverage };
          } catch (err: any) {
            const msg = err?.response?.data?.msg || err?.message || "Failed to set leverage";
            return { success: false, error: msg };
          }
        }
      }),

    /** Place a futures market or limit order on AsterDEX */
    placeOrder: publicProcedure
      .input(z.object({
        symbol: z.string(),
        side: z.enum(["BUY", "SELL"]),
        quantity: z.number().positive(),
        leverage: z.number().int().min(1).max(125).optional(),
        orderType: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
        price: z.number().optional(),
        reduceOnly: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 1;
        const keyData = await db.getCexApiKey(userId, "asterdex");
        if (!keyData) return { success: false, error: "No API key configured" };

        const { parseAsterWalletCredentials, asterV3Post } = await import("./asterdexSigning");
        const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);
        const cleanSymbol = input.symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").toUpperCase();

        if (isV3) {
          try {
            // Set leverage first if specified
            if (input.leverage) {
              await asterV3Post("/fapi/v3/leverage", { symbol: cleanSymbol, leverage: input.leverage }, userAddress, signerAddress, privateKey);
            }
            // Build order params
            const orderParams: Record<string, string | number | boolean> = {
              symbol: cleanSymbol,
              side: input.side,
              type: input.orderType,
              quantity: input.quantity,
            };
            if (input.reduceOnly) orderParams.reduceOnly = "true";
            if (input.orderType === "LIMIT" && input.price) {
              orderParams.price = input.price;
              orderParams.timeInForce = "GTC";
            }
            const data = await asterV3Post("/fapi/v3/order", orderParams, userAddress, signerAddress, privateKey);
            return { success: true, order: data };
          } catch (err: any) {
            const msg = err?.response?.data?.msg || err?.message || "Order failed";
            const code = err?.response?.data?.code;
            return { success: false, error: msg, code };
          }
        } else {
          try {
            const crypto = await import("crypto");
            // Set leverage first if specified
            if (input.leverage) {
              const lvTs = Date.now();
              const lvQs = `symbol=${cleanSymbol}&leverage=${input.leverage}&timestamp=${lvTs}&recvWindow=5000`;
              const lvSig = crypto.createHmac("sha256", keyData.apiSecret).update(lvQs).digest("hex");
              await axios.post(
                `https://fapi.asterdex.com/fapi/v1/leverage?${lvQs}&signature=${lvSig}`,
                {},
                { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
              );
            }
            // Build order params
            const timestamp = Date.now();
            const reduceOnlyParam = input.reduceOnly ? "&reduceOnly=true" : "";
            const priceParam = input.orderType === "LIMIT" && input.price ? `&price=${input.price}&timeInForce=GTC` : "";
            const qs = `symbol=${cleanSymbol}&side=${input.side}&type=${input.orderType}&quantity=${input.quantity}${reduceOnlyParam}${priceParam}&timestamp=${timestamp}&recvWindow=5000`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            const response = await axios.post(
              `https://fapi.asterdex.com/fapi/v1/order?${qs}&signature=${sig}`,
              {},
              { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 15000 }
            );
            return { success: true, order: response.data };
          } catch (err: any) {
            const msg = err?.response?.data?.msg || err?.message || "Order failed";
            const code = err?.response?.data?.code;
            return { success: false, error: msg, code };
          }
        }
      }),

    /** Cancel an open order on AsterDEX */
    cancelOrder: publicProcedure
      .input(z.object({
        symbol: z.string(),
        orderId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 1;
        const keyData = await db.getCexApiKey(userId, "asterdex");
        if (!keyData) return { success: false, error: "No API key configured" };

        const { parseAsterWalletCredentials, asterV3Delete } = await import("./asterdexSigning");
        const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);

        if (isV3) {
          try {
            const data = await asterV3Delete("/fapi/v3/order", { symbol: input.symbol, orderId: input.orderId }, userAddress, signerAddress, privateKey);
            return { success: true, order: data };
          } catch (err: any) {
            const msg = err?.response?.data?.msg || err?.message || "Cancel failed";
            return { success: false, error: msg };
          }
        } else {
          try {
            const crypto = await import("crypto");
            const timestamp = Date.now();
            const qs = `symbol=${input.symbol}&orderId=${input.orderId}&timestamp=${timestamp}&recvWindow=5000`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            const response = await axios.delete(
              `https://fapi.asterdex.com/fapi/v1/order?${qs}&signature=${sig}`,
              { headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000 }
            );
            return { success: true, order: response.data };
          } catch (err: any) {
            const msg = err?.response?.data?.msg || err?.message || "Cancel failed";
            return { success: false, error: msg };
          }
        }
      }),
  }),

  // User Inverse Patterns Router
  userPatterns: router({
    /** Save patterns derived from a CSV upload — replaces any existing patterns for the user */
    save: protectedProcedure
      .input(
        z.object({
          patterns: z.array(
            z.object({
              patternType: z.enum(["LONG_FAILURE", "SHORT_FAILURE", "FOMO_ENTRY", "PANIC_SELL"]),
              confidence: z.number().int().min(0).max(100),
              description: z.string(),
              action: z.string(),
              tradeCount: z.number().int().min(0),
              totalWins: z.number().int().min(0),
              totalLosses: z.number().int().min(0),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveUserPatterns(userId, input.patterns);
        return { success: true, count: input.patterns.length };
      }),

    /** Load all persisted patterns for the current user */
    list: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const rows = await db.getUserPatterns(userId);
      return rows.map((r) => ({
        type: r.patternType as "LONG_FAILURE" | "SHORT_FAILURE" | "FOMO_ENTRY" | "PANIC_SELL",
        confidence: r.confidence,
        description: r.description,
        action: r.action as "INVERT_LONG" | "INVERT_SHORT" | "WAIT",
        tradeCount: r.tradeCount,
        totalWins: r.totalWins,
        totalLosses: r.totalLosses,
        updatedAt: r.updatedAt,
      }));
    }),

    /** Clear all persisted patterns for the current user */
    clear: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user!.id;
      await db.deleteUserPatterns(userId);
      await db.deleteUserSymbolPatterns(userId);
      return { success: true };
    }),

    /** Save per-symbol patterns derived from a CSV upload */
    saveSymbols: protectedProcedure
      .input(
        z.object({
          patterns: z.array(
            z.object({
              symbol: z.string().max(32),
              tradeCount: z.number().int().min(0),
              wins: z.number().int().min(0),
              losses: z.number().int().min(0),
              winRate: z.number().int().min(0).max(100),
              avgPnlCents: z.number().int(),
              totalPnlCents: z.number().int(),
              dominantSide: z.string().max(8),
              bias: z.string().max(16),
              confidenceAdjustment: z.number().int().min(-25).max(25),
              action: z.string().max(16),
              summary: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        await db.saveUserSymbolPatterns(userId, input.patterns);
        return { success: true, count: input.patterns.length };
      }),

    /** Load all persisted symbol patterns for the current user */
    listSymbols: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const rows = await db.getUserSymbolPatterns(userId);
      return rows.map((r) => ({
        symbol: r.symbol,
        tradeCount: r.tradeCount,
        wins: r.wins,
        losses: r.losses,
        winRate: r.winRate,
        avgPnl: r.avgPnlCents / 100,
        totalPnl: r.totalPnlCents / 100,
        dominantSide: r.dominantSide as 'BUY' | 'SELL' | 'MIXED',
        bias: r.bias as 'LONG_BIAS' | 'SHORT_BIAS' | 'NEUTRAL',
        confidenceAdjustment: r.confidenceAdjustment,
        action: r.action as 'BOOST' | 'SUPPRESS' | 'NEUTRAL',
        summary: r.summary,
        updatedAt: r.updatedAt,
      }));
    }),

    /** Get the symbol pattern for a specific pair */
    getSymbol: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user!.id;
        const row = await db.getUserSymbolPattern(userId, input.symbol);
        if (!row) return null;
        return {
          symbol: row.symbol,
          tradeCount: row.tradeCount,
          wins: row.wins,
          losses: row.losses,
          winRate: row.winRate,
          avgPnl: row.avgPnlCents / 100,
          totalPnl: row.totalPnlCents / 100,
          dominantSide: row.dominantSide as 'BUY' | 'SELL' | 'MIXED',
          bias: row.bias as 'LONG_BIAS' | 'SHORT_BIAS' | 'NEUTRAL',
          confidenceAdjustment: row.confidenceAdjustment,
          action: row.action as 'BOOST' | 'SUPPRESS' | 'NEUTRAL',
          summary: row.summary,
          updatedAt: row.updatedAt,
        };
      }),
  }),

  // ─── Trade Direction Predictor ────────────────────────────────────────────────
  predict: router({
    /**
     * Predict whether a futures trade is likely to go UP or DOWN.
     * Fetches 15m/1H/4H/1D indicators, funding rate, and OI, then uses LLM
     * to produce a focused UP/DOWN verdict with probability and reasoning.
     */
    direction: publicProcedure
      .input(z.object({
        symbol: z.string(),                          // e.g. "BTCUSDT" or "BTC/USDT"
        side: z.enum(["long", "short"]),             // current position direction
        entryPrice: z.number(),                      // entry price
        currentPrice: z.number().optional(),         // optional — fetched live if omitted
        leverage: z.number().min(1).max(200),
        symbolPatternContext: z.string().optional(), // injected from user's trade history
        primaryTf: z.enum(["5m", "15m", "1h", "4h", "1d"]).optional().default("1h"),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const sym = input.symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").toUpperCase();

        // ── Indicator helpers ───────────────────────────────────────────────────────────────────────────────────
        const _pdH = { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0)" };
        const _pdOkxIv = (iv: string) => ({ "1m":"1m","5m":"5m","15m":"15m","1h":"1H","4h":"4H","1d":"1D" })[iv] ?? "1H";
        const _pdBvIv  = (iv: string) => ({ "1m":"1","5m":"5","15m":"15","1h":"60","4h":"240","1d":"D" })[iv] ?? "60";
        const _pdInst  = (s: string) => `${s.replace(/USDT$/, '')}-USDT-SWAP`;

        // ── Fetch live price if not provided ───────────────────────────────────────────────────────────────────────────────────
        let currentPrice = input.currentPrice ?? 0;
        if (!currentPrice) {
          try {
            // OKX primary
            const r = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${_pdInst(sym)}`, { headers: _pdH, timeout: 5000 });
            currentPrice = parseFloat(r.data?.data?.[0]?.last ?? "0");
          } catch { /* fall through */ }
          if (!currentPrice) {
            try {
              const r = await axios.get(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`, { headers: _pdH, timeout: 5000 });
              currentPrice = parseFloat(r.data?.result?.list?.[0]?.lastPrice ?? "0");
            } catch { /* proceed without */ }
          }
        }

        const fetchKlines = async (interval: string, limit = 150) => {
          // OKX primary
          try {
            const r = await axios.get(`https://www.okx.com/api/v5/market/candles?instId=${_pdInst(sym)}&bar=${_pdOkxIv(interval)}&limit=${limit}`, { headers: _pdH, timeout: 8000 });
            const list: string[][] = (r.data?.data ?? []).reverse();
            if (list.length > 5) return {
              closes: list.map(c => parseFloat(c[4])),
              highs:  list.map(c => parseFloat(c[2])),
              lows:   list.map(c => parseFloat(c[3])),
              volumes: list.map(c => parseFloat(c[5])),
            };
          } catch { /* fall through */ }
          // Bybit fallback
          const r = await axios.get(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${_pdBvIv(interval)}&limit=${limit}`, { headers: _pdH, timeout: 8000 });
          const list: string[][] = (r.data?.result?.list ?? []).reverse();
          if (!list.length) throw new Error(`No klines for ${sym} ${interval}`);
          return {
            closes: list.map(c => parseFloat(c[4])),
            highs:  list.map(c => parseFloat(c[2])),
            lows:   list.map(c => parseFloat(c[3])),
            volumes: list.map(c => parseFloat(c[5])),
          };
        };
        const calcRSI = (closes: number[]) => {
          const n = closes.length; const p = 14;
          let ag = 0, al = 0;
          for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i-1]; if (d > 0) ag += d; else al -= d; }
          ag /= p; al /= p;
          for (let i = p+1; i < n; i++) { const d = closes[i] - closes[i-1]; ag = (ag*(p-1)+(d>0?d:0))/p; al = (al*(p-1)+(d<0?-d:0))/p; }
          return al === 0 ? 100 : Math.round((100 - 100/(1+ag/al))*10)/10;
        };
        const calcEMA = (arr: number[], p: number) => { const k = 2/(p+1); let e = arr[0]; for (let i=1;i<arr.length;i++) e=arr[i]*k+e*(1-k); return e; };
        const calcBBPos = (closes: number[]) => {
          const slice = closes.slice(-20);
          const mid = slice.reduce((a,b)=>a+b,0)/20;
          const std = Math.sqrt(slice.reduce((a,b)=>a+(b-mid)**2,0)/20);
          return std === 0 ? 0 : Math.round(((closes[closes.length-1]-mid-2*std)/(4*std))*100);
        };

        // ── Fetch all data in parallel ────────────────────────────────────────
        const [r15m, r1h, r4h, r1d, rFunding, rOI] = await Promise.allSettled([
          fetchKlines("15m", 100),
          fetchKlines("1h", 150),
          fetchKlines("4h", 150),
          fetchKlines("1d", 60),
          axios.get(`https://www.okx.com/api/v5/public/funding-rate?instId=${_pdInst(sym)}`, { headers: _pdH, timeout: 5000 })
            .catch(() => axios.get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&limit=3`, { headers: _pdH, timeout: 5000 })),
          axios.get(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${_pdInst(sym)}&period=1H&limit=8`, { headers: _pdH, timeout: 5000 })
            .catch(() => axios.get(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=8`, { headers: _pdH, timeout: 5000 })),
        ]);

        const lines: string[] = [];
        const tfSummaries: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }[] = [];

        const processTF = (label: string, result: PromiseSettledResult<{ closes: number[]; volumes: number[] }>) => {
          if (result.status !== "fulfilled") return;
          const { closes, volumes } = result.value;
          const rsi = calcRSI(closes);
          const ema12 = calcEMA(closes, 12); const ema26 = calcEMA(closes, 26);
          const macd = ema12 - ema26;
          const macdBias = macd > 0 ? "bullish" : "bearish";
          const bbPos = calcBBPos(closes);
          const recentVol = volumes.slice(-5).reduce((a,b)=>a+b,0)/5;
          const prevVol   = volumes.slice(-10,-5).reduce((a,b)=>a+b,0)/5;
          const volTrend  = recentVol > prevVol*1.15 ? "rising" : recentVol < prevVol*0.85 ? "falling" : "stable";
          tfSummaries.push({ tf: label, rsi, macdBias, bbPos, volTrend });
          lines.push(`**${label}:** RSI ${rsi} | MACD ${macdBias} (${macd > 0 ? "+" : ""}${macd.toFixed(4)}) | BB ${bbPos}% | Volume ${volTrend}`);
        };

        processTF("15m", r15m);
        processTF("1H",  r1h);
        processTF("4H",  r4h);

        // 1D — no volume trend needed, just trend context
        if (r1d.status === "fulfilled") {
          const { closes } = r1d.value;
          const rsi1d = calcRSI(closes);
          const ema50 = calcEMA(closes, 50);
          const trend = closes[closes.length-1] > ema50 ? "above EMA50 (macro bullish)" : "below EMA50 (macro bearish)";
          lines.push(`**1D:** RSI ${rsi1d} | Price ${trend}`);
        }

        let fundingStr = "";
        if (rFunding.status === "fulfilled") {
          const okxFr = rFunding.value.data?.data?.[0]?.fundingRate;
          const fr = okxFr != null
            ? parseFloat(okxFr) * 100
            : parseFloat((rFunding.value.data?.result?.list ?? []).slice(-1)[0]?.fundingRate ?? "0") * 100;
          if (fr !== 0 || okxFr != null) {
            fundingStr = fr > 0 ? `+${fr.toFixed(4)}%` : `${fr.toFixed(4)}%`;
            const frBias = fr > 0.01 ? "longs paying (bearish pressure)" : fr < -0.01 ? "shorts paying (bullish pressure)" : "neutral";
            lines.push(`**Funding Rate:** ${fundingStr} — ${frBias}`);
          }
        }

        let oiStr = "";
        if (rOI.status === "fulfilled") {
          const okxOi: string[][] = rOI.value.data?.data ?? [];
          const oiData: { openInterest: string }[] = rOI.value.data?.result?.list ?? [];
          const oiArr = okxOi.length >= 2 ? okxOi.map(d => parseFloat(d[1])) : oiData.map(d => parseFloat(d.openInterest));
          if (oiArr.length >= 2) {
            const first = oiArr[0]; const last = oiArr[oiArr.length-1];
            const oiChg = ((last-first)/first*100).toFixed(2);
            oiStr = `${oiChg}% (8h)`;
            const oiBias = parseFloat(oiChg) > 2 ? "rising (new money entering)" : parseFloat(oiChg) < -2 ? "falling (positions closing)" : "stable";
            lines.push(`**Open Interest:** ${oiStr} — ${oiBias}`);
          }
        }

        const indicatorBlock = lines.length > 0 ? lines.join("\n") : "Indicators unavailable.";
        const pnlPct = currentPrice && input.entryPrice
          ? ((currentPrice - input.entryPrice) / input.entryPrice * 100 * (input.side === "long" ? 1 : -1)).toFixed(2)
          : "N/A";

        const systemPrompt = `You are an elite crypto futures trader with 15+ years of experience. You specialise in short-term directional calls on perpetual futures. Your job is to give a clear, data-driven UP or DOWN verdict for a specific asset, based on multi-timeframe technical analysis, funding rate, and open interest. You are concise, direct, and always give a probability estimate. You never hedge excessively — you commit to a direction.`;

        const userPrompt = `Given the following data, predict whether ${sym} is more likely to go UP or DOWN over the next 4–24 hours.

**Trade Context:**
- Symbol: ${sym}
- Current Position: ${input.side.toUpperCase()}
- Entry Price: $${input.entryPrice}
- Current Price: ${currentPrice ? `$${currentPrice.toFixed(4)}` : "Unknown"}
- Leverage: ${input.leverage}x
- PnL vs entry: ${pnlPct}%
${input.symbolPatternContext ? `\n**User's Personal History on ${sym}:**\n${input.symbolPatternContext}\n` : ""}
**Live Market Indicators:**
${indicatorBlock}

Respond in this exact structured format:

**VERDICT: UP** or **VERDICT: DOWN**

**Probability:** XX% (e.g. "68% likely to go UP")

**Confidence:** HIGH / MEDIUM / LOW

**Key Reason (1 sentence):** [most important factor driving this call]

**Supporting Evidence:**
- [indicator 1 and what it says]
- [indicator 2 and what it says]
- [indicator 3 and what it says]

**Bull Scenario:** [what needs to happen for price to go UP]

**Bear Scenario:** [what needs to happen for price to go DOWN]

**Key Level to Watch:** $[price level] — [why it matters]

**Suggested Action for your ${input.side.toUpperCase()} position:** [HOLD / ADD / REDUCE / EXIT] — [one sentence reason]

Be direct. Commit to a direction. Do not say "it could go either way".`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: userPrompt },
            ],
          });
          const rawContent = response.choices?.[0]?.message?.content ?? "";
          const content = typeof rawContent === "string" ? rawContent : "";

          // Parse structured fields
          const verdictMatch     = content.match(/VERDICT:\s*(UP|DOWN)/i);
          const probMatch        = content.match(/Probability[:\s]*(\d+)%/i);
          const confidenceMatch  = content.match(/Confidence[:\s]*(HIGH|MEDIUM|LOW)/i);
          const keyReasonMatch   = content.match(/Key Reason[^:]*:\s*([^\n]+)/i);
          const keyLevelMatch    = content.match(/Key Level to Watch[:\s]*\$?([\d,]+\.?\d*)/i);
          const actionMatch      = content.match(/Suggested Action[^:]*:\s*(HOLD|ADD|REDUCE|EXIT)/i);

          return {
            success: true,
            verdict:      (verdictMatch?.[1]?.toUpperCase() ?? "UNKNOWN") as "UP" | "DOWN" | "UNKNOWN",
            probability:  probMatch    ? parseInt(probMatch[1]) : 50,
            confidence:   (confidenceMatch?.[1]?.toUpperCase() ?? "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
            keyReason:    keyReasonMatch?.[1]?.trim() ?? "",
            keyLevel:     keyLevelMatch ? parseFloat(keyLevelMatch[1].replace(",", "")) : null,
            suggestedAction: (actionMatch?.[1]?.toUpperCase() ?? "HOLD") as "HOLD" | "ADD" | "REDUCE" | "EXIT",
            analysis:     content,
            currentPrice,
            pnlPct:       parseFloat(pnlPct as string) || 0,
            indicators:   tfSummaries,
            fundingRate:  fundingStr,
            oiChange:     oiStr,
          };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message ?? "Prediction failed",
            verdict: "UNKNOWN" as const,
            probability: 50,
            confidence: "LOW" as const,
            keyReason: "",
            keyLevel: null,
            suggestedAction: "HOLD" as const,
            analysis: "",
            currentPrice,
            pnlPct: 0,
            indicators: [],
            fundingRate: "",
            oiChange: "",
          };
        }
      }),
  }),

  // ─── Futures Market Scanner ───────────────────────────────────────────────────
  scanner: router({
    /** Return all available perp symbols across all exchanges for autocomplete */
    getAllSymbols: publicProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const { pairs, exchangeCounts } = await fetchMultiExchangeUniverse();
        // Deduplicate by base symbol, track which exchanges each is on
        const symbolMap = new Map<string, { symbol: string; exchanges: string[]; volume: number }>();
        for (const p of pairs) {
          const existing = symbolMap.get(p.symbol);
          if (existing) {
            if (!existing.exchanges.includes(p.exchange)) existing.exchanges.push(p.exchange);
            existing.volume = Math.max(existing.volume, p.quoteVolume24h);
          } else {
            symbolMap.set(p.symbol, { symbol: p.symbol, exchanges: [p.exchange], volume: p.quoteVolume24h });
          }
        }
        let results = Array.from(symbolMap.values()).sort((a, b) => b.volume - a.volume);
        // Filter by search term if provided
        const search = input?.search?.toUpperCase().replace(/[\/-]/g, "").replace(/USDT$/, "").replace(/USDC$/, "");
        if (search && search.length > 0) {
          results = results.filter(r => r.symbol.includes(search));
        }
        return { symbols: results.slice(0, 200), exchangeCounts, totalPairs: pairs.length };
      }),

    /** Return which exchanges have a given symbol available for perp trading */
    getExchangesForSymbol: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        const exchanges = await getExchangesForSymbol(input.symbol);
        return { symbol: input.symbol, exchanges };
      }),

    /** Fetch available balance from a specific exchange for the current user */
    getExchangeBalance: publicProcedure
      .input(z.object({ exchange: z.enum(["binance", "bybit", "okx", "hyperliquid", "asterdex"]) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) return { success: false, availableBalance: "0", error: "Not authenticated" };
        const userId = ctx.user.id;

        try {
          if (input.exchange === "binance") {
            const keyData = await db.getBinanceApiKey(userId);
            if (!keyData) return { success: false, availableBalance: "0", error: "No API key" };
            const crypto = await import("crypto");
            const baseUrl = keyData.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
            const timestamp = Date.now();
            const qs = `timestamp=${timestamp}`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            const res = await axios.get(`${baseUrl}/fapi/v2/account?${qs}&signature=${sig}`, {
              headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000,
            });
            return { success: true, availableBalance: res.data?.availableBalance ?? "0", quoteCurrency: "USDT" };

          } else if (input.exchange === "bybit") {
            const keyData = await db.getCexApiKey(userId, "bybit");
            if (!keyData) return { success: false, availableBalance: "0", error: "No API key" };
            const crypto = await import("crypto");
            const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
            const ts = Date.now().toString();
            const recvWindow = "5000";
            const qs = `api_key=${keyData.apiKey}&recv_window=${recvWindow}&timestamp=${ts}`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            const res = await axios.get(`${baseUrl}/v5/account/wallet-balance?accountType=UNIFIED&${qs}&sign=${sig}`, { timeout: 10000 });
            const result = res.data?.result?.list?.[0];
            return { success: true, availableBalance: result?.totalAvailableBalance ?? "0", quoteCurrency: "USDT" };

          } else if (input.exchange === "okx") {
            const keyData = await db.getCexApiKey(userId, "okx");
            if (!keyData || !keyData.passphrase) return { success: false, availableBalance: "0", error: "No API key" };
            const crypto = await import("crypto");
            const timestamp = new Date().toISOString();
            const path = "/api/v5/account/balance";
            const prehash = timestamp + "GET" + path;
            const signature = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
            const res = await axios.get(`https://www.okx.com${path}`, {
              headers: {
                "OK-ACCESS-KEY": keyData.apiKey,
                "OK-ACCESS-SIGN": signature,
                "OK-ACCESS-TIMESTAMP": timestamp,
                "OK-ACCESS-PASSPHRASE": keyData.passphrase,
              },
              timeout: 10000,
            });
            const balData = res.data?.data?.[0];
            return { success: true, availableBalance: balData?.adjEq ?? balData?.totalEq ?? "0", quoteCurrency: "USDT" };

          } else if (input.exchange === "hyperliquid") {
            const key = await db.getHyperliquidKey(userId);
            if (!key) return { success: false, availableBalance: "0", quoteCurrency: "USDC", error: "No API key" };
            const res = await axios.post("https://api.hyperliquid.xyz/info", {
              type: "clearinghouseState", user: key.walletAddress,
            }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
            const marginSummary = res.data?.marginSummary ?? {};
            // Return accountValue (full equity) as availableBalance for position sizing
            return { success: true, availableBalance: marginSummary.accountValue ?? marginSummary.withdrawable ?? "0", quoteCurrency: "USDC" };

          } else if (input.exchange === "asterdex") {
            const keyData = await db.getCexApiKey(userId, "asterdex");
            if (!keyData) return { success: false, availableBalance: "0", error: "No API key" };
            const { parseAsterWalletCredentials, asterV3Get } = await import("./asterdexSigning");
            const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);
            if (isV3) {
              const balances = await asterV3Get("/fapi/v3/balance", {}, userAddress, signerAddress, privateKey);
              const usdt = (balances as any[]).find((b: any) => b.asset === "USDT");
              return { success: true, availableBalance: usdt?.availableBalance ?? "0", quoteCurrency: "USDT" };
            } else {
              const crypto = await import("crypto");
              const timestamp = Date.now();
              const qs = `timestamp=${timestamp}&recvWindow=5000`;
              const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
              const res = await axios.get(`https://fapi.asterdex.com/fapi/v2/balance?${qs}&signature=${sig}`, {
                headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000,
              });
              const usdt = (res.data as any[]).find((b: any) => b.asset === "USDT");
              return { success: true, availableBalance: usdt?.availableBalance ?? "0", quoteCurrency: "USDT" };
            }
          }
          return { success: false, availableBalance: "0", quoteCurrency: "USDT", error: "Unknown exchange" };
        } catch (err: any) {
          return { success: false, availableBalance: "0", error: err?.message ?? "Failed to fetch balance" };
        }
      }),

    /** Get per-symbol signal accuracy from verified signal history */
    symbolAccuracy: publicProcedure
      .query(async () => {
        const { getDb } = await import("./db");
        const database = await getDb();
        if (!database) return [];
        const { signalHistory } = await import("../drizzle/schema");
        const { sql } = await import("drizzle-orm");
        const allSignals = await database
          .select()
          .from(signalHistory)
          .where(
            sql`${signalHistory.outcome} IN ('hit_tp', 'hit_sl')`
          );
        // Aggregate per symbol
        const map = new Map<string, { wins: number; losses: number; totalConfidence: number; avgRR: number; count: number }>();
        for (const s of allSignals) {
          const existing = map.get(s.symbol) ?? { wins: 0, losses: 0, totalConfidence: 0, avgRR: 0, count: 0 };
          if (s.outcome === "hit_tp") existing.wins++;
          else existing.losses++;
          existing.totalConfidence += s.confidence;
          existing.avgRR += parseFloat(s.riskRewardRatio ?? "0");
          existing.count++;
          map.set(s.symbol, existing);
        }
        return Array.from(map.entries())
          .map(([symbol, data]) => ({
            symbol,
            wins: data.wins,
            losses: data.losses,
            total: data.count,
            winRate: Math.round((data.wins / data.count) * 100),
            avgConfidence: Math.round(data.totalConfidence / data.count),
            avgRR: (data.avgRR / data.count).toFixed(2),
          }))
          .sort((a, b) => b.total - a.total);
      }),

    /** 
     * AUTO mode: Scan all 4 exchanges, apply 5-layer confluence filter,
     * return the single highest-conviction setup available right now.
     */
    bestCoinNow: publicProcedure
      .input(z.object({
        symbolPatternContextMap: z.record(z.string(), z.string()).optional(),
        userId: z.string().optional(),
        primaryTf: z.enum(["5m", "15m", "1h", "4h", "1d"]).optional().default("1h"),
        badEntryFilter: z.enum(["hide", "deprioritize", "show"]).optional(),
        strategyPreference: z.enum(["ai_best_pick", "momentum_rsi"]).optional().default("ai_best_pick"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requestGrokVeto } = await import("./lib/grokVeto");
        const { computeValiditySeconds, formatValidityDuration } = await import("./lib/validityTimer");
        const { runSignalScan } = await import("./lib/signalEngine");

        // ── Fetch user inverse patterns from DB (server-side, not just LLM text) ──
        let userPatternsInput: import("./lib/signalEngine").UserPatternsInput | undefined;
        const userId = ctx.user?.id;
        if (userId) {
          const [globalPatterns, symbolPatterns] = await Promise.all([
            db.getUserPatterns(userId),
            db.getUserSymbolPatterns(userId),
          ]);
          if (globalPatterns.length > 0 || symbolPatterns.length > 0) {
            userPatternsInput = {
              globalPatterns: globalPatterns.map(p => ({
                patternType: p.patternType,
                confidence: p.confidence,
                action: p.action as 'INVERT_LONG' | 'INVERT_SHORT' | 'WAIT',
              })),
              symbolPatterns: symbolPatterns.map(p => ({
                symbol: p.symbol,
                confidenceAdjustment: p.confidenceAdjustment,
                action: p.action as 'BOOST' | 'SUPPRESS' | 'NEUTRAL',
                winRate: p.winRate,
                wins: p.wins,
                losses: p.losses,
                bias: p.bias,
                summary: p.summary,
              })),
            };
          }
        }

        // ── Step 1-3: Run enhanced signal scan with inverse protocol ──
        const scanResult = await runSignalScan(
          20,
          input.primaryTf ?? "1h",
          userPatternsInput,
          undefined,
          false,
          input.strategyPreference,
        );
        const best = scanResult.best;
        const strategySelection = scanResult.strategySelection;
        const sym = best.symbol;
        const totalPairs = scanResult.scannedCount;

        const runnerUps = scanResult.runnerUps.map(r => ({
          symbol: r.symbol, direction: r.direction,
          score: r.score, rsi1h: r.rsi,
        }));

        const listedOnExchanges = best.listedOn;
        // Determine best exchange for this trade based on volume
        let bestExchange = "bybit"; // default
        try {
          const { pairs } = await fetchMultiExchangeUniverse();
          const baseSym = sym.replace("USDT", "");
          const matchingPairs = pairs.filter(p => p.symbol === baseSym);
          if (matchingPairs.length > 0) {
            // Sort by 24h volume descending — highest liquidity = best execution
            matchingPairs.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
            bestExchange = matchingPairs[0].exchange;
          }
        } catch { /* fallback to bybit */ }
        const currentPrice = best.entryPrice;
        const atr1h = best.atr1h;

        const fundingStr = best.fundingRate !== 0
          ? `${(best.fundingRate * 100).toFixed(4)}% (${best.fundingRate > 0.0001 ? "longs paying" : "shorts paying"})`
          : "";
        const oiStr = best.oiTrend !== "stable"
          ? `OI ${best.oiTrend}`
          : "";

        // Use actual selected TF for indicator summaries
        const primaryTfLabel = (input.primaryTf ?? "1h").toUpperCase();
        const confirmTfLabel = input.primaryTf === "5m" ? "1m" : input.primaryTf === "15m" ? "5m" : input.primaryTf === "1h" ? "15m" : input.primaryTf === "4h" ? "1h" : "4h";
        const volTrendStr = best.oiTrend === "rising" ? "rising" : best.oiTrend === "falling" ? "falling" : "stable";
        const tfSummaries = [
          { tf: confirmTfLabel, rsi: best.rsi, macd: best.macdSignal, bbPos: best.bbPosition, ema: "—", volTrend: volTrendStr },
          { tf: primaryTfLabel, rsi: best.rsi, macd: best.macdSignal, bbPos: best.bbPosition, ema: "—", volTrend: volTrendStr },
        ];

        const accuracyFactors = (best.accuracyFactors ?? []).filter((factor): factor is string => typeof factor === "string");
        const badEntryFilterMode = input.badEntryFilter ?? "deprioritize";
        const grokVeto = await requestGrokVeto(sym, best.direction, accuracyFactors);
        const isFiltered = Boolean(grokVeto && badEntryFilterMode === "hide");
        const grokVetoWarning = Boolean(grokVeto && badEntryFilterMode === "deprioritize");
        const direction = best.direction;
        const baseEvidenceScore = best.rawEvidenceScore ?? best.confidence;
        const executionEvidenceScore = best.confidence;
        const confidence = (executionEvidenceScore >= 75
          ? "HIGH"
          : executionEvidenceScore >= 60
            ? "MEDIUM"
            : "LOW") as "HIGH" | "MEDIUM" | "LOW";
        const confluenceScore = best.compositeScore;
        const validitySeconds = computeValiditySeconds({
          atr1h,
          currentPrice,
          rsi1h: best.rsi,
          confidence,
          primaryTf: (input.primaryTf === "1d" ? "4h" : input.primaryTf) ?? "1h",
        });
        const analysis = [best.keyReason, ...accuracyFactors].filter(Boolean).join("\n");
        const signalResult = {
          success: true,
          symbol: sym,
          currentPrice,
          direction,
          confidence,
          isBadEntry: false,
          badEntryReason: null,
          isFiltered,
          filterReason: isFiltered && grokVeto
            ? `Grok veto cited engine factor: ${grokVeto.citedFactor}. ${grokVeto.reason}`
            : null,
          grokVeto,
          grokVetoWarning,
          entry: best.entryPrice,
          tp1: best.takeProfit,
          tp2: best.tp2,
          sl: best.stopLoss,
          rrTp1: best.riskReward.toFixed(2),
          rrTp2: (best.riskReward * 1.5).toFixed(2),
          confidenceNum: baseEvidenceScore,
          executionEvidenceScore,
          validity: formatValidityDuration(validitySeconds),
          validitySeconds,
          keyReason: best.keyReason ?? "",
          analysis,
          indicators: tfSummaries,
          fundingRate: fundingStr,
          oiChange: oiStr,
          atr: atr1h,
          confluenceScore,
          layer1Score: best.technicalScore,
          layer2Score: best.microstructureScore,
          layer3EntryQuality: best.volatilityScore >= 70 ? "good" as const : best.volatilityScore >= 50 ? "acceptable" as const : "poor" as const,
          longShortRatio: best.longShortRatio,
          cvdBias: best.cvdBias,
          orderBookImbalance: best.orderBookImbalance,
          technicalScore: best.technicalScore,
          microstructureScore: best.microstructureScore,
          volatilityScore: best.volatilityScore,
          patternType: best.patternType,
          strategyPreference: strategySelection.requested,
          strategyPreferenceApplied: strategySelection.applied,
          strategySelectionLabel: strategySelection.label,
          strategySelectionNote: strategySelection.note,
          vpBias: best.vpBias,
          vpScore: best.vpScore,
          priceVsPoc: best.priceVsPoc,
          sentimentLabel: best.sentimentLabel,
          sentimentBias: best.sentimentBias,
          fearGreedValue: best.fearGreedValue,
          fearGreedLabel: best.fearGreedLabel,
          isTrending: best.isTrending,
          trendingRank: best.trendingRank,
          entryQualityScore: best.entryQualityScore,
          entryQualityLabel: best.entryQualityLabel,
          marketStructureTrend: best.marketStructureTrend,
          liquiditySweep: best.liquiditySweep,
          fvgDetected: best.fvgDetected,
          rsiDivergence: best.rsiDivergence,
          adx: best.adx,
          vwapSignal: best.vwapSignal,
          candlePattern: best.candlePattern,
          nearFibLevel: best.nearFibLevel,
          accuracyFactors,
          runnerUps,
          totalPairsScanned: totalPairs,
          listedOnExchanges,
          bestExchange,
          exchangeCounts: {},
        };

        // A valid veto only marks the result hidden when the user's filter requests it.
        // Preserve every engine-owned signal field, including direction, prices, and confidence.
        if (isFiltered) return signalResult;

        // ── Auto-save signals ≥85% confidence for accountability tracking ──
        if (executionEvidenceScore >= 85) {
          const validityMs = validitySeconds * 1000;
          void (async () => {
            const { generateFeatures, getFeatureNames } = await import("./lib/featureEngine");
            const mlFeatures = await generateFeatures(sym);
            await db.saveSignal({
              symbol: sym, direction: direction as "LONG" | "SHORT",
              strategy: "5-layer-confluence",
              entryPrice: String(best.entryPrice),
              stopLoss: String(best.stopLoss),
              takeProfit: String(best.takeProfit),
              confidence: executionEvidenceScore,
              riskRewardRatio: best.riskReward.toFixed(2),
              expiresAt: new Date(Date.now() + validityMs),
              metadata: JSON.stringify({
                tp2: best.tp2, confluenceScore, keyReason: best.keyReason ?? "",
                listedOn: listedOnExchanges, timeframe: input.primaryTf ?? "1h",
                strategyPreference: strategySelection.requested,
                strategyPreferenceApplied: strategySelection.applied,
                strategySelectionLabel: strategySelection.label,
                inverseApplied: !!(userPatternsInput?.globalPatterns?.length || userPatternsInput?.symbolPatterns?.length),
                entryQualityLabel: best.entryQualityLabel,
                entryQualityScore: best.entryQualityScore,
                mlFeatures: getFeatureNames().map(name => mlFeatures[name] ?? 0),
              }),
            });
            const { notifyQualifiedHighConfidenceSignal } = await import("./lib/telegramBot");
            await notifyQualifiedHighConfidenceSignal({
              symbol: sym, direction: direction as "LONG" | "SHORT", entryPrice: String(best.entryPrice),
              takeProfit: String(best.takeProfit), stopLoss: String(best.stopLoss), confidence: executionEvidenceScore,
              entryQualityLabel: best.entryQualityLabel,
            });
          })().catch(error => console.warn("[Signal Engine] Failed to persist generation-time feature vector:", error));
        }

        return signalResult;

      }),

    /**
     * MANUAL mode: Deep-scan a specific coin through all 5 layers.
     */
        scanCoin: publicProcedure
      .input(z.object({
        symbol: z.string(),
        symbolPatternContext: z.string().optional(),
        primaryTf: z.enum(["5m", "15m", "1h", "4h", "1d"]).optional().default("1h"),
        badEntryFilter: z.enum(["hide", "deprioritize", "show"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requestGrokVeto } = await import("./lib/grokVeto");
        const { computeValiditySeconds, formatValidityDuration } = await import("./lib/validityTimer");
        const sym = input.symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").toUpperCase();

        // ── Fetch user inverse patterns from DB (server-side) ──
        let userPatternsInput: import("./lib/signalEngine").UserPatternsInput | undefined;
        const userId = ctx.user?.id;
        if (userId) {
          const [globalPatterns, symbolPatterns] = await Promise.all([
            db.getUserPatterns(userId),
            db.getUserSymbolPatterns(userId),
          ]);
          if (globalPatterns.length > 0 || symbolPatterns.length > 0) {
            userPatternsInput = {
              globalPatterns: globalPatterns.map(p => ({
                patternType: p.patternType,
                confidence: p.confidence,
                action: p.action as 'INVERT_LONG' | 'INVERT_SHORT' | 'WAIT',
              })),
              symbolPatterns: symbolPatterns.map(p => ({
                symbol: p.symbol,
                confidenceAdjustment: p.confidenceAdjustment,
                action: p.action as 'BOOST' | 'SUPPRESS' | 'NEUTRAL',
                winRate: p.winRate,
                wins: p.wins,
                losses: p.losses,
                bias: p.bias,
                summary: p.summary,
              })),
            };
          }
        }

        // Run targeted single-coin analysis using the new signal engine + inverse protocol
        const { runSingleCoinScan } = await import("./lib/signalEngine");
        const best = await runSingleCoinScan(sym, input.primaryTf ?? "1h", userPatternsInput);

        const currentPrice = best.entryPrice;
        const atr1h = best.atr1h;
        const fundingStr = best.fundingRate !== 0
          ? `${(best.fundingRate * 100).toFixed(4)}% (${best.fundingRate > 0.0001 ? "longs paying" : "shorts paying"})`
          : "";
        const oiStr = best.oiTrend !== "stable" ? `OI ${best.oiTrend}` : "";

        // Use actual selected TF for indicator summaries
        const primaryTfLabelScan = (input.primaryTf ?? "1h").toUpperCase();
        const confirmTfLabelScan = input.primaryTf === "5m" ? "1m" : input.primaryTf === "15m" ? "5m" : input.primaryTf === "1h" ? "15m" : input.primaryTf === "4h" ? "1h" : "4h";
        const volTrendScan = best.oiTrend === "rising" ? "rising" : best.oiTrend === "falling" ? "falling" : "stable";
        const tfSummaries = [
          { tf: confirmTfLabelScan, rsi: best.rsi, macd: best.macdSignal, bbPos: best.bbPosition, ema: "—", volTrend: volTrendScan },
          { tf: primaryTfLabelScan, rsi: best.rsi, macd: best.macdSignal, bbPos: best.bbPosition, ema: "—", volTrend: volTrendScan },
        ];

        const accuracyFactors = (best.accuracyFactors ?? []).filter((factor): factor is string => typeof factor === "string");
        const grokVeto = await requestGrokVeto(sym, best.direction, accuracyFactors);
        const badEntryFilterMode = input.badEntryFilter ?? "deprioritize";
        const isFiltered = Boolean(grokVeto && badEntryFilterMode === "hide");
        const grokVetoWarning = Boolean(grokVeto && badEntryFilterMode === "deprioritize");
        const confidenceNum = best.confidence;
        const confidence = (confidenceNum >= 75
          ? "HIGH"
          : confidenceNum >= 60
            ? "MEDIUM"
            : "LOW") as "HIGH" | "MEDIUM" | "LOW";
        const validitySeconds = computeValiditySeconds({
          atr1h,
          currentPrice,
          rsi1h: best.rsi,
          confidence,
          primaryTf: (input.primaryTf === "1d" ? "4h" : input.primaryTf) ?? "1h",
        });
        const analysis = [best.keyReason, ...accuracyFactors].filter(Boolean).join("\n");
        return {
          success: true,
          symbol: sym,
          currentPrice,
          direction: best.direction,
          confidence,
          confidenceNum,
          isBadEntry: false,
          badEntryReason: null,
          isFiltered,
          filterReason: isFiltered && grokVeto
            ? `Grok veto cited engine factor: ${grokVeto.citedFactor}. ${grokVeto.reason}`
            : null,
          grokVeto,
          grokVetoWarning,
          entry: best.entryPrice,
          tp1: best.takeProfit,
          tp2: best.tp2,
          sl: best.stopLoss,
          rrTp1: best.riskReward.toFixed(2),
          rrTp2: (best.riskReward * 1.5).toFixed(2),
          validity: formatValidityDuration(validitySeconds),
          validitySeconds,
          keyReason: best.keyReason ?? "",
          analysis,
          indicators: tfSummaries,
          fundingRate: fundingStr,
          oiChange: oiStr,
          atr: atr1h,
          confluenceScore: best.compositeScore,
          layer1Score: best.technicalScore,
          layer2Score: best.microstructureScore,
          layer3EntryQuality: best.volatilityScore >= 70 ? "good" as const : best.volatilityScore >= 50 ? "acceptable" as const : "poor" as const,
          longShortRatio: best.longShortRatio,
          cvdBias: best.cvdBias,
          orderBookImbalance: best.orderBookImbalance,
          technicalScore: best.technicalScore,
          microstructureScore: best.microstructureScore,
          volatilityScore: best.volatilityScore,
          patternType: best.patternType,
          vpBias: best.vpBias,
          vpScore: best.vpScore,
          priceVsPoc: best.priceVsPoc,
          sentimentLabel: best.sentimentLabel,
          sentimentBias: best.sentimentBias,
          fearGreedValue: best.fearGreedValue,
          fearGreedLabel: best.fearGreedLabel,
          isTrending: best.isTrending,
          trendingRank: best.trendingRank,
          entryQualityScore: best.entryQualityScore,
          entryQualityLabel: best.entryQualityLabel,
          marketStructureTrend: best.marketStructureTrend,
          liquiditySweep: best.liquiditySweep,
          fvgDetected: best.fvgDetected,
          rsiDivergence: best.rsiDivergence,
          adx: best.adx,
          vwapSignal: best.vwapSignal,
          candlePattern: best.candlePattern,
          nearFibLevel: best.nearFibLevel,
          accuracyFactors,
        };

      }),
    }),
    // ─── Scan History Router ─────────────────────────────────────────────────
  scanHistory: router({
    /** Save a scan result to history */
    save: publicProcedure
      .input(z.object({
        scanType: z.enum(["single", "best"]),
        symbol: z.string(),
        direction: z.enum(["LONG", "SHORT"]),
        confidence: z.string(),
        entryPrice: z.string().optional(),
        tp1: z.string().optional(),
        tp2: z.string().optional(),
        sl: z.string().optional(),
        riskReward: z.string().optional(),
        isBadEntry: z.boolean().optional(),
        currentPrice: z.string().optional(),
        analysis: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.id ?? 0;
        if (!userId) return { success: false };
        await db.saveScan({
          userId,
          scanType: input.scanType,
          symbol: input.symbol,
          direction: input.direction,
          confidence: input.confidence,
          entryPrice: input.entryPrice ?? null,
          tp1: input.tp1 ?? null,
          tp2: input.tp2 ?? null,
          sl: input.sl ?? null,
          riskReward: input.riskReward ?? null,
          isBadEntry: input.isBadEntry ? 1 : 0,
          currentPrice: input.currentPrice ?? null,
          analysis: input.analysis ?? null,
        });
        return { success: true };
      }),

    /** List the user's recent scan history */
    list: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).optional() }))
      .query(async ({ input, ctx }) => {
        const userId = ctx.user?.id ?? 0;
        if (!userId) return [];
        return db.listScans(userId, input.limit ?? 50);
      }),

    /** Clear all scan history for the user */
    clear: publicProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 0;
      if (!userId) return { success: false };
      await db.deleteScans(userId);
      return { success: true };
    }),
  }),

  // ─── Prediction History Router ────────────────────────────────────────────
  predictionHistory: router({
    /** Save a prediction result */
    save: publicProcedure
      .input(z.object({
        symbol: z.string(),
        side: z.enum(["long", "short"]),
        entryPrice: z.string(),
        leverage: z.number().int().min(1),
        verdict: z.string(),
        probability: z.number().int().min(0).max(100),
        confidence: z.string(),
        keyReason: z.string().optional(),
        suggestedAction: z.string().optional(),
        currentPrice: z.string().optional(),
        pnlPct: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.id ?? 0;
        if (!userId) return { success: false };
        await db.savePrediction({
          userId,
          symbol: input.symbol,
          side: input.side,
          entryPrice: input.entryPrice,
          leverage: input.leverage,
          verdict: input.verdict,
          probability: input.probability,
          confidence: input.confidence,
          keyReason: input.keyReason ?? null,
          suggestedAction: input.suggestedAction ?? null,
          currentPrice: input.currentPrice ?? null,
          pnlPct: input.pnlPct ?? null,
        });
        return { success: true };
      }),

    /** List the user's recent prediction history */
    list: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).optional() }))
      .query(async ({ input, ctx }) => {
        const userId = ctx.user?.id ?? 0;
        if (!userId) return [];
        return db.listPredictions(userId, input.limit ?? 50);
      }),

    /** Clear all prediction history for the user */
    clear: publicProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user?.id ?? 0;
      if (!userId) return { success: false };
      await db.deletePredictions(userId);
      return { success: true };
    }),
  }),

  // ─── Hyperliquid Router ───────────────────────────────────────────────────
  hyperliquid: router({

    /** Save (or replace) the user's Hyperliquid private key */
    saveKey: protectedProcedure
      .input(z.object({
        privateKey: z.string().min(1, "Private key is required"),
        label: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { privateKeyToAddress } = await import("./hyperliquidSigning");
        let walletAddress: string;
        // Normalise: strip 0x prefix if present
        const raw = input.privateKey.trim().startsWith("0x") ? input.privateKey.trim() : "0x" + input.privateKey.trim();
        const hexOnly = raw.slice(2);
        // Validate hex length (64 chars = 32 bytes)
        if (hexOnly.length !== 64 || !/^[0-9a-fA-F]+$/.test(hexOnly)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid private key — must be exactly 64 hex characters (32 bytes), with or without 0x prefix." });
        }
        try {
          walletAddress = privateKeyToAddress(raw);
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid private key — could not derive wallet address. Ensure it is a valid Ethereum/Hyperliquid private key." });
        }
        await db.saveHyperliquidKey({
          userId: ctx.user!.id,
          privateKey: raw,
          walletAddress,
          label: input.label,
        });
        return { success: true, walletAddress };
      }),

    /** Delete the user's stored Hyperliquid key */
    deleteKey: protectedProcedure
      .mutation(async ({ ctx }) => {
        await db.deleteHyperliquidKey(ctx.user!.id);
        return { success: true };
      }),

    /** Check if the user has a stored key */
    hasKey: publicProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) return { hasKey: false, walletAddress: null };
        const walletAddress = await db.getHyperliquidWalletAddress(ctx.user.id);
        return { hasKey: !!walletAddress, walletAddress };
      }),

    /** Verify the key by fetching account info from Hyperliquid */
	    verifyKey: protectedProcedure
	      .mutation(async ({ ctx }) => {
	        const walletAddress = await db.getHyperliquidWalletAddress(ctx.user!.id);
	        if (!walletAddress) throw new Error("No Hyperliquid key stored");
	        try {
	          const [res, spotRes] = await Promise.all([
	            axios.post("https://api.hyperliquid.xyz/info", { type: "clearinghouseState", user: walletAddress }, { headers: { "Content-Type": "application/json" }, timeout: 10000 }),
	            axios.post("https://api.hyperliquid.xyz/info", { type: "spotClearinghouseState", user: walletAddress }, { headers: { "Content-Type": "application/json" }, timeout: 10000 }),
	          ]);
	          const data = res.data;
	          const balanceSummary = resolveAutoTraderHyperliquidCollateral(data, spotRes.data);
	          const {
	            accountValue,
	            totalMarginUsed,
	            spotUsdcBalance,
	            totalAccountValue,
	            usesUnifiedAccountBalance,
	            availableTradingCollateral,
	          } = balanceSummary;
          const positions: Array<{ symbol: string; size: string; entryPx: string; unrealizedPnl: string; side: string }> = [];
          if (Array.isArray(data?.assetPositions)) {
            for (const ap of data.assetPositions) {
              const pos = ap?.position;
              if (!pos || parseFloat(pos.szi ?? "0") === 0) continue;
              positions.push({
                symbol: pos.coin ?? "UNKNOWN",
                size: pos.szi ?? "0",
                entryPx: pos.entryPx ?? "0",
                unrealizedPnl: pos.unrealizedPnl ?? "0",
                side: parseFloat(pos.szi ?? "0") > 0 ? "LONG" : "SHORT",
              });
            }
          }
          await db.markHyperliquidKeyVerified(ctx.user!.id);
	          void syncUserExchangeHistory(ctx.user!.id, "hyperliquid").catch((error) => {
	            console.error(`[ExchangeHistory] Hyperliquid post-verification import failed for user ${ctx.user!.id}:`, error);
	          });
	          return {
	            success: true,
	            accountValue,
	            totalMarginUsed,
	            spotUsdcBalance,
	            totalAccountValue,
	            usesUnifiedAccountBalance,
	            availableTradingCollateral,
	            positions,
	            walletAddress,
	            historyImportStarted: true,
	          };
	        } catch (err: any) {
	          const msg = err?.response?.data?.error ?? err?.message ?? "Verification failed";
	          return {
	            success: false,
	            error: msg,
	            accountValue: 0,
	            totalMarginUsed: 0,
	            spotUsdcBalance: 0,
	            totalAccountValue: 0,
	            usesUnifiedAccountBalance: false,
	            availableTradingCollateral: 0,
	            positions: [],
	            walletAddress,
	          };
        }
      }),

    /** Fetch live account state (balance + positions) */
	    getAccount: publicProcedure
	      .query(async ({ ctx }) => {
        if (!ctx.user) return null;
	        const walletAddress = await db.getHyperliquidWalletAddress(ctx.user.id);
	        if (!walletAddress) return null;
	        try {
	          const [res, spotRes] = await Promise.all([
	            axios.post("https://api.hyperliquid.xyz/info", { type: "clearinghouseState", user: walletAddress }, { headers: { "Content-Type": "application/json" }, timeout: 10000 }),
	            axios.post("https://api.hyperliquid.xyz/info", { type: "spotClearinghouseState", user: walletAddress }, { headers: { "Content-Type": "application/json" }, timeout: 10000 }),
	          ]);
	          const data = res.data;
	          const balanceSummary = resolveAutoTraderHyperliquidCollateral(data, spotRes.data);
          const positions: Array<{ symbol: string; size: string; entryPx: string; unrealizedPnl: string; side: string; leverage: string; markPrice: string }> = [];
          if (Array.isArray(data?.assetPositions)) {
            for (const ap of data.assetPositions) {
              const pos = ap?.position;
              if (!pos || parseFloat(pos.szi ?? "0") === 0) continue;
              const levObj = pos.leverage;
              const levVal = typeof levObj === "object" ? (levObj?.value ?? "1") : (levObj ?? "1");
              positions.push({
                symbol: pos.coin ?? "UNKNOWN",
                size: pos.szi ?? "0",
                entryPx: pos.entryPx ?? "0",
                unrealizedPnl: pos.unrealizedPnl ?? "0",
                side: parseFloat(pos.szi ?? "0") > 0 ? "LONG" : "SHORT",
                leverage: String(levVal),
                markPrice: pos.markPx ?? pos.entryPx ?? "0",
              });
            }
          }
	          return {
	            ...balanceSummary,
            positions,
	            walletAddress,
	          };
        } catch { return null; }
      }),

    /** Place a market or limit order on Hyperliquid */
    placeOrder: publicProcedure
      .input(z.object({
        symbol:     z.string(),          // e.g. "BTC" (Hyperliquid uses base asset, not BTCUSDT)
        isBuy:      z.boolean(),
        size:       z.number().positive(),
        price:      z.number().positive(), // for market: pass slippage-adjusted price
        orderType:  z.enum(["market", "limit"]).default("market"),
        reduceOnly: z.boolean().default(false),
        leverage:   z.number().min(1).max(100).default(10),
        takeProfit: z.number().positive().optional(),
        stopLoss:   z.number().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Authentication required");
        const key = await db.getHyperliquidKey(ctx.user.id);
        if (!key) throw new Error("No Hyperliquid key stored. Please add your wallet key in Exchange Setup.");

        const { signL1Action, buildOrderAction, buildLeverageAction, floatToWire } = await import("./hyperliquidSigning");

        // ── 1. Fetch asset meta to get asset index ────────────────────────────
        const metaRes = await axios.post("https://api.hyperliquid.xyz/info",
          { type: "meta" },
          { headers: { "Content-Type": "application/json" }, timeout: 10000 }
        );
        const universe: Array<{ name: string; szDecimals: number }> = metaRes.data?.universe ?? [];
        const assetIndex = universe.findIndex((a) => a.name.toUpperCase() === input.symbol.toUpperCase());
        if (assetIndex === -1) throw new Error(`Symbol "${input.symbol}" not found on Hyperliquid`);
        const szDecimals = universe[assetIndex].szDecimals ?? 4;

        const nonce = Date.now();

        // ── 2. Set leverage first ─────────────────────────────────────────────
        const levAction = buildLeverageAction(assetIndex, input.leverage);
        const levSig = await signL1Action(key.privateKey, levAction, null, nonce);
        await axios.post("https://api.hyperliquid.xyz/exchange", {
          action: levAction,
          nonce,
          signature: levSig,
        }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });

        // ── 3. Place the order ────────────────────────────────────────────────
        const orderNonce = nonce + 1;
        // For market orders: fetch live mark price and use 3% slippage for reliable fills
        let basePrice = input.price;
        if (input.orderType === "market") {
          try {
            const priceRes = await axios.post("https://api.hyperliquid.xyz/info",
              { type: "allMids" },
              { headers: { "Content-Type": "application/json" }, timeout: 5000 }
            );
            const mids: Record<string, string> = priceRes.data ?? {};
            const liveMid = parseFloat(mids[input.symbol.toUpperCase()] ?? "0");
            if (liveMid > 0) basePrice = liveMid;
          } catch { /* fallback to input.price */ }
        }
        const slippageFactor = input.isBuy ? 1.03 : 0.97; // 3% slippage for market orders
        const effectivePrice = input.orderType === "market" ? basePrice * slippageFactor : input.price;
        // Round size to szDecimals (Hyperliquid rejects orders with too many decimals)
        const roundedSize = parseFloat(input.size.toFixed(szDecimals));
        if (roundedSize <= 0) throw new Error(`Order size too small after rounding to ${szDecimals} decimals`);
        // Round price to 5 significant figures (Hyperliquid standard)
        const roundedPrice = parseFloat(effectivePrice.toPrecision(5));
        const orderAction = buildOrderAction({
          assetIndex,
          isBuy: input.isBuy,
          price: roundedPrice,
          size: roundedSize,
          reduceOnly: input.reduceOnly,
          tif: input.orderType === "market" ? "Ioc" : "Gtc",
        });
        const orderSig = await signL1Action(key.privateKey, orderAction, null, orderNonce);
        const orderRes = await axios.post("https://api.hyperliquid.xyz/exchange", {
          action: orderAction,
          nonce: orderNonce,
          signature: orderSig,
        }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });

        const response = orderRes.data;
        const status = response?.response?.data?.statuses?.[0];
        const filled = status?.filled;
        const error = status?.error;
        if (error) throw new Error(`Order rejected: ${error}`);

        // ── 4. Place TP/SL trigger orders if requested ──────────────────────
        const filledSize = filled?.totalSz ? parseFloat(filled.totalSz) : roundedSize;
        const tpSlResults: { tp?: string; sl?: string } = {};

        if (input.takeProfit && filledSize > 0) {
          try {
            const tpNonce = orderNonce + 1;
            const tpAction = {
              type: "order",
              orders: [{
                a: assetIndex,
                b: !input.isBuy, // TP closes position (opposite side)
                p: floatToWire(input.takeProfit),
                s: floatToWire(parseFloat(filledSize.toFixed(szDecimals))),
                r: true, // reduceOnly
                t: { trigger: { isMarket: true, triggerPx: floatToWire(input.takeProfit), tpsl: "tp" } },
              }],
              grouping: "na",
            };
            const tpSig = await signL1Action(key.privateKey, tpAction, null, tpNonce);
            const tpRes = await axios.post("https://api.hyperliquid.xyz/exchange", {
              action: tpAction, nonce: tpNonce, signature: tpSig,
            }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
            const tpStatus = tpRes.data?.response?.data?.statuses?.[0];
            tpSlResults.tp = tpStatus?.error ? `Failed: ${tpStatus.error}` : "Set";
          } catch (e: any) { tpSlResults.tp = `Error: ${e.message}`; }
        }

        if (input.stopLoss && filledSize > 0) {
          try {
            const slNonce = orderNonce + (input.takeProfit ? 2 : 1);
            const slAction = {
              type: "order",
              orders: [{
                a: assetIndex,
                b: !input.isBuy, // SL closes position (opposite side)
                p: floatToWire(input.stopLoss),
                s: floatToWire(parseFloat(filledSize.toFixed(szDecimals))),
                r: true, // reduceOnly
                t: { trigger: { isMarket: true, triggerPx: floatToWire(input.stopLoss), tpsl: "sl" } },
              }],
              grouping: "na",
            };
            const slSig = await signL1Action(key.privateKey, slAction, null, slNonce);
            const slRes = await axios.post("https://api.hyperliquid.xyz/exchange", {
              action: slAction, nonce: slNonce, signature: slSig,
            }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
            const slStatus = slRes.data?.response?.data?.statuses?.[0];
            tpSlResults.sl = slStatus?.error ? `Failed: ${slStatus.error}` : "Set";
          } catch (e: any) { tpSlResults.sl = `Error: ${e.message}`; }
        }

        return {
          success: true,
          orderId: filled?.oid ?? null,
          avgPrice: filled?.avgPx ?? null,
          totalSz: filled?.totalSz ?? null,
          symbol: input.symbol,
          side: input.isBuy ? "LONG" : "SHORT",
          tpSlResults: (tpSlResults.tp || tpSlResults.sl) ? tpSlResults : undefined,
        };
      }),

  }),

  // ── Sentiment Router ─────────────────────────────────────────────────────
  sentiment: router({
    /** Get AI sentiment for a single perpetual futures pair */
    get: publicProcedure
      .input(
        z.object({
          symbol: z.string(),
          exchange: z.string().default("binance"),
        })
      )
      .query(async ({ input }) => {
        return fetchSentiment(input.symbol, input.exchange);
      }),

    /** Get AI sentiment for multiple pairs in one call */
    getBatch: publicProcedure
      .input(
        z.object({
          pairs: z.array(
            z.object({
              symbol: z.string(),
              exchange: z.string().default("binance"),
            })
          ).max(20),
        })
      )
      .query(async ({ input }) => {
        return fetchSentimentBatch(input.pairs);
      }),

    /** Get sentiment for top perpetual futures pairs (BTC, ETH, SOL, BNB, XRP) */
    getTopPairs: publicProcedure
      .query(async () => {
        const topPairs = [
          { symbol: "BTCUSDT", exchange: "binance" },
          { symbol: "ETHUSDT", exchange: "binance" },
          { symbol: "SOLUSDT", exchange: "binance" },
          { symbol: "BNBUSDT", exchange: "binance" },
          { symbol: "XRPUSDT", exchange: "binance" },
          { symbol: "DOGEUSDT", exchange: "binance" },
          { symbol: "ADAUSDT", exchange: "binance" },
          { symbol: "AVAXUSDT", exchange: "binance" },
        ];
        return fetchSentimentBatch(topPairs);
      }),
  }),

  // ── Gem Finder Enrichment Router ─────────────────────────────────────────
  gemFinder: router({
    /**
     * Enrich a list of gem symbols with volume profile + social sentiment.
     * Called after client-side gem scan to boost/adjust gem scores.
     */
    enrichGems: publicProcedure
      .input(z.object({
        symbols: z.array(z.string()).max(30),
      }))
      .mutation(async ({ input }) => {
        const results: Array<{
          symbol: string;
          sentimentScore: number;
          sentimentLabel: string;
          sentimentBias: "bullish" | "bearish" | "neutral";
          fearGreedValue: number;
          fearGreedLabel: string;
          isTrending: boolean;
          trendingRank: number | null;
          vpBias: "bullish" | "bearish" | "neutral";
          vpScore: number;
          poc: number;
          vah: number;
          val: number;
          priceVsPoc: "above" | "below" | "at";
          sentimentBoost: number; // -10 to +10 gem score adjustment
        }> = [];

        // Process in batches of 5 to avoid rate limits
        const BATCH = 5;
        for (let i = 0; i < input.symbols.length; i += BATCH) {
          const batch = input.symbols.slice(i, i + BATCH);
          const batchResults = await Promise.allSettled(
            batch.map(async (rawSym) => {
              const sym = rawSym.replace("/", "").replace("-PERP", "").toUpperCase();
              // Fetch sentiment and klines in parallel (OKX primary, Bybit fallback)
              const _gmInst = (s: string) => `${s.replace(/USDT$/, '')}-USDT-SWAP`;
              const _gmH = { "User-Agent": "Mozilla/5.0 (compatible; InverseIQ/1.0)" };
              const [sentiment, klinesRes] = await Promise.allSettled([
                fetchSocialSentiment(sym),
                axios.get(`https://www.okx.com/api/v5/market/candles?instId=${_gmInst(sym)}&bar=1H&limit=100`, { timeout: 7000, headers: _gmH })
                  .catch(() => axios.get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=60&limit=100`, { timeout: 7000, headers: _gmH })),
              ]);

              const sent = sentiment.status === "fulfilled" ? sentiment.value : null;

              // Compute VP from klines (handle both OKX and Bybit formats)
              let vpResult: { poc: number; vah: number; val: number; vpBias: "bullish" | "bearish" | "neutral"; vpScore: number; priceVsPoc: "above" | "below" | "at" } = { poc: 0, vah: 0, val: 0, vpBias: "neutral", vpScore: 50, priceVsPoc: "at" };
              if (klinesRes.status === "fulfilled") {
                // OKX: data[] reversed; Bybit: result.list[] needs reverse
                const rawOkx: string[][] = klinesRes.value.data?.data ?? [];
                const rawBybit: string[][] = klinesRes.value.data?.result?.list ?? [];
                const list = rawOkx.length >= 10 ? [...rawOkx].reverse() : [...rawBybit].reverse();
                if (list.length >= 10) {
                  const candles = list.map(c => ({
                    ts: Number(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
                    low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]),
                  }));
                  vpResult = computeVolumeProfile(candles, 50);
                }
              }

              // Sentiment boost: trending + bullish = +10, bearish = -5
              let sentimentBoost = 0;
              if (sent) {
                if (sent.sentimentBias === "bullish") sentimentBoost += 5;
                else if (sent.sentimentBias === "bearish") sentimentBoost -= 5;
                if (sent.isTrending) sentimentBoost += 5;
                if (sent.fearGreedValue >= 75) sentimentBoost += 3; // extreme greed = momentum
                else if (sent.fearGreedValue <= 25) sentimentBoost -= 3; // extreme fear = caution
              }
              if (vpResult.vpBias === "bullish") sentimentBoost += 3;
              else if (vpResult.vpBias === "bearish") sentimentBoost -= 3;

              return {
                symbol: rawSym,
                sentimentScore: sent?.sentimentScore ?? 50,
                sentimentLabel: sent?.sentimentLabel ?? "Neutral",
                sentimentBias: sent?.sentimentBias ?? "neutral",
                fearGreedValue: sent?.fearGreedValue ?? 50,
                fearGreedLabel: sent?.fearGreedLabel ?? "Neutral",
                isTrending: sent?.isTrending ?? false,
                trendingRank: sent?.trendingRank ?? null,
                vpBias: vpResult.vpBias,
                vpScore: vpResult.vpScore,
                poc: vpResult.poc,
                vah: vpResult.vah,
                val: vpResult.val,
                priceVsPoc: vpResult.priceVsPoc,
                sentimentBoost: Math.max(-15, Math.min(15, sentimentBoost)),
              };
            })
          );
          for (const r of batchResults) {
            if (r.status === "fulfilled") results.push(r.value);
          }
          if (i + BATCH < input.symbols.length) await new Promise(res => setTimeout(res, 150));
        }
        return results;
      }),

    /** Save user's gem alert notification preferences */
    saveAlertPreferences: protectedProcedure
      .input(z.object({
        minConfidence: z.number().min(50).max(100),
        enableEmail: z.boolean(),
        enableTelegram: z.boolean(),
        enableBrowser: z.boolean(),
        telegramChatId: z.string().optional(),
        scanIntervalMinutes: z.number().min(30).max(1440),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveGemAlertPreferences(ctx.user.id, {
          minConfidence: input.minConfidence,
          enableEmail: input.enableEmail ? 1 : 0,
          enableTelegram: input.enableTelegram ? 1 : 0,
          enableBrowser: input.enableBrowser ? 1 : 0,
          notifyEmail: null,
          telegramChatId: input.telegramChatId ?? null,
          scanIntervalMinutes: input.scanIntervalMinutes,
        });
        return { success: true };
      }),

        /** Get user's gem alert notification preferences */
    getAlertPreferences: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await db.getGemScanSettings(ctx.user.id);
        // Auto-populate telegramChatId from main telegramSettings if not set
        if (settings && !settings.telegramChatId) {
          const tgSettings = await db.getTelegramSettings(ctx.user.id);
          if (tgSettings?.chatId && tgSettings.isVerified) {
            (settings as any).telegramChatId = tgSettings.chatId;
          }
        }
        return settings;
      }),
    /** Send a test alert to verify email/Telegram configuration */
    sendTestAlert: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      const settings = await db.getGemScanSettings(userId);
      if (!settings) {
        return { success: false, error: "No alert preferences saved yet. Save your preferences first." };
      }

      const testMessage = `🧪 InverseIQ Test Alert\n\nThis is a test notification from your Gem Finder alert settings.\n\nIf you received this, your notification channels are configured correctly!\n\n⏰ ${new Date().toISOString()}`;
      const results: string[] = [];

      // Test Email
      if (settings.enableEmail === 1) {
        try {
          const { notifyOwner } = await import("./_core/notification");
          const sent = await notifyOwner({ title: "🧪 InverseIQ Test Alert", content: testMessage });
          results.push(sent ? "✅ Email sent" : "❌ Email failed");
        } catch (e: any) {
          results.push(`❌ Email error: ${e.message}`);
        }
      }

      // Test Telegram
      if (settings.enableTelegram === 1 && settings.telegramChatId) {
        try {
          const botToken = ENV.telegramBotToken;
          if (botToken) {
            const tgRes = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: settings.telegramChatId,
              text: testMessage,
              parse_mode: "Markdown",
            });
            results.push(tgRes.data?.ok ? "✅ Telegram sent" : "❌ Telegram failed");
          } else {
            results.push("❌ Telegram bot token not configured");
          }
        } catch (e: any) {
          results.push(`❌ Telegram error: ${e.message}`);
        }
      }

      if (results.length === 0) {
        return { success: false, error: "No notification channels are enabled" };
      }

      const allSuccess = results.every(r => r.startsWith("✅"));
      return { success: allSuccess, details: results.join(", "), error: allSuccess ? undefined : results.filter(r => r.startsWith("❌")).join(", ") };
    }),
  }),

  // ─── Active Trades Router ──────────────────────────────────────────────────
  activeTrades: router({
    /** Mark a signal as "I took this trade" and create an active trade entry */
    take: protectedProcedure
      .input(z.object({
        signalId: z.number().optional(),
        symbol: z.string(),
        direction: z.enum(["LONG", "SHORT"]),
        entryPrice: z.string(),
        takeProfit: z.string(),
        stopLoss: z.string(),
        takeProfit2: z.string().optional(),
        exchange: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tradeId = await db.createActiveTrade({
          userId: ctx.user.id,
          signalId: input.signalId ?? null,
          symbol: input.symbol,
          direction: input.direction,
          entryPrice: input.entryPrice,
          takeProfit: input.takeProfit,
          stopLoss: input.stopLoss,
          takeProfit2: input.takeProfit2 ?? null,
          exchange: input.exchange ?? null,
          status: "open",
          currentPnlPct: "0",
          lastPrice: input.entryPrice,
          lastCheckedAt: new Date(),
          warningsSent: 0,
          slWarned: 0,
          closedPrice: null,
          closedAt: null,
        });
        // Also mark signal as trade taken if signalId provided
        if (input.signalId) {
          await db.markSignalTradeTaken(input.signalId, input.exchange ?? "manual");
        }
        return { success: true, tradeId };
      }),

    /** Get all open trades for the current user */
    getOpen: protectedProcedure.query(async ({ ctx }) => {
      return db.getOpenTrades(ctx.user.id);
    }),

    /** Get all trades (including closed) for the current user */
    getAll: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        return db.getAllTrades(ctx.user.id, input?.limit ?? 50);
      }),

    /** Manually close a trade — also fires a reduce-only order on the exchange if possible */
    close: protectedProcedure
      .input(z.object({
        tradeId: z.number(),
        status: z.enum(["closed_tp", "closed_sl", "closed_manual"]),
        closedPrice: z.string(),
        /** If true, also submit a reduce-only close order on the exchange */
        closeOnExchange: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        // First mark the trade as closed in DB
        await db.closeTrade(input.tradeId, input.status, input.closedPrice);

        // If user wants to close on exchange, attempt reduce-only order
        if (!input.closeOnExchange) return { success: true, exchangeClosed: false };

        // Fetch the trade details to know symbol, direction, exchange
        const openTrades = await db.getAllTrades(ctx.user.id, 200);
        const trade = openTrades.find(t => t.id === input.tradeId);
        if (!trade || !trade.exchange) return { success: true, exchangeClosed: false, reason: "No exchange info" };

        const exchange = trade.exchange.toLowerCase();
        const symbol = trade.symbol;
        const closeSide = trade.direction === "LONG" ? "SELL" : "BUY"; // opposite side to close
        const closePrice = parseFloat(input.closedPrice);

        try {
          if (exchange === "binance") {
            const keyData = await db.getBinanceApiKey(ctx.user.id);
            if (!keyData) return { success: true, exchangeClosed: false, reason: "No Binance key" };
            const crypto = await import("crypto");
            const baseUrl = keyData.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
            const cleanSymbol = symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "") + "USDT";
            // Get current position size from Binance
            const ts = Date.now();
            const posQs = `symbol=${cleanSymbol}&timestamp=${ts}`;
            const posSig = crypto.createHmac("sha256", keyData.apiSecret).update(posQs).digest("hex");
            const posRes = await axios.get(`${baseUrl}/fapi/v2/positionRisk?${posQs}&signature=${posSig}`, {
              headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000,
            });
            const pos = (posRes.data ?? []).find((p: any) => p.symbol === cleanSymbol && parseFloat(p.positionAmt) !== 0);
            if (!pos) return { success: true, exchangeClosed: false, reason: "No open position found" };
            const qty = Math.abs(parseFloat(pos.positionAmt));
            // Place reduce-only market close
            const closeTs = Date.now();
            const qs = `symbol=${cleanSymbol}&side=${closeSide}&type=MARKET&quantity=${qty}&reduceOnly=true&timestamp=${closeTs}`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            await axios.post(`${baseUrl}/fapi/v1/order?${qs}&signature=${sig}`, {}, {
              headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000,
            });
            return { success: true, exchangeClosed: true, exchange: "binance" };

          } else if (exchange === "bybit") {
            const keyData = await db.getCexApiKey(ctx.user.id, "bybit");
            if (!keyData) return { success: true, exchangeClosed: false, reason: "No Bybit key" };
            const crypto = await import("crypto");
            const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
            const cleanSymbol = symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "") + "USDT";
            // Get current position size
            const ts = Date.now().toString();
            const posQs = `api_key=${keyData.apiKey}&category=linear&symbol=${cleanSymbol}&recv_window=5000&timestamp=${ts}`;
            const posSig = crypto.createHmac("sha256", keyData.apiSecret).update(posQs).digest("hex");
            const posRes = await axios.get(`${baseUrl}/v5/position/list?${posQs}&sign=${posSig}`, { timeout: 10000 });
            const pos = (posRes.data?.result?.list ?? []).find((p: any) => parseFloat(p.size) > 0);
            if (!pos) return { success: true, exchangeClosed: false, reason: "No open position found" };
            const qty = pos.size;
            const bybitSide = closeSide === "BUY" ? "Buy" : "Sell";
            const closeTs = Date.now().toString();
            const body = JSON.stringify({ category: "linear", symbol: cleanSymbol, side: bybitSide, orderType: "Market", qty, reduceOnly: true });
            const signStr = closeTs + keyData.apiKey + "5000" + body;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(signStr).digest("hex");
            await axios.post(`${baseUrl}/v5/order/create`, body, {
              headers: { "X-BAPI-API-KEY": keyData.apiKey, "X-BAPI-TIMESTAMP": closeTs, "X-BAPI-SIGN": sig, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" },
              timeout: 10000,
            });
            return { success: true, exchangeClosed: true, exchange: "bybit" };

          } else if (exchange === "okx") {
            const keyData = await db.getCexApiKey(ctx.user.id, "okx");
            if (!keyData || !keyData.passphrase) return { success: true, exchangeClosed: false, reason: "No OKX key" };
            const crypto = await import("crypto");
            const baseUrl = "https://www.okx.com";
            const cleanSymbol = symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "") + "-USDT-SWAP";
            // Get current position
            const ts = new Date().toISOString();
            const path = `/api/v5/account/positions?instId=${cleanSymbol}`;
            const prehash = ts + "GET" + path;
            const posSig = crypto.createHmac("sha256", keyData.apiSecret).update(prehash).digest("base64");
            const posRes = await axios.get(`${baseUrl}${path}`, {
              headers: { "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": posSig, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": keyData.passphrase },
              timeout: 10000,
            });
            const pos = (posRes.data?.data ?? []).find((p: any) => parseFloat(p.pos) !== 0);
            if (!pos) return { success: true, exchangeClosed: false, reason: "No open position found" };
            const qty = Math.abs(parseFloat(pos.pos)).toString();
            const okxSide = closeSide.toLowerCase() as "buy" | "sell";
            const closeTs = new Date().toISOString();
            const closeBody = JSON.stringify({ instId: cleanSymbol, tdMode: "cross", side: okxSide, ordType: "market", sz: qty, reduceOnly: true });
            const closePrehash = closeTs + "POST" + "/api/v5/trade/order" + closeBody;
            const closeSig = crypto.createHmac("sha256", keyData.apiSecret).update(closePrehash).digest("base64");
            await axios.post(`${baseUrl}/api/v5/trade/order`, closeBody, {
              headers: { "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": closeSig, "OK-ACCESS-TIMESTAMP": closeTs, "OK-ACCESS-PASSPHRASE": keyData.passphrase, "Content-Type": "application/json" },
              timeout: 10000,
            });
            return { success: true, exchangeClosed: true, exchange: "okx" };

          } else if (exchange === "hyperliquid") {
            const key = await db.getHyperliquidKey(ctx.user.id);
            if (!key) return { success: true, exchangeClosed: false, reason: "No Hyperliquid key" };
            const { signL1Action, buildOrderAction } = await import("./hyperliquidSigning");
            // Get asset index
            const metaRes = await axios.post("https://api.hyperliquid.xyz/info", { type: "meta" }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
            const universe: Array<{ name: string }> = metaRes.data?.universe ?? [];
            const baseAsset = symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "").toUpperCase();
            const assetIndex = universe.findIndex(a => a.name.toUpperCase() === baseAsset);
            if (assetIndex === -1) return { success: true, exchangeClosed: false, reason: "Symbol not found on Hyperliquid" };
            // Get current position size
            const stateRes = await axios.post("https://api.hyperliquid.xyz/info", { type: "clearinghouseState", user: key.walletAddress }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
            const positions = stateRes.data?.assetPositions ?? [];
            const pos = positions.find((p: any) => p.position?.coin?.toUpperCase() === baseAsset && parseFloat(p.position?.szi ?? "0") !== 0);
            if (!pos) return { success: true, exchangeClosed: false, reason: "No open position found" };
            const posSize = Math.abs(parseFloat(pos.position.szi));
            const isBuy = closeSide === "BUY";
            // Use IOC market order with 1% slippage for close
            const slippageFactor = isBuy ? 1.01 : 0.99;
            const effectivePrice = closePrice * slippageFactor;
            const nonce = Date.now();
            const orderAction = buildOrderAction({ assetIndex, isBuy, price: effectivePrice, size: posSize, reduceOnly: true, tif: "Ioc" });
            const orderSig = await signL1Action(key.privateKey, orderAction, null, nonce);
            const orderRes = await axios.post("https://api.hyperliquid.xyz/exchange", { action: orderAction, nonce, signature: orderSig }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });
            const status = orderRes.data?.response?.data?.statuses?.[0];
            if (status?.error) return { success: true, exchangeClosed: false, reason: `Hyperliquid: ${status.error}` };
            return { success: true, exchangeClosed: true, exchange: "hyperliquid" };

          } else if (exchange === "asterdex") {
            const keyData = await db.getCexApiKey(ctx.user.id, "asterdex");
            if (!keyData) return { success: true, exchangeClosed: false, reason: "No AsterDEX key" };
            const { parseAsterWalletCredentials, asterV3Post } = await import("./asterdexSigning");
            const { userAddress, signerAddress, privateKey, isV3 } = parseAsterWalletCredentials(keyData.apiKey, keyData.apiSecret);
            if (!isV3) return { success: true, exchangeClosed: false, reason: "AsterDEX V1 close not supported" };
            const cleanSymbol = symbol.replace(/[\/\-]/g, "").replace(/-PERP/i, "").replace(/:USDT/i, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "").toUpperCase();
            // Get position from AsterDEX
            const positions = await asterV3Post("/fapi/v3/positionRisk", { symbol: cleanSymbol }, userAddress, signerAddress, privateKey);
            const pos = (Array.isArray(positions) ? positions : []).find((p: any) => parseFloat(p.positionAmt ?? "0") !== 0);
            if (!pos) return { success: true, exchangeClosed: false, reason: "No open position found" };
            const qty = Math.abs(parseFloat(pos.positionAmt));
            const asterSide = closeSide as "BUY" | "SELL";
            await asterV3Post("/fapi/v3/order", { symbol: cleanSymbol, side: asterSide, type: "MARKET", quantity: qty, reduceOnly: "true" }, userAddress, signerAddress, privateKey);
            return { success: true, exchangeClosed: true, exchange: "asterdex" };
          }

          return { success: true, exchangeClosed: false, reason: "Unsupported exchange" };
        } catch (err: any) {
          console.error(`[activeTrades.close] Exchange close failed for ${exchange}:`, err?.message);
          return { success: true, exchangeClosed: false, reason: err?.message ?? "Exchange close failed" };
        }
      }),

    /** Get current market price for open trades (for live P&L) */
    refreshPrices: protectedProcedure.mutation(async ({ ctx }) => {
      const openTrades = await db.getOpenTrades(ctx.user.id);
      const results: { id: number; lastPrice: string; pnlPct: string }[] = [];
      for (const trade of openTrades) {
        try {
          const res = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${trade.symbol}-USDT-SWAP`);
          const price = parseFloat(res.data?.data?.[0]?.last ?? "0");
          if (price > 0) {
            const entry = parseFloat(trade.entryPrice);
            const pnl = trade.direction === "LONG"
              ? ((price - entry) / entry * 100).toFixed(2)
              : ((entry - price) / entry * 100).toFixed(2);
            await db.updateTradePrice(trade.id, price.toString(), pnl);
            results.push({ id: trade.id, lastPrice: price.toString(), pnlPct: pnl });
          }
        } catch { /* skip failed fetches */ }
      }
      return results;
    }),
  }),

  // ─── Telegram Settings Router ─────────────────────────────────────────────
  telegram: router({
    /** Get current user's Telegram settings */
    get: protectedProcedure.query(async ({ ctx }) => {
      return db.getTelegramSettings(ctx.user.id);
    }),

    /** Generate a verification code and save initial settings */
    generateCode: protectedProcedure.mutation(async ({ ctx }) => {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await db.saveTelegramSettings(ctx.user.id, {
        chatId: "",
        verificationCode: code,
        isVerified: 0,
        isActive: 0,
      });
      return { code };
    }),

    /** Verify Telegram connection (called by bot webhook) */
    verify: publicProcedure
      .input(z.object({
        code: z.string(),
        chatId: z.string(),
        username: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Find user with this verification code
        const dbConn = await (await import("./db")).getDb();
        if (!dbConn) return { success: false, error: "DB unavailable" };
        const { telegramSettings: tgTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await dbConn.select().from(tgTable).where(eq(tgTable.verificationCode, input.code)).limit(1);
        if (!rows[0]) return { success: false, error: "Invalid code" };
        await dbConn.update(tgTable).set({
          chatId: input.chatId,
          username: input.username ?? null,
          isVerified: 1,
          isActive: 1,
          verificationCode: null,
        }).where(eq(tgTable.id, rows[0].id));
        return { success: true };
      }),

    /** Update Telegram alert preferences */
    updatePreferences: protectedProcedure
      .input(z.object({
        isActive: z.number().int().min(0).max(1).optional(),
        alertOnSlApproach: z.number().int().min(0).max(1).optional(),
        alertOnTpHit: z.number().int().min(0).max(1).optional(),
        alertOnMarketWarning: z.number().int().min(0).max(1).optional(),
        alertOnHighConfSignal: z.number().int().min(0).max(1).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveTelegramSettings(ctx.user.id, input);
        return { success: true };
      }),

    /** Disconnect Telegram */
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.saveTelegramSettings(ctx.user.id, {
        isActive: 0,
        isVerified: 0,
        chatId: "",
      });
      return { success: true };
    }),

    /** Send a test alert to verify the connection works */
    testAlert: protectedProcedure.mutation(async ({ ctx }) => {
      const settings = await db.getTelegramSettings(ctx.user.id);
      if (!settings || !settings.isVerified || !settings.chatId) {
        return { success: false, error: "Telegram not connected" };
      }
      const { sendTelegramMessage } = await import("./lib/telegramBot");
      const sent = await sendTelegramMessage(
        settings.chatId,
        "\u2705 <b>XRYPT.NET Test Alert</b>\n\nYour Telegram connection is working perfectly!\n\nYou will receive alerts for:\n\u2022 Stop loss warnings\n\u2022 Take profit notifications\n\u2022 Market condition changes\n\u2022 High-confidence signals",
      );
      return { success: sent, error: sent ? undefined : "Failed to send message — check bot token" };
    }),
  }),

  // ─── Market Alerts Router ─────────────────────────────────────────────────
  marketAlerts: router({
    /** Get active market alerts */
    getActive: publicProcedure.query(async () => {
      return db.getActiveMarketAlerts();
    }),
  }),

  // ─── User Settings Router ──────────────────────────────────────────────────
  userSettings: router({
    /** Get user settings */
    get: protectedProcedure.query(async ({ ctx }) => {
      const { userSettings } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { getDb } = await import("./db");
      const database = await getDb();
      if (!database) return null;
      const rows = await database.select().from(userSettings).where(eq(userSettings.userId, ctx.user.id)).limit(1);
      return rows[0] || null;
    }),

    /** Save user settings */
    save: protectedProcedure
      .input(z.object({
        defaultExchange: z.string().optional(),
        defaultLeverage: z.number().min(1).max(125).optional(),
        defaultPositionSizePct: z.number().min(1).max(100).optional(),
        defaultOrderType: z.string().optional(),
        notifyEmail: z.string().optional(),
        telegramChatId: z.string().optional(),
        enableEmail: z.boolean().optional(),
        enableTelegram: z.boolean().optional(),
        enableBrowserNotifications: z.boolean().optional(),
        futuresAlertThreshold: z.number().min(50).max(99).optional(),
        spotAlertThreshold: z.number().min(50).max(99).optional(),
        autoStopLossPct: z.number().min(0).max(50).optional(),
        badEntryFilter: z.enum(["hide", "deprioritize", "show"]).optional(),
        asterBalanceAlertEnabled: z.boolean().optional(),
        asterBalanceAlertFloor: z.number().int().min(0).max(100_000_000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { userSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { getDb } = await import("./db");
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const existing = await database.select().from(userSettings).where(eq(userSettings.userId, ctx.user.id)).limit(1);
        const data = {
          defaultExchange: input.defaultExchange || "binance",
          defaultLeverage: input.defaultLeverage || 10,
          defaultPositionSizePct: input.defaultPositionSizePct || 10,
          defaultOrderType: input.defaultOrderType || "market",
          notifyEmail: input.notifyEmail || null,
          telegramChatId: input.telegramChatId || null,
          enableEmail: input.enableEmail ? 1 : 0,
          enableTelegram: input.enableTelegram ? 1 : 0,
          enableBrowserNotifications: input.enableBrowserNotifications ? 1 : 0,
          futuresAlertThreshold: input.futuresAlertThreshold || 75,
          spotAlertThreshold: input.spotAlertThreshold || 80,
          autoStopLossPct: input.autoStopLossPct || 0,
          badEntryFilter: input.badEntryFilter || "deprioritize",
          asterBalanceAlertEnabled: input.asterBalanceAlertEnabled ? 1 : 0,
          asterBalanceAlertFloor: input.asterBalanceAlertFloor || 0,
        };

        if (existing.length > 0) {
          await database.update(userSettings).set(data).where(eq(userSettings.userId, ctx.user.id));
        } else {
          await database.insert(userSettings).values({ userId: ctx.user.id, ...data });
        }
        return { success: true };
      }),
  }),

  // ── ML Engine ────────────────────────────────────────────────────────────────
  ml: router({
    status: protectedProcedure.query(async () => {
      const { getModelStatus } = await import("./lib/mlEngine");
      return getModelStatus();
    }),
    retrain: protectedProcedure.mutation(async () => {
      const { retrainModel } = await import("./lib/mlEngine");
      return retrainModel();
    }),
    predict: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .mutation(async ({ input }) => {
        const { generateFeatures } = await import("./lib/featureEngine");
        const { predictSignal } = await import("./lib/mlEngine");
        const features = await generateFeatures(input.symbol);
        const prediction = await predictSignal(features);
        return { prediction, featureCount: Object.keys(features).length };
      }),
    features: protectedProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        const { generateFeatures } = await import("./lib/featureEngine");
        const features = await generateFeatures(input.symbol);
        return { features, count: Object.keys(features).length };
      }),
  }),

  // ── Close Position (multi-exchange) ─────────────────────────────────────────
  closePosition: router({
    execute: protectedProcedure
      .input(z.object({
        symbol: z.string(),
        side: z.enum(["long", "short"]),
        size: z.union([z.string(), z.number()]),
        exchange: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? 1;
        const { symbol, side, size, exchange } = input;
        const closeSide = side === "long" ? "SELL" : "BUY";
        const sizeStr = String(size);

        try {
          if (exchange === "binance" || exchange === "Binance") {
            const keyData = await db.getBinanceApiKey(userId);
            if (!keyData) return { success: false, error: "No Binance API key configured" };
            const crypto = await import("crypto");
            const baseUrl = keyData.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
            const cleanSymbol = symbol.replace("/", "").replace("USDT", "") + "USDT";
            const timestamp = Date.now();
            const qs = `symbol=${cleanSymbol}&side=${closeSide}&type=MARKET&quantity=${sizeStr}&reduceOnly=true&timestamp=${timestamp}`;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(qs).digest("hex");
            const { default: axios } = await import("axios");
            await axios.post(`${baseUrl}/fapi/v1/order?${qs}&signature=${sig}`, {}, {
              headers: { "X-MBX-APIKEY": keyData.apiKey }, timeout: 10000
            });
            return { success: true, message: `Closed ${symbol} ${side} on Binance` };
          }

          if (exchange === "bybit" || exchange === "Bybit") {
            const keyData = await db.getCexApiKey(userId, "bybit");
            if (!keyData) return { success: false, error: "No Bybit API key configured" };
            const crypto = await import("crypto");
            const { default: axios } = await import("axios");
            const baseUrl = keyData.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
            const cleanSymbol = symbol.replace("/", "").replace("USDT", "") + "USDT";
            const ts = Date.now().toString();
            const body = JSON.stringify({
              category: "linear", symbol: cleanSymbol,
              side: closeSide === "BUY" ? "Buy" : "Sell",
              orderType: "Market", qty: sizeStr, reduceOnly: true,
            });
            const str = ts + keyData.apiKey + "5000" + body;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(str).digest("hex");
            await axios.post(`${baseUrl}/v5/order/create`, body, {
              headers: { "X-BAPI-API-KEY": keyData.apiKey, "X-BAPI-TIMESTAMP": ts, "X-BAPI-SIGN": sig, "X-BAPI-RECV-WINDOW": "5000", "Content-Type": "application/json" },
              timeout: 10000,
            });
            return { success: true, message: `Closed ${symbol} ${side} on Bybit` };
          }

          if (exchange === "okx" || exchange === "OKX") {
            const keyData = await db.getCexApiKey(userId, "okx");
            if (!keyData) return { success: false, error: "No OKX API key configured" };
            if (!keyData.passphrase) return { success: false, error: "OKX passphrase not set" };
            const crypto = await import("crypto");
            const { default: axios } = await import("axios");
            const cleanSymbol = symbol.replace("/", "-").replace("USDT", "") + "-USDT-SWAP";
            const ts = new Date().toISOString();
            const body = JSON.stringify({
              instId: cleanSymbol, tdMode: "cross",
              side: closeSide.toLowerCase(), ordType: "market",
              sz: sizeStr, reduceOnly: true,
            });
            const preSign = ts + "POST" + "/api/v5/trade/order" + body;
            const sig = crypto.createHmac("sha256", keyData.apiSecret).update(preSign).digest("base64");
            await axios.post("https://www.okx.com/api/v5/trade/order", body, {
              headers: {
                "OK-ACCESS-KEY": keyData.apiKey, "OK-ACCESS-SIGN": sig,
                "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": keyData.passphrase,
                "Content-Type": "application/json",
              }, timeout: 10000,
            });
            return { success: true, message: `Closed ${symbol} ${side} on OKX` };
          }

          if (exchange === "hyperliquid" || exchange === "Hyperliquid") {
            const key = await db.getHyperliquidKey(userId);
            if (!key) return { success: false, error: "No Hyperliquid key configured" };
            const { default: axios } = await import("axios");
            const { signL1Action, buildOrderAction } = await import("./hyperliquidSigning");
            // Fetch meta to get asset index
            const metaRes = await axios.post("https://api.hyperliquid.xyz/info",
              { type: "meta" },
              { headers: { "Content-Type": "application/json" }, timeout: 10000 }
            );
            const universe: Array<{ name: string }> = metaRes.data?.universe ?? [];
            const cleanSym = symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "");
            const assetIndex = universe.findIndex((a) => a.name.toUpperCase() === cleanSym.toUpperCase());
            if (assetIndex === -1) return { success: false, error: `Symbol "${cleanSym}" not found on Hyperliquid` };
            // Get current mark price for market close
            const ctxRes = await axios.post("https://api.hyperliquid.xyz/info",
              { type: "metaAndAssetCtxs" },
              { headers: { "Content-Type": "application/json" }, timeout: 10000 }
            );
            const assetCtxs = ctxRes.data?.[1] ?? [];
            const markPrice = parseFloat(assetCtxs[assetIndex]?.markPx ?? "0");
            if (markPrice <= 0) return { success: false, error: "Could not fetch mark price" };
            const isBuy = closeSide === "BUY";
            const slippageFactor = isBuy ? 1.01 : 0.99;
            const effectivePrice = markPrice * slippageFactor;
            const nonce = Date.now();
            const orderAction = buildOrderAction({
              assetIndex,
              isBuy,
              price: effectivePrice,
              size: parseFloat(sizeStr),
              reduceOnly: true,
              tif: "Ioc",
            });
            const orderSig = await signL1Action(key.privateKey, orderAction, null, nonce);
            const orderRes = await axios.post("https://api.hyperliquid.xyz/exchange", {
              action: orderAction, nonce, signature: orderSig,
            }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });
            const status = orderRes.data?.response?.data?.statuses?.[0];
            if (status?.error) return { success: false, error: `Order rejected: ${status.error}` };
            return { success: true, message: `Closed ${symbol} ${side} on Hyperliquid` };
          }

          // Unsupported exchange
          return { success: false, error: `Close position not supported for ${exchange} yet` };
        } catch (err: any) {
          const msg = err?.response?.data?.msg ?? err?.response?.data?.retMsg ?? err?.message ?? "Unknown error";
          return { success: false, error: msg };
        }
      }),
  }),

  // ── Auto Trader Router ───────────────────────────────────────────────────────
  autoTrader: router({
    /** Get current auto-trader status and settings */
    status: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user!.openId;
      return getAutoTraderStatus(userId);
    }),

    /** Private shadow metrics; never used automatically to raise a live score. */
    calibration: protectedProcedure
      .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
      .query(async ({ ctx, input }) => {
        const rows = await db.getSignalCalibrationObservations(
          ctx.user!.openId,
          input.days,
          SIGNAL_CALIBRATION_MODEL_VERSION,
        );
        const currentModelRows = filterSignalCalibrationRowsByModelVersion(rows);
        const summary = summarizeSignalCalibration(currentModelRows.map((row) => ({
          evidenceScore: row.evidenceScore,
          outcome: row.outcome,
        })));
        return {
          ...summary,
          modelVersion: SIGNAL_CALIBRATION_MODEL_VERSION,
          executionThreshold: 88,
          scoreAdjustmentEnabled: false,
          adjustmentStatus: summary.sampleSufficientForAdjustment ? "manual_review_required" : "collecting",
          note: "Observed evidence-score statistics are not a promised win probability and are never forced toward an 85 average.",
        } as const;
      }),

    /** Start the auto-trader loop */
    start: protectedProcedure
      .input(z.object({
        confirmation: autoTraderStartConfirmationSchema.shape.confirmation,
        marginPercent: z.literal(AUTO_TRADER_MARGIN_PERCENT).default(AUTO_TRADER_MARGIN_PERCENT),
        leverage: z.number().min(0).max(50).default(0), // 0 = auto (max available per asset)
        maxConcurrent: z.number().min(1).max(3).default(1),
        maxDailyTrades: z.number().min(0).max(100).default(10),
        cooldownSeconds: z.number().min(10).max(3600).default(60),
        minConfidence: z.number().min(88).max(100).default(88),
        exchange: z.literal("hyperliquid").default("hyperliquid"),
        telegramNotify: z.boolean().default(true),
        maxDrawdownPct: z.number().min(0).max(100).default(0),
        excludeSymbols: z.string().default(""),
        onlySymbols: z.string().default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.openId;
        const userDbId = ctx.user!.id;
        console.warn(`[AutoTrader] Confirmed live start requested by user ${userDbId}.`);

        // Save settings first
        await db.saveAutoTraderSettings(userId, {
          marginPercent: input.marginPercent,
          leverage: input.leverage,
          maxConcurrent: input.maxConcurrent,
          maxDailyTrades: input.maxDailyTrades,
          cooldownSeconds: input.cooldownSeconds,
          minConfidence: input.minConfidence,
          exchange: input.exchange,
          telegramNotify: input.telegramNotify,
          maxDrawdownPct: input.maxDrawdownPct,
          excludeSymbols: input.excludeSymbols || null,
          onlySymbols: input.onlySymbols || null,
        });

        // Prepare durable recovery before the worker can begin its first live
        // cycle. A stale persisted UID is recreated only after an explicit 404.
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const settings = await db.getAutoTraderSettings(userId);
        const recovery = await ensureAutoTraderRecoveryTask(settings?.recoveryTaskUid, {
          updateExisting: (taskUid) => updateHeartbeatJob(taskUid, { enable: true }, sessionToken),
          createReplacement: () => createHeartbeatJob({
            name: `auto-trader-recovery-${ctx.user!.id}`,
            cron: "0 * * * * *",
            path: "/api/scheduled/autoTraderRecovery",
            payload: { purpose: "auto-trader-health-recovery" },
            description: "Reconcile this user's persistent Hyperliquid auto-trader worker every minute.",
          }, sessionToken),
          persistTaskUid: (taskUid) => db.updateAutoTraderStatus(userId, { recoveryTaskUid: taskUid }),
        }).catch(async (error: any) => {
          const message = `Auto Trader was not started because durable recovery could not be enabled: ${error.message ?? "unknown error"}`.slice(0, 500);
          await db.updateAutoTraderStatus(userId, { isActive: false, currentStatus: "idle", lastWorkerError: message });
          throw new TRPCError({ code: "PRECONDITION_FAILED", message });
        });

        const startResult = await startAutoTrader({
          userId,
          userDbId,
          marginPercent: input.marginPercent,
          leverage: input.leverage,
          maxConcurrent: input.maxConcurrent,
          maxDailyTrades: input.maxDailyTrades,
          cooldownSeconds: input.cooldownSeconds,
          minConfidence: input.minConfidence,
          exchange: input.exchange,
          telegramNotify: input.telegramNotify,
          maxDrawdownPct: input.maxDrawdownPct,
          excludeSymbols: input.excludeSymbols ? input.excludeSymbols.split(",").map(s => s.trim()) : [],
          onlySymbols: input.onlySymbols ? input.onlySymbols.split(",").map(s => s.trim()) : [],
        });
        if (!startResult.success) return startResult;
        return { ...startResult, recoveryEnabled: true, recoveryTaskRecreated: recovery.recreated };
      }),

    /** Stop the auto-trader loop */
    stop: protectedProcedure
      .input(autoTraderStopInputSchema)
      .mutation(async ({ ctx }) => {
      const userId = ctx.user!.openId;
      const userDbId = ctx.user!.id;
      const settings = await db.getAutoTraderSettings(userId);
      console.warn(`[AutoTrader] Confirmed stop requested by user ${userDbId}.`);
      const result = await stopAutoTrader(userId, userDbId);
      if (settings?.recoveryTaskUid) {
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        try {
          await updateHeartbeatJob(settings.recoveryTaskUid, { enable: false }, sessionToken);
        } catch (error: any) {
          await db.updateAutoTraderStatus(userId, {
            lastWorkerError: `Trader stopped, but recovery job pause failed: ${error.message ?? "unknown error"}`.slice(0, 500),
          });
        }
      }
      return result;
      }),

    /** Update settings without restarting */
    updateSettings: protectedProcedure
      .input(z.object({
        marginPercent: z.literal(AUTO_TRADER_MARGIN_PERCENT).optional(),
        leverage: z.number().min(0).max(50).optional(), // 0 = auto (max available per asset)
        maxConcurrent: z.number().min(1).max(3).optional(),
        maxDailyTrades: z.number().min(0).max(100).optional(),
        cooldownSeconds: z.number().min(10).max(3600).optional(),
        minConfidence: z.number().min(88).max(100).optional(),
        telegramNotify: z.boolean().optional(),
        maxDrawdownPct: z.number().min(0).max(100).optional(),
        excludeSymbols: z.string().optional(),
        onlySymbols: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.openId;
        await db.saveAutoTraderSettings(userId, input as any);
        return { success: true };
      }),

    /** Get trade history */
    history: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user!.openId;
        return db.getAutoTraderHistory(userId, input.limit);
      }),
  }),
});
export type AppRouter = typeof appRouter;
