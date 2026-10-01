import { describe, expect, it } from "vitest";
import { AUTO_TRADER_STOP_CONFIRMATION } from "@shared/const";
import { autoTraderStopInputSchema } from "./lib/autoTraderStop";

describe("Auto Trader stop confirmation", () => {
  it("rejects empty, stale, and incorrect stop requests", () => {
    expect(autoTraderStopInputSchema.safeParse(undefined).success).toBe(false);
    expect(autoTraderStopInputSchema.safeParse({}).success).toBe(false);
    expect(autoTraderStopInputSchema.safeParse({ confirmation: "stop" }).success).toBe(false);
  });

  it("accepts only the explicit live-trader stop confirmation", () => {
    expect(autoTraderStopInputSchema.safeParse({
      confirmation: AUTO_TRADER_STOP_CONFIRMATION,
    }).success).toBe(true);
  });
});
