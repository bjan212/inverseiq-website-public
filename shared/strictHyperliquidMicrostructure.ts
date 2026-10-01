import type { DirectionalFlowBias } from "./hyperliquidMicrostructure";

export type StrictHyperliquidMicrostructureInput = {
  technicalDirection: "LONG" | "SHORT";
  orderBookImbalance: number;
  candleFlow: { direction: DirectionalFlowBias; strength: number };
  fundingRate: number;
  openInterestRelativeChange: number | null;
};

export type StrictHyperliquidMicrostructureResult = {
  direction: "LONG" | "SHORT" | null;
  score: number;
  alignedStrength: number;
  opposingStrength: number;
  components: {
    orderBook: number;
    candleFlow: number;
    funding: number;
    openInterest: number;
  };
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function addStrength(
  direction: "LONG" | "SHORT",
  strength: number,
  bull: { value: number },
  bear: { value: number },
) {
  if (direction === "LONG") bull.value += strength;
  else bear.value += strength;
}

/**
 * Continuous strict Hyperliquid microstructure score. The high-frequency core
 * is real L2 imbalance (50 points) plus labelled 1m candle-volume flow proxy
 * (35 points). Funding and material OI changes provide smaller contextual
 * confirmation (10 and 5 points). Neutral or unavailable inputs add nothing;
 * contrary evidence reduces the resulting score rather than being ignored.
 */
export function scoreStrictHyperliquidMicrostructure(
  input: StrictHyperliquidMicrostructureInput,
): StrictHyperliquidMicrostructureResult {
  const bull = { value: 0 };
  const bear = { value: 0 };

  const orderBook = clamp01(Math.abs(input.orderBookImbalance) / 0.35) * 50;
  if (orderBook > 0) addStrength(input.orderBookImbalance >= 0 ? "LONG" : "SHORT", orderBook, bull, bear);

  const candleFlow = clamp01(input.candleFlow.strength) * 35;
  if (candleFlow > 0 && input.candleFlow.direction !== "neutral") {
    addStrength(input.candleFlow.direction === "buy" ? "LONG" : "SHORT", candleFlow, bull, bear);
  }

  const fundingMagnitude = Math.abs(input.fundingRate);
  const funding = fundingMagnitude >= 0.0002
    ? clamp01((fundingMagnitude - 0.0002) / 0.0006) * 10
    : 0;
  if (funding > 0) addStrength(input.fundingRate < 0 ? "LONG" : "SHORT", funding, bull, bear);

  const oiChange = input.openInterestRelativeChange;
  // Material rising OI confirms the direction already selected by technicals.
  // Falling, first-snapshot, and immaterial OI remain neutral; declining OI
  // must not become an autonomous short signal.
  const openInterest = oiChange !== null && oiChange >= 0.002
    ? clamp01((oiChange - 0.002) / 0.018) * 5
    : 0;
  if (openInterest > 0) addStrength(input.technicalDirection, openInterest, bull, bear);

  const direction = bull.value === bear.value ? null : bull.value > bear.value ? "LONG" : "SHORT";
  const alignedStrength = Math.max(bull.value, bear.value);
  const opposingStrength = Math.min(bull.value, bear.value);
  return {
    direction,
    score: Math.round(clamp01((alignedStrength - opposingStrength) / 100) * 100),
    alignedStrength,
    opposingStrength,
    components: { orderBook, candleFlow, funding, openInterest },
  };
}
