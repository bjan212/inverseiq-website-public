import { describe, expect, it } from "vitest";
import { AUTO_TRADER_START_CONFIRMATION } from "@shared/const";
import { autoTraderStartConfirmationSchema } from "./lib/autoTraderStart";

describe("Auto Trader start confirmation", () => {
  it("rejects empty, stale, and incorrect start requests", () => {
    expect(autoTraderStartConfirmationSchema.safeParse(undefined).success).toBe(false);
    expect(autoTraderStartConfirmationSchema.safeParse({}).success).toBe(false);
    expect(autoTraderStartConfirmationSchema.safeParse({ confirmation: "start" }).success).toBe(false);
  });

  it("accepts only the explicit live-trader start confirmation", () => {
    expect(autoTraderStartConfirmationSchema.safeParse({
      confirmation: AUTO_TRADER_START_CONFIRMATION,
    }).success).toBe(true);
  });
});
