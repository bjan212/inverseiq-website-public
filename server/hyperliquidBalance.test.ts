import { describe, expect, it } from "vitest";
import { resolveAutoTraderHyperliquidCollateral, summarizeHyperliquidBalances } from "./lib/hyperliquidBalance";

describe("summarizeHyperliquidBalances", () => {
  it("keeps spot USDC separate from perpetual collateral and reports their combined value", () => {
    const result = summarizeHyperliquidBalances(
      { marginSummary: { accountValue: "129.93", totalMarginUsed: "115.43", withdrawable: "14.50" } },
      { balances: [{ coin: "USDC", total: "727.26935634" }] },
    );

    expect(result).toEqual({
      accountValue: 129.93,
      totalMarginUsed: 115.43,
      withdrawable: 14.5,
      spotUsdcBalance: 727.26935634,
      spotUsdcHold: 0,
      spotUsdcAvailable: 727.26935634,
      totalAccountValue: 857.19935634,
    });
  });

  it("returns zeroes for incomplete or malformed exchange values", () => {
    expect(summarizeHyperliquidBalances({ marginSummary: { accountValue: "invalid" } }, { balances: [] }))
      .toEqual({
        accountValue: 0,
        totalMarginUsed: 0,
        withdrawable: 0,
        spotUsdcBalance: 0,
        spotUsdcHold: 0,
        spotUsdcAvailable: 0,
        totalAccountValue: 0,
      });
  });

  it("uses available unified-account USDC when legacy perpetual state is empty", () => {
    const result = resolveAutoTraderHyperliquidCollateral(
      { marginSummary: { accountValue: "0", totalMarginUsed: "0", withdrawable: "0" } },
      { balances: [{ coin: "USDC", total: "700.26935634", hold: "0" }] },
    );

    expect(result.usesUnifiedAccountBalance).toBe(true);
    expect(result.tradingAccountValue).toBe(700.26935634);
    expect(result.availableTradingCollateral).toBe(700.26935634);
  });

  it("does not add separate spot funds to a non-empty legacy perpetual account", () => {
    const result = resolveAutoTraderHyperliquidCollateral(
      { marginSummary: { accountValue: "129.93", totalMarginUsed: "115.43", withdrawable: "14.50" } },
      { balances: [{ coin: "USDC", total: "727.26935634", hold: "0" }] },
    );

    expect(result.usesUnifiedAccountBalance).toBe(false);
    expect(result.tradingAccountValue).toBe(129.93);
    expect(result.availableTradingCollateral).toBe(14.5);
  });
});
