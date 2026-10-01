export type GemAlertPreferences = {
  isEnabled?: number | boolean | null;
  minConfidence?: number | null;
  enableTelegram?: number | boolean | null;
  enableEmail?: number | boolean | null;
  telegramChatId?: string | null;
};

export type GemAlertChannel = "telegram" | "email";

function enabled(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

/** Whether a user has opted into the requested gem-alert channel. */
export function isGemAlertChannelEnabled(
  settings: GemAlertPreferences,
  channel: GemAlertChannel,
): boolean {
  if (!enabled(settings.isEnabled)) return false;
  if (channel === "telegram") {
    return enabled(settings.enableTelegram) && Boolean(settings.telegramChatId);
  }
  return enabled(settings.enableEmail);
}

/** Whether a gem score meets a user's explicitly configured threshold. */
export function isGemAlertEligible(settings: GemAlertPreferences, gemScore: number): boolean {
  return enabled(settings.isEnabled) && gemScore >= (settings.minConfidence ?? 80);
}
