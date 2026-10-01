import { describe, it, expect } from "vitest";

describe("Telegram Bot Token Validation", () => {
  it("should validate the bot token by calling getMe", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.result).toBeDefined();
    expect(data.result.is_bot).toBe(true);
    console.log(`Bot username: @${data.result.username}`);
  }, 30000);
});
