/**
 * volumeProfile.ts
 *
 * Computes a VPVR-style (Volume Profile Visible Range) from OHLCV candle data.
 * No external API required — uses Bybit candle data already fetched by signalEngine.
 *
 * Outputs:
 *   poc         — Point of Control (price level with highest traded volume)
 *   vah         — Value Area High (top of 70% volume zone above POC)
 *   val         — Value Area Low (bottom of 70% volume zone below POC)
 *   hvn         — High Volume Nodes (price levels with >1.5x average volume)
 *   lvn         — Low Volume Nodes (price levels with <0.5x average volume)
 *   priceVsPoc  — "above" | "below" | "at" (current price vs POC)
 *   vpScore     — 0–100 directional score based on volume profile structure
 *   vpBias      — "bullish" | "bearish" | "neutral"
 */

export interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  hvn: number[];
  lvn: number[];
  priceVsPoc: "above" | "below" | "at";
  vpScore: number;       // 0–100, higher = stronger directional signal
  vpBias: "bullish" | "bearish" | "neutral";
  valueAreaWidth: number; // VAH - VAL as % of price (tighter = stronger)
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Build a volume profile from an array of OHLCV candles.
 * Uses the typical price (H+L+C)/3 as the price level for each candle.
 *
 * @param candles  Array of OHLCV candles (most recent last)
 * @param bins     Number of price buckets (default 50)
 */
export function computeVolumeProfile(candles: Candle[], bins = 50): VolumeProfileResult {
  if (candles.length < 10) {
    const price = candles[candles.length - 1]?.close ?? 0;
    return {
      poc: price, vah: price * 1.01, val: price * 0.99,
      hvn: [], lvn: [], priceVsPoc: "at",
      vpScore: 50, vpBias: "neutral", valueAreaWidth: 2,
    };
  }

  const currentPrice = candles[candles.length - 1].close;

  // Price range
  const allHighs = candles.map(c => c.high);
  const allLows  = candles.map(c => c.low);
  const priceHigh = Math.max(...allHighs);
  const priceLow  = Math.min(...allLows);
  const range = priceHigh - priceLow;
  if (range === 0) {
    return {
      poc: currentPrice, vah: currentPrice * 1.01, val: currentPrice * 0.99,
      hvn: [], lvn: [], priceVsPoc: "at",
      vpScore: 50, vpBias: "neutral", valueAreaWidth: 2,
    };
  }

  const binSize = range / bins;

  // Build volume histogram
  const histogram: { price: number; volume: number }[] = Array.from({ length: bins }, (_, i) => ({
    price: priceLow + (i + 0.5) * binSize,
    volume: 0,
  }));

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const binIndex = Math.min(Math.floor((typicalPrice - priceLow) / binSize), bins - 1);
    histogram[binIndex].volume += c.volume;
  }

  // POC = bin with highest volume
  const pocBin = histogram.reduce((max, b) => b.volume > max.volume ? b : max, histogram[0]);
  const poc = pocBin.price;

  // Value Area = 70% of total volume centered around POC
  const totalVolume = histogram.reduce((s, b) => s + b.volume, 0);
  const targetVolume = totalVolume * 0.70;

  let vaVolume = pocBin.volume;
  let vahIndex = histogram.indexOf(pocBin);
  let valIndex = vahIndex;

  // Expand outward from POC until 70% volume is captured
  while (vaVolume < targetVolume) {
    const upVol   = vahIndex + 1 < bins  ? histogram[vahIndex + 1].volume : 0;
    const downVol = valIndex - 1 >= 0    ? histogram[valIndex - 1].volume : 0;

    if (upVol === 0 && downVol === 0) break;

    if (upVol >= downVol) {
      vahIndex = Math.min(vahIndex + 1, bins - 1);
      vaVolume += histogram[vahIndex].volume;
    } else {
      valIndex = Math.max(valIndex - 1, 0);
      vaVolume += histogram[valIndex].volume;
    }
  }

  const vah = histogram[vahIndex].price + binSize / 2;
  const val = histogram[valIndex].price - binSize / 2;

  // HVN / LVN detection
  const avgVolume = totalVolume / bins;
  const hvn = histogram.filter(b => b.volume > avgVolume * 1.5).map(b => b.price);
  const lvn = histogram.filter(b => b.volume < avgVolume * 0.5 && b.volume > 0).map(b => b.price);

  // Price vs POC
  const pocTolerance = range * 0.01; // 1% tolerance
  const priceVsPoc: "above" | "below" | "at" =
    currentPrice > poc + pocTolerance ? "above" :
    currentPrice < poc - pocTolerance ? "below" : "at";

  // Value area width as % of price
  const valueAreaWidth = ((vah - val) / currentPrice) * 100;

  // VP Score & Bias
  // Bullish signals:
  //   - Price above POC (accumulation zone)
  //   - Price near VAL (support bounce)
  //   - Tight value area (strong conviction)
  //   - HVN below current price (strong support)
  // Bearish signals:
  //   - Price below POC (distribution zone)
  //   - Price near VAH (resistance rejection)
  //   - HVN above current price (strong resistance)

  let bullVP = 0, bearVP = 0;

  if (priceVsPoc === "above") bullVP += 3;
  else if (priceVsPoc === "below") bearVP += 3;

  // Distance from VAL/VAH
  const distFromVal = Math.abs(currentPrice - val) / range;
  const distFromVah = Math.abs(currentPrice - vah) / range;

  if (distFromVal < 0.05) bullVP += 2; // near support
  if (distFromVah < 0.05) bearVP += 2; // near resistance

  // HVN below = support
  const hvnBelow = hvn.filter(p => p < currentPrice).length;
  const hvnAbove = hvn.filter(p => p > currentPrice).length;
  bullVP += Math.min(hvnBelow, 3);
  bearVP += Math.min(hvnAbove, 3);

  // Tight value area = stronger signal
  if (valueAreaWidth < 3) { bullVP += 1; bearVP += 1; } // both get boost for tight VA

  const totalVP = bullVP + bearVP || 1;
  const vpScore = Math.round((Math.max(bullVP, bearVP) / totalVP) * 100);
  const vpBias: "bullish" | "bearish" | "neutral" =
    bullVP > bearVP + 1 ? "bullish" :
    bearVP > bullVP + 1 ? "bearish" : "neutral";

  return {
    poc: parseFloat(poc.toFixed(6)),
    vah: parseFloat(vah.toFixed(6)),
    val: parseFloat(val.toFixed(6)),
    hvn: hvn.map(p => parseFloat(p.toFixed(6))).slice(0, 5),
    lvn: lvn.map(p => parseFloat(p.toFixed(6))).slice(0, 5),
    priceVsPoc,
    vpScore,
    vpBias,
    valueAreaWidth: parseFloat(valueAreaWidth.toFixed(2)),
  };
}
