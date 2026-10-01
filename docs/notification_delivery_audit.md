# Notification Delivery Preference Audit

This document records the preference model for every current notification emitter. It is intended to prevent a future channel from silently bypassing an end-user's chosen settings.

| Emitter | Delivery | Governing preference model | Enforcement |
|---|---|---|---|
| `signalVerifier.ts` | In-app, browser, email, SMS | Shared `notificationPreferences` | Delegates verified outcomes to `marketMonitor.sendMultiChannelNotification`; event type and browser/email/SMS flags are checked there. |
| `marketMonitor.ts` | In-app persistence, browser, email, SMS | Shared `notificationPreferences` | Checks `notifyHitTP`, `notifyHitSL`, `notifyExpired`, `notifyVerified`, and `notifyMarketUpdates` before dispatch; checks `enableBrowser`, `enableEmail`, and `enableSMS` per channel. |
| `NotificationContext.tsx` | Toast and browser push | Shared `notificationPreferences` | Filters incoming socket events by event type before surfacing a toast; uses `enableBrowser` before requesting permission or emitting a browser push. In-app notification records remain available in the notification centre. |
| `gemScannerServer.ts` | Telegram and email | Per-user `gemScanSettings` | Uses the gem-specific threshold and `enableTelegram` / `enableEmail` flags; this is intentionally separate from general trade-notification preferences. |
| High-confidence signal dispatch | Telegram | Per-user `telegramSettings` | Uses `alertOnHighConfSignal`, entry grade, confidence threshold, and the selected cooldown interval. |
| `autoTrader.ts` | Telegram lifecycle messages | Per-user auto-trader setting and linked Telegram chat | Auto-trader notifications are tied to the auto-trader's own `notifyTelegram` setting. The worker remains stopped until execution protections are separately validated. |
| Telegram command handlers | Telegram responses | User-initiated | These are direct responses to `/balances`, `/trades`, `/connect`, and settings commands, so alert preferences do not suppress them. |

## Guardrails

- General signal and market notifications must route through `sendMultiChannelNotification` rather than directly invoking email, SMS, or browser delivery.
- New background alert features must document their own preference model if it is intentionally separate from `notificationPreferences`.
- A disabled event type suppresses outbound browser, email, and SMS delivery. The persisted in-app record remains available for later review.
