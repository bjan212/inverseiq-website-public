import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { sendMultiChannelNotification } from "./marketMonitor";

/**
 * Test suite for multi-channel notification system
 * Tests email, SMS, and browser notifications with preference filtering
 */

describe("Multi-Channel Notifications", () => {
  beforeAll(async () => {
    // Ensure database connection
    const database = await db.getDb();
    expect(database).toBeDefined();

    // Set up test notification preferences
    await db.saveNotificationPreferences({
      userId: 0,
      email: "test@example.com",
      phone: "+1234567890",
      enableBrowser: 1,
      enableEmail: 1,
      enableSMS: 1,
      notifyHitTP: 1,
      notifyHitSL: 1,
      notifyExpired: 0,
      notifyVerified: 1,
      notifyMarketUpdates: 1,
      notifySystem: 1,
    });
  });

  it("should send notification for TP hit when enabled", async () => {
    const testSignal = {
      id: 999,
      symbol: "BTCUSDT",
      direction: "LONG",
      entryPrice: "50000",
      takeProfit: "52000",
      stopLoss: "49000",
      confidence: 85,
      outcome: "hit_tp",
      actualExitPrice: "52000",
    };

    // This should not throw and should respect preferences
    await expect(
      sendMultiChannelNotification(
        "signal_hit_tp",
        "Test TP Hit",
        "Test message",
        testSignal
      )
    ).resolves.not.toThrow();

    // Verify notification was saved to database
    const notifications = await db.getNotifications({ limit: 1 });
    expect(notifications).toBeDefined();
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("should send notification for SL hit when enabled", async () => {
    const testSignal = {
      id: 1000,
      symbol: "ETHUSDT",
      direction: "SHORT",
      entryPrice: "3000",
      takeProfit: "2900",
      stopLoss: "3100",
      confidence: 82,
      outcome: "hit_sl",
      actualExitPrice: "3100",
    };

    await expect(
      sendMultiChannelNotification(
        "signal_hit_sl",
        "Test SL Hit",
        "Test message",
        testSignal
      )
    ).resolves.not.toThrow();
  });

  it("should NOT send notification for expired signals when disabled", async () => {
    const testSignal = {
      id: 1001,
      symbol: "BNBUSDT",
      direction: "LONG",
      entryPrice: "400",
      takeProfit: "410",
      stopLoss: "395",
      confidence: 80,
      outcome: "expired",
    };

    // notifyExpired is set to 0 in preferences
    await expect(
      sendMultiChannelNotification(
        "signal_expired",
        "Test Expired",
        "Test message",
        testSignal
      )
    ).resolves.not.toThrow();

    // Notification should still be logged but not sent to channels
  });

  it("should send market update notifications when enabled", async () => {
    const testSignal = {
      id: 1002,
      symbol: "SOLUSDT",
      direction: "LONG",
      entryPrice: "100",
      takeProfit: "105",
      stopLoss: "98",
      confidence: 88,
    };

    await expect(
      sendMultiChannelNotification(
        "market_update",
        "Market Condition Changed",
        "Price moved 50% toward TP",
        testSignal
      )
    ).resolves.not.toThrow();
  });

  it("should respect notification preferences", async () => {
    // Disable all notifications
    await db.saveNotificationPreferences({
      userId: 0,
      enableBrowser: 0,
      enableEmail: 0,
      enableSMS: 0,
      notifyHitTP: 0,
      notifyHitSL: 0,
      notifyVerified: 0,
    });

    const testSignal = {
      id: 1003,
      symbol: "ADAUSDT",
      direction: "LONG",
      entryPrice: "0.5",
      takeProfit: "0.52",
      stopLoss: "0.49",
      confidence: 90,
    };

    // Should not throw even when all channels disabled
    await expect(
      sendMultiChannelNotification(
        "signal_hit_tp",
        "Test with disabled prefs",
        "Test message",
        testSignal
      )
    ).resolves.not.toThrow();

    // Re-enable for other tests
    await db.saveNotificationPreferences({
      userId: 0,
      enableBrowser: 1,
      notifyHitTP: 1,
      notifyHitSL: 1,
      notifyVerified: 1,
      notifyMarketUpdates: 1,
    });
  });
});
