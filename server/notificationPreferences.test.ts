import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

/**
 * Test suite for notification preferences API
 */

describe("Notification Preferences", () => {
  beforeAll(async () => {
    // Ensure database connection is available
    const database = await db.getDb();
    expect(database).toBeDefined();
  });

  it("should save notification preferences", async () => {
    const testPrefs = {
      userId: 0, // Global preferences
      email: "test@example.com",
      phone: "+1234567890",
      enableBrowser: 1,
      enableEmail: 1,
      enableSMS: 0,
      notifyHitTP: 1,
      notifyHitSL: 1,
      notifyExpired: 0,
      notifyVerified: 1,
      notifyMarketUpdates: 1,
      notifySystem: 1,
    };

    const result = await db.saveNotificationPreferences(testPrefs);
    expect(result).toBeDefined();
    expect(result?.success).toBe(true);
  });

  it("should retrieve notification preferences", async () => {
    const prefs = await db.getNotificationPreferences();
    
    expect(prefs).toBeDefined();
    if (prefs) {
      expect(prefs).toHaveProperty("enableBrowser");
      expect(prefs).toHaveProperty("enableEmail");
      expect(prefs).toHaveProperty("enableSMS");
      expect(prefs).toHaveProperty("notifyHitTP");
      expect(prefs).toHaveProperty("notifyHitSL");
    }
  });

  it("should update existing notification preferences", async () => {
    // First save
    await db.saveNotificationPreferences({
      userId: 0,
      email: "initial@example.com",
      enableEmail: 1,
    });

    // Then update
    const updateResult = await db.saveNotificationPreferences({
      userId: 0,
      email: "updated@example.com",
      enableEmail: 1,
      notifyHitTP: 0,
    });

    expect(updateResult).toBeDefined();
    expect(updateResult?.success).toBe(true);

    // Verify the update
    const prefs = await db.getNotificationPreferences();
    expect(prefs?.email).toBe("updated@example.com");
  });
});
