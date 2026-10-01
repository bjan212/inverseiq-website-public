export type NotificationPreferenceFlags = {
  enableBrowser?: number | boolean;
  notifyHitTP?: number | boolean;
  notifyHitSL?: number | boolean;
  notifyExpired?: number | boolean;
  notifyVerified?: number | boolean;
  notifyMarketUpdates?: number | boolean;
  notifySystem?: number | boolean;
};

function isEnabled(value: number | boolean | undefined, fallback = true): boolean {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1;
}

/** Returns whether a real-time toast/browser alert is enabled for this event type. */
export function shouldSurfaceNotification(
  type: string,
  preferences?: NotificationPreferenceFlags | null,
): boolean {
  if (!preferences) return true;
  switch (type) {
    case "signal_hit_tp":
    case "hit_tp":
      return isEnabled(preferences.notifyHitTP);
    case "signal_hit_sl":
    case "hit_sl":
      return isEnabled(preferences.notifyHitSL);
    case "signal_expired":
    case "expired":
      return isEnabled(preferences.notifyExpired, false);
    case "signal_verified":
    case "verified":
    case "signal_update":
      return isEnabled(preferences.notifyVerified);
    case "market_update":
      return isEnabled(preferences.notifyMarketUpdates);
    case "system":
      return isEnabled(preferences.notifySystem);
    default:
      return true;
  }
}

/** Browser push is opt-in; in-app toast eligibility is handled separately. */
export function shouldUseBrowserNotification(
  preferences?: NotificationPreferenceFlags | null,
): boolean {
  return isEnabled(preferences?.enableBrowser);
}
