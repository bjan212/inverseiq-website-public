import { describe, expect, it } from "vitest";
import {
  shouldSurfaceNotification,
  shouldUseBrowserNotification,
} from "../client/src/lib/notificationPreferenceFilter";

describe("notification preference filter", () => {
  const preferences = {
    enableBrowser: 0,
    notifyHitTP: 1,
    notifyHitSL: 0,
    notifyExpired: 0,
    notifyVerified: 1,
    notifyMarketUpdates: 0,
    notifySystem: 1,
  };

  it("filters each event type according to its persisted preference", () => {
    expect(shouldSurfaceNotification("signal_hit_tp", preferences)).toBe(true);
    expect(shouldSurfaceNotification("signal_hit_sl", preferences)).toBe(false);
    expect(shouldSurfaceNotification("signal_expired", preferences)).toBe(false);
    expect(shouldSurfaceNotification("market_update", preferences)).toBe(false);
    expect(shouldSurfaceNotification("system", preferences)).toBe(true);
  });

  it("keeps safe defaults and honors the browser-channel opt-in", () => {
    expect(shouldSurfaceNotification("unknown", undefined)).toBe(true);
    expect(shouldUseBrowserNotification(preferences)).toBe(false);
    expect(shouldUseBrowserNotification({ enableBrowser: 1 })).toBe(true);
  });
});
