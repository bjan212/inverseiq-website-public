import { fetchVerificationKlines, toHyperliquidCoin } from "../server/signalVerifier";

const endTime = Date.now();
const startTime = endTime - 90 * 60_000;
const sourceSymbol = process.argv[2] ?? "BTC/USDC";
const candles = await fetchVerificationKlines(sourceSymbol, startTime, endTime);

console.log(JSON.stringify({
  sourceSymbol,
  hyperliquidCoin: toHyperliquidCoin(sourceSymbol),
  candleCount: candles.length,
  firstOpenTime: candles[0]?.openTime ?? null,
  lastOpenTime: candles.at(-1)?.openTime ?? null,
}, null, 2));
