import { describe, expect, it } from "vitest";
import {
  AUTO_TRADER_MARGIN_PERCENT,
  calculateAutoTraderMargin,
} from "../shared/autoTraderMargin";

describe("Auto Trader dynamic margin", () => {
  it("uses exactly 25% of available collateral and rounds down", () => {
    expect(calculateAutoTraderMargin(185.77883434)).toEqual({
      eligible: true,
      marginPercent: AUTO_TRADER_MARGIN_PERCENT,
      availableCollateral: 185.77883434,
      marginUsdc: 46.444708,
    });
  });

  it("uses available collateral rather than total account value", () => {
    expect(calculateAutoTraderMargin(20)).toMatchObject({ eligible: true, marginUsdc: 5 });
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY, undefined, null])(
    "fails closed when available collateral is %s",
    (value) => {
      expect(calculateAutoTraderMargin(value)).toMatchObject({ eligible: false, marginUsdc: 0 });
    },
  );

  it("fails closed when 25% is below the minimum executable margin", () => {
    expect(calculateAutoTraderMargin(19.99)).toMatchObject({ eligible: false, marginUsdc: 0 });
  });
});
