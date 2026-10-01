import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getAsterBalanceAlertUsers: vi.fn(),
  getCexApiKey: vi.fn(),
  saveNotification: vi.fn(),
  markAsterBalanceAlertDelivered: vi.fn(),
}));

const asterMocks = vi.hoisted(() => ({
  parseAsterWalletCredentials: vi.fn(),
  asterV3Get: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./asterdexSigning", () => asterMocks);
vi.mock("./websocket", () => ({ broadcastNotification: vi.fn() }));
vi.mock("./telegramBot", () => ({ sendTelegramMessage: vi.fn() }));
vi.mock("./emailService", () => ({ sendEmailNotification: vi.fn(), formatSignalEmail: vi.fn() }));
vi.mock("./smsService", () => ({ sendSMSNotification: vi.fn(), formatSignalSMS: vi.fn() }));

import { monitorAsterBalanceFloors } from "./marketMonitor";

describe("AsterDEX balance floor monitor", () => {
  let lastNotifiedAt: Date | null;

  beforeEach(() => {
    vi.clearAllMocks();
    lastNotifiedAt = null;
    dbMocks.getAsterBalanceAlertUsers.mockImplementation(async () => [{
      userId: 42,
      asterBalanceAlertEnabled: 1,
      asterBalanceAlertFloor: 500,
      asterBalanceAlertLastNotifiedAt: lastNotifiedAt,
      enableBrowserNotifications: false,
      enableTelegram: false,
    }]);
    dbMocks.getCexApiKey.mockResolvedValue({ apiKey: "wallet:signer", apiSecret: "private" });
    asterMocks.parseAsterWalletCredentials.mockReturnValue({
      userAddress: "0xwallet",
      signerAddress: "0xsigner",
      privateKey: "0xprivate",
      isV3: true,
    });
    asterMocks.asterV3Get.mockResolvedValue([{ asset: "USDT", balance: "499.50" }]);
    dbMocks.markAsterBalanceAlertDelivered.mockImplementation(async (_userId: number, deliveredAt = new Date()) => {
      lastNotifiedAt = deliveredAt;
    });
  });

  it("records one floor-breach notification and suppresses the immediate repeated durable run", async () => {
    await monitorAsterBalanceFloors();
    await monitorAsterBalanceFloors();

    expect(asterMocks.asterV3Get).toHaveBeenCalledTimes(2);
    expect(dbMocks.saveNotification).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "AsterDEX Balance Floor Alert",
      message: expect.stringContaining("$499.50"),
    }));
    expect(dbMocks.markAsterBalanceAlertDelivered).toHaveBeenCalledTimes(1);
  });
});
