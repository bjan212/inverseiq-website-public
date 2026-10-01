# Hyperliquid Auto-Trader Safety Notes

This note records the official API constraints used for the Hyperliquid-only Auto Trader hardening work. It is an engineering reference, not trading advice.

## Verified API facts

- Perpetual asset identifiers are the indices in the `universe` returned by Hyperliquid `meta` data. The Auto Trader must resolve asset indices from current metadata rather than hard-code them.
- Hyperliquid order actions support a trigger type with `isMarket`, `triggerPx`, and `tpsl` fields. The action grouping supports `positionTpsl`.
- A reduce-only order is intended to reduce an existing position. Protective TP and SL triggers must be reduce-only and should be verified through `frontendOpenOrders` after submission.
- Hyperliquid supports an order `modify` action. The exchange documents no native trailing-stop order type in its standard order-type list, so any trailing protection must be implemented as a server-side monitor that only tightens an existing reduce-only stop and must verify the replacement order.
- `frontendOpenOrders` returns trigger status, trigger price, reduce-only status, and position-level TP/SL metadata for read-only verification.
- Hyperliquid REST requests share an aggregate IP limit of 1,200 weight per minute. Most `info` requests cost 20 weight; `l2Book`, `allMids`, `clearinghouseState`, and `spotClearinghouseState` cost 2; and `candleSnapshot` adds weight per 60 returned candles. A full-universe dual-timeframe candle scan in one burst cannot stay within the documented budget.

## Auto-Trader design implications

1. A signal may be displayed without being executable. New automated entries must require confidence of at least 88, the established execution-quality gate, full Hyperliquid venue data, and a current metadata lookup.
2. The current implementation places position TP/SL then verifies the exchange-side trigger orders. If that verification fails, it must fail closed: do not record an open protected trade, and do not continue normal scanning.
3. A trailing stop must never loosen the initial stop. It should start only once a position has moved favorably, should use a reduce-only stop trigger, and should retain a verified TP. A failed trailing-stop update must preserve the existing stop and surface the failure.
4. Live activation remains out of scope until separate explicit authorization is given and a fresh read-only account preflight confirms there is no conflicting position or open order.
5. Each cycle must consider every active, non-delisted Hyperliquid perpetual from one shared metadata snapshot. Expensive venue-native candle and order-book analysis is limited to a transparent 20-market set: 12 volume leaders, 4 largest daily movers, and 4 rotating markets. The rotating segment prevents permanent exclusion while keeping request weight bounded.
6. Scan telemetry must distinguish all pairs considered from pairs that completed deep analysis and candidates whose required venue data was unavailable. It must never label successful deep analyses as the full universe size.
7. Entry margin is calculated only after every signal and liquidity gate passes and immediately before execution. It equals **25% of currently available Hyperliquid trading collateral**, rounded down to six decimals. Missing, invalid, zero, or less-than-20-USDC available collateral fails closed; there is no fixed-dollar fallback.
8. The UI and persisted telemetry must report the configured 25% rule, the latest available-collateral value, and the latest calculated margin without representing the legacy fixed-dollar column as active sizing logic.
9. The 88–100 value is an **evidence-confluence score**, not a guaranteed or empirically calibrated win probability. The `evidence-confluence-v5-hl-microstructure-continuous` model preserves weighted evidence continuously through 70–87 for strong near misses, while allowing 88–100 only when technical and Hyperliquid microstructure directions agree, the entry is A/A+, and every strict component floor passes. Strict Hyperliquid microstructure continuously weights existing L2 depth, the labelled 1m candle-flow proxy, funding stress, and material rising cached OI that confirms the established technical direction. Missing, mixed, immaterial, or falling OI inputs remain neutral, and opposing evidence is discounted. Personal trade history and uncalibrated ML agreement may suppress this score but cannot promote a setup into the execution band.
10. A completed low-score or otherwise ineligible scan queues its successor immediately rather than returning to the former five-minute idle wait. Because one 20-market dual-timeframe REST scan nearly consumes Hyperliquid's documented one-minute request-weight budget, the queued scan starts after the 60-second rolling API window clears. Cycles remain non-overlapping. API, rate-limit, worker, balance, and execution failures use bounded exponential backoff from 60 seconds to five minutes; position monitoring, post-trade cooldown, daily limits, and every execution safeguard retain their prior behavior.
11. Live start and stop are both explicit, server-validated operations. The browser must confirm the action and the request must carry the exact start or stop confirmation token; stale clients and empty or replayed mutations cannot toggle live trading. Every managed cycle re-reads persisted `isActive` before scanning and again before scheduling a successor. An inactive or unreadable state terminates the in-memory loop fail-closed, while the existing pre-execution checks remain in force.
12. Private shadow calibration stores at most one best-candidate observation per user in each 15-minute bucket. The existing verifier checks no more than ten due observations per run, labels same-candle TP/SL collisions as ambiguous, and exposes only measured score-band statistics. Outcome-based score adjustment remains disabled until minimum resolved and high-band samples are met and manually reviewed; no observed average is forced toward a target.

## Sources

1. Hyperliquid Docs, [Order types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types), accessed 2026-09-02.
2. Hyperliquid Docs, [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint), accessed 2026-09-02.
3. Hyperliquid Docs, [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), accessed 2026-09-02.
4. Hyperliquid Docs, [Rate limits and user limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits), accessed 2026-09-07.
