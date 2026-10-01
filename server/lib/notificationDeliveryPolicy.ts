export type NotificationEventType =
  | "signal_verified"
  | "signal_hit_tp"
  | "signal_hit_sl"
  | "signal_expired"
  | "market_update";

export type NotificationChannel = "browser" | "email" | "sms";
export const MARKET_UPDATE_DEDUPE_MS = 10 * 60 * 1000;

export type NotificationDeliveryPreferences = {
  enableBrowser?: number | boolean;
  enableEmail?: number | boolean;
  enableSMS?: number | boolean;
  notifyVerified?: number | boolean;
  notifyHitTP?: number | boolean;
  notifyHitSL?: number | boolean;
  notifyExpired?: number | boolean;
  notifyMarketUpdates?: number | boolean;
};

function enabled(value: number | boolean | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  return value === 1 || value === true;
}

export function isNotificationEventEnabled(
  type: NotificationEventType,
  prefs?: NotificationDeliveryPreferences | null,
): boolean {
  if (!prefs) return type !== "signal_expired";
  switch (type) {
    case "signal_verified": return enabled(prefs.notifyVerified, true);
    case "signal_hit_tp": return enabled(prefs.notifyHitTP, true);
    case "signal_hit_sl": return enabled(prefs.notifyHitSL, true);
    case "signal_expired": return enabled(prefs.notifyExpired, false);
    case "market_update": return enabled(prefs.notifyMarketUpdates, true);
  }
}

export function isNotificationChannelEnabled(
  channel: NotificationChannel,
  prefs?: NotificationDeliveryPreferences | null,
): boolean {
  if (!prefs) return channel === "browser";
  if (channel === "browser") return enabled(prefs.enableBrowser, true);
  if (channel === "email") return enabled(prefs.enableEmail, false);
  return enabled(prefs.enableSMS, false);
}

/** Prevent duplicate worker retries from sending the same market alert twice. */
export function isDuplicateMarketUpdate(
  latestCreatedAt: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (!latestCreatedAt) return false;
  const createdAt = new Date(latestCreatedAt).getTime();
  return Number.isFinite(createdAt) && now - createdAt < MARKET_UPDATE_DEDUPE_MS;
}
