import { describe, expect, it } from "vitest";
import { isDuplicateMarketUpdate, isNotificationChannelEnabled, isNotificationEventEnabled, MARKET_UPDATE_DEDUPE_MS } from "./lib/notificationDeliveryPolicy";

describe("notification delivery policy", () => {
  const preferences = {
    enableBrowser: 1,
    enableEmail: 0,
    enableSMS: 0,
    notifyHitTP: 1,
    notifyHitSL: 0,
    notifyExpired: 0,
    notifyVerified: 1,
    notifyMarketUpdates: 0,
  };

  it("filters disabled event types before any channel dispatch", () => {
    expect(isNotificationEventEnabled("signal_hit_tp", preferences)).toBe(true);
    expect(isNotificationEventEnabled("signal_hit_sl", preferences)).toBe(false);
    expect(isNotificationEventEnabled("signal_expired", preferences)).toBe(false);
    expect(isNotificationEventEnabled("market_update", preferences)).toBe(false);
  });

  it("enforces each configured delivery channel independently", () => {
    expect(isNotificationChannelEnabled("browser", preferences)).toBe(true);
    expect(isNotificationChannelEnabled("email", preferences)).toBe(false);
    expect(isNotificationChannelEnabled("sms", preferences)).toBe(false);
  });

  it("suppresses duplicate market updates within the schedule window", () => {
    const now = Date.UTC(2026, 7, 24, 12, 0, 0);
    expect(isDuplicateMarketUpdate(new Date(now - MARKET_UPDATE_DEDUPE_MS + 1), now)).toBe(true);
    expect(isDuplicateMarketUpdate(new Date(now - MARKET_UPDATE_DEDUPE_MS), now)).toBe(false);
  });
});
