import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { verifyPendingSignals } from "../signalVerifier";
import { initializeWebSocket } from "../websocket";
import { monitorMarketConditions } from "../marketMonitor";
import { takeConfidenceSnapshot } from "../confidenceScheduler";
import { checkOpenTrades } from "../lib/tradeMonitor";
import { recoverActiveAutoTraders, recoverAutoTraderByTaskUid } from "../lib/autoTrader";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Telegram bot webhook — verifies user codes sent to the bot + handles inline button callbacks
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      // Handle inline keyboard button presses
      const { callback_query } = req.body || {};
      if (callback_query) {
        const { handleCallbackQuery, handleSetValue } = await import("../lib/telegramCallbackHandler");
        const data = callback_query.data || "";
        if (data === "balances:refresh") {
          const { answerCallbackQuery } = await import("../lib/telegramBot");
          const { handleBalancesCommand } = await import("../lib/telegramCommands");
          await answerCallbackQuery(callback_query.id, "Refreshing balances");
          await handleBalancesCommand(String(callback_query.message?.chat?.id ?? ""));
        } else if (data === "signal_alerts:toggle" || data.startsWith("signal_alerts:interval:")) {
          const { answerCallbackQuery } = await import("../lib/telegramBot");
          const { handleSignalAlertsCommand } = await import("../lib/telegramCommands");
          const chatId = String(callback_query.message?.chat?.id ?? "");
          const dbModule = await import("../db");
          const settings = await dbModule.getTelegramSettingsByChatId(chatId);
          if (!settings) {
            await answerCallbackQuery(callback_query.id, "Link your account with /start first");
          } else {
            if (data === "signal_alerts:toggle") {
              await dbModule.saveTelegramSettings(settings.userId, { alertOnHighConfSignal: settings.alertOnHighConfSignal ? 0 : 1 });
            } else {
              const minutes = Number(data.split(":").pop());
              if ([5, 15, 30, 60].includes(minutes)) {
                await dbModule.saveTelegramSettings(settings.userId, { highConfAlertIntervalMinutes: minutes });
              }
            }
            await answerCallbackQuery(callback_query.id, "Alert settings updated");
            await handleSignalAlertsCommand(chatId);
          }
        } else if (data.startsWith("set_sl_val:") || data.startsWith("set_tp_val:")) {
          await handleSetValue(callback_query);
        } else if (data.startsWith("close_exchange:") || data.startsWith("sl_exchange:") || data.startsWith("tp_exchange:") || data.startsWith("analyze_exchange:") || data.startsWith("confirm_exchange_close:") || data.startsWith("cancel_exchange:") || data.startsWith("noop:")) {
          const { handleExchangeCallback } = await import("../lib/telegramExchangeActions");
          await handleExchangeCallback(callback_query);
        } else {
          await handleCallbackQuery(callback_query);
        }
        return res.sendStatus(200);
      }

      const { message } = req.body || {};
      if (!message?.text || !message?.chat?.id) {
        return res.sendStatus(200);
      }
      const chatId = String(message.chat.id);
      const text = message.text.trim();
      const username = message.chat.username || message.from?.username || "";

      // Handle persistent keyboard button texts
      if (text === "📊 My Trades") {
        const { handleTradesCommand } = await import("../lib/telegramCommands");
        await handleTradesCommand(chatId);
        return res.sendStatus(200);
      }
      if (text === "💰 Balances") {
        const { handleBalancesCommand } = await import("../lib/telegramCommands");
        await handleBalancesCommand(chatId);
        return res.sendStatus(200);
      }
      if (text === "🔌 Connect Exchanges" || text === "/connect") {
        const { handleConnectExchangesCommand } = await import("../lib/telegramCommands");
        await handleConnectExchangesCommand(chatId);
        return res.sendStatus(200);
      }
      if (text === "🎯 Signal Alerts" || text === "/alerts") {
        const { handleSignalAlertsCommand } = await import("../lib/telegramCommands");
        await handleSignalAlertsCommand(chatId);
        return res.sendStatus(200);
      }
      if (text === "⚙️ Settings") {
        const { sendTelegramMessage } = await import("../lib/telegramBot");
        await sendTelegramMessage(chatId, `⚙️ <b>Settings</b>\n\nManage your alert preferences, API keys, and notification settings:\n\n🔗 <a href="https://xrypt.net/settings">Open Settings</a>`);
        return res.sendStatus(200);
      }
      if (text === "❓ Help") {
        const { sendTelegramMessage } = await import("../lib/telegramBot");
        await sendTelegramMessage(chatId, `📚 <b>XRYPT.NET Bot Commands</b>\n\n/trades — View open positions & manage them\n/balances — Check funds & margin across exchanges\n/connect — Securely connect exchanges on XRYPT.NET\n/alerts — Configure A/A+ 95%+ signal alerts\n/help — Show this help menu\n/start — Link your account\n\n<b>Security:</b> Never send API keys, secrets, passphrases, or wallet private keys in Telegram.\n\n🔗 <a href="https://xrypt.net/settings">Manage settings</a>`);
        return res.sendStatus(200);
      }

      // Handle /trades command — show all open positions
      if (text === "/trades") {
        const { handleTradesCommand } = await import("../lib/telegramCommands");
        await handleTradesCommand(chatId);
        return res.sendStatus(200);
      }

      // Handle /balances command
      if (text === "/balances") {
        const { handleBalancesCommand } = await import("../lib/telegramCommands");
        await handleBalancesCommand(chatId);
        return res.sendStatus(200);
      }

      if (text === "/connect") {
        const { handleConnectExchangesCommand } = await import("../lib/telegramCommands");
        await handleConnectExchangesCommand(chatId);
        return res.sendStatus(200);
      }

      if (text === "/alerts") {
        const { handleSignalAlertsCommand } = await import("../lib/telegramCommands");
        await handleSignalAlertsCommand(chatId);
        return res.sendStatus(200);
      }

      // Handle /help command
      if (text === "/help") {
        const { sendTelegramMessage } = await import("../lib/telegramBot");
        await sendTelegramMessage(chatId, `📚 <b>XRYPT.NET Bot Commands</b>\n\n/trades — View open positions & manage them\n/balances — Check funds & margin across exchanges\n/connect — Securely connect exchanges on XRYPT.NET\n/alerts — Configure A/A+ 95%+ signal alerts\n/help — Show this help menu\n/start — Link your account\n\n<b>Security:</b> Never send API keys, secrets, passphrases, or wallet private keys in Telegram.\n\n🔗 <a href="https://xrypt.net/settings">Manage settings</a>`);
        return res.sendStatus(200);
      }

      // Handle /start command (with optional deep-link code)
      if (text === "/start" || text.startsWith("/start ")) {
        const parts = text.split(" ");
        const deepLinkCode = parts[1]?.trim();

        // If a code was passed via deep link, auto-verify it
        if (deepLinkCode && /^[A-Z0-9]{6}$/i.test(deepLinkCode)) {
          const { getDb } = await import("../db");
          const dbConn = await getDb();
          if (!dbConn) return res.sendStatus(200);
          const { telegramSettings } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const rows = await dbConn.select().from(telegramSettings).where(eq(telegramSettings.verificationCode, deepLinkCode.toUpperCase())).limit(1);
          const { sendTelegramMessage } = await import("../lib/telegramBot");
          if (!rows[0]) {
            await sendTelegramMessage(chatId, "\u274C Invalid or expired code. Please generate a new one from your XRYPT.NET settings.");
            return res.sendStatus(200);
          }
          await dbConn.update(telegramSettings).set({
            chatId,
            username: username || null,
            isVerified: 1,
            isActive: 1,
            verificationCode: null,
          }).where(eq(telegramSettings.id, rows[0].id));
          // Also sync chat ID to gem scan settings for this user
          try {
            const { gemScanSettings } = await import("../../drizzle/schema");
            const gemRows = await dbConn.select().from(gemScanSettings).where(eq(gemScanSettings.userId, rows[0].userId)).limit(1);
            if (gemRows[0]) {
              await dbConn.update(gemScanSettings).set({ telegramChatId: chatId }).where(eq(gemScanSettings.userId, rows[0].userId));
            }
          } catch (e) { /* non-critical */ }
          const linkKeyboard = {
            keyboard: [
              [{ text: "📊 My Trades" }, { text: "💰 Balances" }],
              [{ text: "🔌 Connect Exchanges" }, { text: "🎯 Signal Alerts" }],
              [{ text: "⚙️ Settings" }, { text: "❓ Help" }],
            ],
            resize_keyboard: true,
            is_persistent: true,
          };
          await sendTelegramMessage(chatId, "✅ <b>Account linked successfully!</b>\n\nYou will now receive:\n• Trade warnings when approaching stop loss\n• Notifications when TP/SL is hit\n• Market condition alerts\n\nUse the menu buttons below 👇", "HTML", linkKeyboard);
          return res.sendStatus(200);
        }

        // Plain /start without code — check if already linked
        const { sendTelegramMessage } = await import("../lib/telegramBot");
        const { getTelegramSettingsByChatId } = await import("../db");
        const existingLink = await getTelegramSettingsByChatId(chatId);

        if (existingLink) {
          // Already linked — show welcome-back menu with persistent keyboard
          const menuKeyboard = {
            keyboard: [
              [{ text: "📊 My Trades" }, { text: "💰 Balances" }],
              [{ text: "🔌 Connect Exchanges" }, { text: "🎯 Signal Alerts" }],
              [{ text: "⚙️ Settings" }, { text: "❓ Help" }],
            ],
            resize_keyboard: true,
            is_persistent: true,
          };
          await sendTelegramMessage(
            chatId,
            `✅ <b>Account linked!</b>\n\nWelcome back. Your account is connected.\n\n<b>Quick Commands:</b>\n/trades — View & manage open positions\n/balances — Check funds across exchanges\n/help — Full command reference\n\nOr use the menu buttons below 👇`,
            "HTML",
            menuKeyboard
          );
        } else {
          // Not linked — show connect prompt WITH persistent keyboard
          const welcomeKeyboard = {
            keyboard: [
              [{ text: "📊 My Trades" }, { text: "💰 Balances" }],
              [{ text: "🔌 Connect Exchanges" }, { text: "🎯 Signal Alerts" }],
              [{ text: "⚙️ Settings" }, { text: "❓ Help" }],
            ],
            resize_keyboard: true,
            is_persistent: true,
          };
          await sendTelegramMessage(
            chatId,
            "👋 <b>Welcome to XRYPT.NET Trade Alerts!</b>\n\nTo link your account, paste your 6-character verification code here.\n\nGenerate a code at: Settings → Telegram Alerts\n\nUse the menu buttons below 👇",
            "HTML",
            welcomeKeyboard
          );
        }
        return res.sendStatus(200);
      }

      // Try to verify a code (6 alphanumeric chars)
      if (/^[A-Z0-9]{6}$/i.test(text)) {
        const { getDb } = await import("../db");
        const dbConn = await getDb();
        if (!dbConn) return res.sendStatus(200);
        const { telegramSettings } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await dbConn.select().from(telegramSettings).where(eq(telegramSettings.verificationCode, text.toUpperCase())).limit(1);
        const { sendTelegramMessage } = await import("../lib/telegramBot");
        if (!rows[0]) {
          await sendTelegramMessage(chatId, "\u274C Invalid code. Please generate a new one from your XRYPT.NET settings.");
          return res.sendStatus(200);
        }
        await dbConn.update(telegramSettings).set({
          chatId,
          username: username || null,
          isVerified: 1,
          isActive: 1,
          verificationCode: null,
        }).where(eq(telegramSettings.id, rows[0].id));
        // Also sync chat ID to gem scan settings for this user
        try {
          const { gemScanSettings } = await import("../../drizzle/schema");
          const gemRows = await dbConn.select().from(gemScanSettings).where(eq(gemScanSettings.userId, rows[0].userId)).limit(1);
          if (gemRows[0]) {
            await dbConn.update(gemScanSettings).set({ telegramChatId: chatId }).where(eq(gemScanSettings.userId, rows[0].userId));
          }
        } catch (e) { /* non-critical */ }
        const codeKeyboard = {
          keyboard: [
            [{ text: "📊 My Trades" }, { text: "💰 Balances" }],
            [{ text: "🔌 Connect Exchanges" }, { text: "🎯 Signal Alerts" }],
            [{ text: "⚙️ Settings" }, { text: "❓ Help" }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        };
        await sendTelegramMessage(chatId, "✅ <b>Account linked successfully!</b>\n\nYou will now receive:\n• Trade warnings when approaching stop loss\n• Notifications when TP/SL is hit\n• Market condition alerts\n\nUse the menu buttons below 👇", "HTML", codeKeyboard);
        return res.sendStatus(200);
      }

      // Unknown message — still show keyboard
      const { sendTelegramMessage: sendMsg } = await import("../lib/telegramBot");
      const fallbackKeyboard = {
        keyboard: [
          [{ text: "📊 My Trades" }, { text: "💰 Balances" }],
          [{ text: "🔌 Connect Exchanges" }, { text: "🎯 Signal Alerts" }],
          [{ text: "⚙️ Settings" }, { text: "❓ Help" }],
        ],
        resize_keyboard: true,
        is_persistent: true,
      };
      await sendMsg(chatId, "Commands: /trades — view positions | /help — all commands\n\nOr paste your 6-character code to link your account.\n\nUse the menu buttons below 👇", "HTML", fallbackKeyboard);
      return res.sendStatus(200);
    } catch (err) {
      console.error("[Telegram Webhook] Error:", err);
      return res.sendStatus(200);
    }
  });

  // Scheduled gem scan handler (Heartbeat cron)
  app.post("/api/scheduled/gemScan", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req) as any;
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const { runGemScan } = await import("../lib/gemScannerServer");
      const result = await runGemScan();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Scheduled GemScan] Error:", err);
      res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Scheduled ML model retraining (daily via Heartbeat)
  app.post("/api/scheduled/mlRetrain", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req) as any;
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const { retrainModel } = await import("../lib/mlEngine");
      const result = await retrainModel();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Scheduled ML Retrain] Error:", err);
      res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/scheduled/confidenceSnapshot", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      let user: any;
      try {
        user = await sdk.authenticateRequest(req) as any;
      } catch {
        return res.status(403).json({ error: "cron-only" });
      }
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const result = await takeConfidenceSnapshot();
      return res.json({ ok: true, taskUid: user.taskUid, ...result });
    } catch (err: any) {
      console.error("[Scheduled ConfidenceSnapshot] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Scheduled auto-trader recovery callback. The authenticated task UID is the
  // only identifier used to resolve the owning auto-trader settings row.
  app.post("/api/scheduled/signalVerify", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      let user: any;
      try {
        user = await sdk.authenticateRequest(req) as any;
      } catch {
        return res.status(403).json({ error: "cron-only" });
      }
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      await verifyPendingSignals();
      return res.json({ ok: true, taskUid: user.taskUid });
    } catch (err: any) {
      console.error("[Scheduled SignalVerify] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/scheduled/feedbackDelivery", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      let user: any;
      try {
        user = await sdk.authenticateRequest(req) as any;
      } catch {
        return res.status(403).json({ error: "cron-only" });
      }
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const { deliverQueuedFeedback, getFeedbackKeyFingerprint } = await import("../backendFeedback");
      const result = await deliverQueuedFeedback();
      return res.json({
        ok: true,
        taskUid: user.taskUid,
        feedbackKeyFingerprint: getFeedbackKeyFingerprint(),
        ...result,
      });
    } catch (err: any) {
      console.error("[Scheduled FeedbackDelivery] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/scheduled/marketMonitor", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      let user: any;
      try {
        user = await sdk.authenticateRequest(req) as any;
      } catch {
        return res.status(403).json({ error: "cron-only" });
      }
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      await monitorMarketConditions();
      return res.json({ ok: true, taskUid: user.taskUid });
    } catch (err: any) {
      console.error("[Scheduled MarketMonitor] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/scheduled/tradeMonitor", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      let user: any;
      try {
        user = await sdk.authenticateRequest(req) as any;
      } catch {
        return res.status(403).json({ error: "cron-only" });
      }
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      await checkOpenTrades();
      return res.json({ ok: true, taskUid: user.taskUid });
    } catch (err: any) {
      console.error("[Scheduled TradeMonitor] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/scheduled/autoTraderRecovery", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req) as any;
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await recoverAutoTraderByTaskUid(user.taskUid);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Scheduled AutoTraderRecovery] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // Initialize WebSocket server
    initializeWebSocket(server);
    
    console.log("[SignalVerifier] Awaiting durable /api/scheduled/signalVerify task");
    
    console.log("[MarketMonitor] Awaiting durable /api/scheduled/marketMonitor task");
    
    console.log("[ConfidenceScheduler] Awaiting durable /api/scheduled/confidenceSnapshot task");
    
    console.log("[TradeMonitor] Awaiting durable /api/scheduled/tradeMonitor task");

    // Reserved production hosting keeps this process alive. Development hot reloads
    // share the database but must never recover a live production trader, otherwise
    // two processes could scan or execute for the same account concurrently.
    if (process.env.NODE_ENV === "production") {
      recoverActiveAutoTraders("startup")
        .then(results => console.log(`[AutoTrader] Startup recovery processed ${results.length} active trader(s).`))
        .catch(error => console.error("[AutoTrader] Startup recovery failed:", error));
    } else {
      console.log("[AutoTrader] Development startup recovery disabled; production worker remains authoritative.");
    }
  });
}

startServer().catch(console.error);
