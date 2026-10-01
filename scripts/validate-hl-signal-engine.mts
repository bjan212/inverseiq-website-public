import { runSignalScan } from "../server/lib/signalEngine";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

async function main() {
  const result = await runSignalScan(symbols.length, "5m", undefined, symbols, true);
  const signal = result.best;

  if (!signal || result.scannedCount === 0 || !Number.isFinite(signal.entryPrice) || signal.entryPrice <= 0) {
    throw new Error(`HL signal validation failed: scanned=${result.scannedCount}, entry=${signal?.entryPrice}`);
  }

  console.log(JSON.stringify({
    scannedCount: result.scannedCount,
    scanDurationMs: result.scanDurationMs,
    symbol: signal.symbol,
    direction: signal.direction,
    entryPrice: signal.entryPrice,
    confidence: signal.confidence,
    technicalScore: signal.technicalScore,
    microstructureScore: signal.microstructureScore,
    entryQuality: signal.entryQualityLabel,
    technicalDirection: signal.technicalDirection,
    microstructureDirection: signal.microstructureDirection,
    directionsAgree: signal.directionsAgree,
    isExecutionEligible: signal.isExecutionEligible,
    patternType: signal.patternType,
  }, null, 2));
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
