type MarginState = {
  marginSummary?: {
    accountValue?: string | number;
    totalMarginUsed?: string | number;
    withdrawable?: string | number;
  };
};

type SpotState = {
  balances?: Array<{ coin?: string; total?: string | number; hold?: string | number }>;
};

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keep Hyperliquid perpetual collateral distinct from spot USDC in every display. */
export function summarizeHyperliquidBalances(perpetualState: MarginState, spotState: SpotState) {
  const marginSummary = perpetualState?.marginSummary ?? {};
  const accountValue = safeNumber(marginSummary.accountValue);
  const totalMarginUsed = safeNumber(marginSummary.totalMarginUsed);
  const withdrawable = safeNumber(marginSummary.withdrawable);
  const spotUsdc = spotState?.balances?.find((balance) => balance?.coin === "USDC");
  const spotUsdcBalance = safeNumber(spotUsdc?.total);
  const spotUsdcHold = safeNumber(spotUsdc?.hold);
  const spotUsdcAvailable = Math.max(0, spotUsdcBalance - spotUsdcHold);
  const totalAccountValue = Math.round((accountValue + spotUsdcBalance) * 1e8) / 1e8;

  return {
    accountValue,
    totalMarginUsed,
    withdrawable,
    spotUsdcBalance,
    spotUsdcHold,
    spotUsdcAvailable,
    totalAccountValue,
  };
}

/**
 * Hyperliquid's unified-account response can carry the funded Perps balance in
 * `spotClearinghouseState` while the legacy `clearinghouseState` margin summary
 * is empty. Use that source only in the empty-perp case; otherwise retain the
 * traditional perpetual account value and withdrawable collateral.
 */
export function resolveAutoTraderHyperliquidCollateral(perpetualState: MarginState, spotState: SpotState) {
  const balances = summarizeHyperliquidBalances(perpetualState, spotState);
  const usesUnifiedAccountBalance = balances.accountValue <= 0 && balances.spotUsdcAvailable > 0;

  return {
    ...balances,
    usesUnifiedAccountBalance,
    tradingAccountValue: usesUnifiedAccountBalance ? balances.spotUsdcBalance : balances.accountValue,
    availableTradingCollateral: usesUnifiedAccountBalance ? balances.spotUsdcAvailable : balances.withdrawable,
  };
}
