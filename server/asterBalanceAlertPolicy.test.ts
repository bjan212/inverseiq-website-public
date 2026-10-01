import { describe, expect, it } from "vitest";
import { ASTER_BALANCE_ALERT_COOLDOWN_MS, shouldNotifyAsterBalanceFloor } from "./lib/asterBalanceAlertPolicy";

describe("AsterDEX balance alert policy", () => {
  it("alerts only for an enabled floor breach", () => {
    expect(shouldNotifyAsterBalanceFloor({ enabled: 1, floor: 500, balance: 499 })).toBe(true);
    expect(shouldNotifyAsterBalanceFloor({ enabled: 0, floor: 500, balance: 100 })).toBe(false);
    expect(shouldNotifyAsterBalanceFloor({ enabled: 1, floor: 500, balance: 500 })).toBe(false);
  });

  it("suppresses repeated breaches within the cooldown window", () => {
    const now = Date.now();
    expect(shouldNotifyAsterBalanceFloor({ enabled: 1, floor: 500, balance: 100, lastNotifiedAt: new Date(now - 1_000), now })).toBe(false);
    expect(shouldNotifyAsterBalanceFloor({ enabled: 1, floor: 500, balance: 100, lastNotifiedAt: new Date(now - ASTER_BALANCE_ALERT_COOLDOWN_MS), now })).toBe(true);
  });
});
