export const AUTO_TRADER_MARGIN_PERCENT = 25 as const;
export const MIN_AUTO_TRADER_MARGIN_USDC = 5;

export type DynamicMarginDecision =
  | {
      eligible: true;
      marginPercent: typeof AUTO_TRADER_MARGIN_PERCENT;
      availableCollateral: number;
      marginUsdc: number;
    }
  | {
      eligible: false;
      marginPercent: typeof AUTO_TRADER_MARGIN_PERCENT;
      availableCollateral: number;
      marginUsdc: 0;
      reason: string;
    };

/**
 * Size each new Auto Trader entry from currently available Hyperliquid trading
 * collateral. The value is rounded down so sizing can never exceed 25%.
 */
export function calculateAutoTraderMargin(availableCollateral: unknown): DynamicMarginDecision {
  const available = Number(availableCollateral);
  if (!Number.isFinite(available) || available <= 0) {
    return {
      eligible: false,
      marginPercent: AUTO_TRADER_MARGIN_PERCENT,
      availableCollateral: 0,
      marginUsdc: 0,
      reason: "Available Hyperliquid trading collateral is unavailable or zero.",
    };
  }

  const marginUsdc = Math.floor(available * AUTO_TRADER_MARGIN_PERCENT * 10_000) / 1_000_000;
  if (marginUsdc < MIN_AUTO_TRADER_MARGIN_USDC) {
    return {
      eligible: false,
      marginPercent: AUTO_TRADER_MARGIN_PERCENT,
      availableCollateral: available,
      marginUsdc: 0,
      reason: `25% of available collateral is below the ${MIN_AUTO_TRADER_MARGIN_USDC} USDC minimum.`,
    };
  }

  return {
    eligible: true,
    marginPercent: AUTO_TRADER_MARGIN_PERCENT,
    availableCollateral: available,
    marginUsdc,
  };
}
