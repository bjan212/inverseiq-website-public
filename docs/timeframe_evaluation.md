# Hyperliquid Auto Trader Timeframe Evaluation

**Author:** Manus AI  
**Evaluation date:** 7 September 2026

## Decision

Xrypt should retain **five-minute candles as the primary setup timeframe and one-minute candles as confirmation**. The new one-minute rescan cadence reduces search latency without converting the system into a noisy one-minute-only strategy. No live execution threshold, margin, leverage, or protection rule is changed by this evaluation.

> A shorter candle does not create a higher-frequency edge by itself. Research-grade high-frequency models rely on event-level order-book and trade-flow data, execution-cost modeling, and chronology-safe validation—not candle frequency alone.[1] [2]

## Real Hyperliquid diagnostic

The analysis used public Hyperliquid `candleSnapshot` data for BTC, ETH, and SOL over the 48 hours ending 7 September 2026. It compared one-minute, five-minute, and fifteen-minute close-to-close returns. These are **descriptive noise and movement diagnostics**, not a profitability backtest. The raw results are preserved in [`docs/data/timeframe_diagnostics_latest.json`](./data/timeframe_diagnostics_latest.json).

| Interval | Average median absolute move | Average 90th-percentile move | Bars moving at least 10 bps | Bars moving at least 20 bps | Direction-flip rate | Lag-1 return correlation |
|---|---:|---:|---:|---:|---:|---:|
| 1 minute | 2.50 bps | 7.95 bps | 6.42% | 0.74% | 49.39% | 0.0039 |
| 5 minutes | 5.49 bps | 17.00 bps | 26.51% | 8.39% | 51.04% | -0.0205 |
| 15 minutes | 9.90 bps | 31.98 bps | 45.66% | 22.05% | 47.38% | -0.0340 |

The one-minute sample produced a median move of only 2.50 basis points and a 90th-percentile move below 8 basis points across the three assets. Only 6.42% of one-minute bars moved at least 10 basis points. Five-minute bars supplied materially larger moves while still updating frequently. Direction-flip rates stayed near 50% and lag-one return correlations stayed near zero at every interval, so this 48-hour candle sample does not demonstrate a stable close-to-close trend edge at one minute.

## Research alignment

Pinto evaluates Bitcoin and Ether perpetual futures across one-, five-, ten-, fifteen-, thirty-, and sixty-minute aggregations. The study warns that one-minute data can be distorted by bid–ask bounce, discrete prices, and order-book frictions; increasing aggregation reduces these microstructure effects, and the paper cites five-minute sampling as more accurate for realized-volatility forecasting.[3]

The 2026 order-book study finds short-horizon information in spread, depth, order-flow imbalance, trade imbalance, and VWAP-to-mid deviations using **one-second** Binance Futures order-book and trade data. It uses purged rolling validation and conservative execution assumptions. This supports a future event-level microstructure model but does not support replacing Xrypt's current setup logic with one-minute OHLC candles.[1]

Easley, O'Hara, Yang, and Zhang construct Roll, Kyle lambda, Amihud, and VPIN measures from one-minute crypto data using 50- and 100-bar histories. They deliberately use a long forward separation to avoid overlap leakage. Their reported AUC range of roughly 0.54–0.61 indicates modest predictability, not near-certain short-horizon direction.[2]

## Safe higher-frequency roadmap

Xrypt can move toward genuine higher-frequency execution only after it stores event-level Hyperliquid book and trade updates, computes spread/depth/imbalance/toxicity features, models maker and taker fees plus slippage/funding/latency, and proves net performance through purged walk-forward testing and live shadow evaluation. Until then, the approved architecture is **5m primary + 1m confirmation + one-minute non-overlapping rescans**.

## References

[1]: https://arxiv.org/html/2602.00776v1 "Explainable Patterns in Cryptocurrency Microstructure"
[2]: https://stoye.economics.cornell.edu/docs/Easley_ssrn-4814346.pdf "Microstructure and Market Dynamics in Crypto Markets"
[3]: https://www.sciencedirect.com/science/article/pii/S2214845025001188 "High-frequency dynamics of Bitcoin futures: An examination of market microstructure"
