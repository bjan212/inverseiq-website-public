# Private Exchange Trade-History Learning Design

**Author:** Manus AI  
**Status:** Approved design  
**Selected operating mode:** One import after successful verification, plus user-triggered manual refresh. No recurring background synchronization.

## Objective

Xrypt will learn **private, user-specific inverse patterns** from a connected account’s executed perpetual-futures history. Imported data will never be pooled across users. Exchange-history learning will not directly raise a signal into the automated 88–100 execution band; it may suppress an unsupported setup, provide a bounded personalized adjustment, or contribute to a separately calibrated meta-model after sufficient evidence exists.

> A displayed confidence value must represent an out-of-sample calibrated probability, not a renamed indicator score. An 88% execution threshold is meaningful only when predictions near 0.88 succeed at approximately that frequency in held-out observations.[1]

## Privacy and authorization boundary

Every credential, imported fill, synchronization cursor, completed-trade outcome, and derived pattern is keyed by the authenticated `userId`. Credential procedures must require authentication and may not fall back to a shared default user. Generic credential queries must filter by **both user and exchange**; adding or deleting one exchange must not deactivate another exchange connection.

The application stores only the normalized fields required for learning and audit. It does not persist raw exchange payloads, signed requests, private keys, or API secrets in history tables. Existing credentials remain encrypted at rest. Hyperliquid history is read using the public account address and does not require exposing the signing key to the history importer.[2]

## Persistence model

| Entity | Purpose | Required isolation and idempotency |
|---|---|---|
| `exchangeTradeFills` | Minimal normalized execution ledger | Compound uniqueness on `userId + exchange + sourceAccountHash + symbol + externalFillId` |
| `exchangeHistorySyncState` | Last successful import, cursor, status, and errors | Compound uniqueness on `userId + exchange + sourceAccountHash` |
| `userPatterns` | Global private behavioral patterns | Always filtered and replaced only for the owning `userId` |
| `userSymbolPatterns` | Pair-specific private performance patterns | Always filtered and replaced only for the owning `userId` |

`sourceAccountHash` is a one-way fingerprint of the exchange, environment, and connection identifier. It distinguishes replacement credentials without storing the plain API key. Monetary quantities remain decimal strings in the fill ledger to avoid floating-point loss. Timestamps are stored as exchange-provided Unix milliseconds.

## Import lifecycle

1. The user saves credentials using an authenticated procedure.
2. Xrypt verifies the credentials against a read-only account endpoint.
3. Only after successful verification, Xrypt invokes the matching history adapter. A history failure does not turn a valid connection into a failed verification; the response reports the import as `complete`, `partial`, or `failed`.
4. The adapter paginates within the exchange’s official limits, normalizes fills, and upserts them using the compound uniqueness key.
5. The learning service rebuilds patterns from **all stored eligible fills for that user**, not merely the latest page.
6. The UI reports rows fetched, new rows inserted, duplicates ignored, eligible completed outcomes, pattern count, coverage start/end, and any retention limitation.
7. A manual refresh repeats the same idempotent pipeline. There is no timer, cron job, or background heartbeat for this feature.

Hyperliquid time-range pagination must advance from the last returned timestamp and is bounded by the recent-fill retention documented by the exchange.[2] Binance USD-M requires symbol-aware requests, seven-day maximum windows, and a three-month API history limit.[3] Exchange-specific adapters must disclose these constraints rather than claiming a complete lifetime import.

## Normalization and completed-trade rules

The canonical fill record includes exchange, source account fingerprint, external fill/order identifiers, normalized symbol, execution side, position side/effect, price, quantity, fee, fee asset, realized PnL, and exchange timestamp. A row is eligible for inverse learning only when its position-closing direction can be determined and its realized PnL is available from the official response or a documented closed-position endpoint.

Opening fills, transfers, funding-only records, unknown position effects, and fills with unavailable realized PnL remain auditable but do not become training outcomes. Multiple fills from the same closing order are aggregated before pattern analysis so partial execution does not artificially multiply the sample size. Bybit uses closed-position history for outcome learning because fill history does not provide realized PnL directly. Other adapters must follow their official field semantics and fail closed when reconstruction is ambiguous.

## Private inverse-learning safeguards

The current inverse engine uses raw win-rate deviations and fixed confidence boosts. The upgraded model will use minimum sample thresholds, empirical-Bayes shrinkage toward the user’s broader baseline, recency weighting, pair/direction segmentation, and strict adjustment caps. A losing LONG is not automatically evidence that SHORT is profitable; inversion is permitted only when the opposite action has independent support or the pattern is used as a veto against repeating the losing setup.

Personal history cannot promote an otherwise ineligible signal. It can reduce confidence, trigger abstention, or apply a bounded adjustment below the final calibrated execution gate. The 88–100 A/A+ Auto Trader requirements, venue-native data freshness checks, execution-cost vetoes, and mandatory TP/SL protection remain independent mandatory controls.

## Signal precision programme

| Layer | Required measurement before production influence |
|---|---|
| Base direction model | Purged/embargoed out-of-sample precision, recall, coverage, and regime breakdown |
| Calibrator | Reliability diagram, Brier score, log loss, expected calibration error, and sample count per probability band |
| Meta-label/take-or-skip filter | Incremental precision and coverage versus the unchanged base model |
| Execution filter | Net expected edge after spread, fees, funding, slippage, and latency |
| Personalized adjustment | User-only shadow performance, shrinkage strength, minimum samples, and maximum allowed delta |

Calibration data must be independent from model-fitting data; fitting calibration on training predictions tends to produce probabilities biased toward extremes.[1] Purged chronology-aware validation and deflated performance statistics are required to reduce leakage and backtest-overfitting risk.[4] Microstructure features may be useful pair-specific context, but recent evidence shows that many apparent minute-level gains disappear after realistic fees and rigorous leakage controls.[5]

## Adapter rollout

The shared ingestion contract covers Hyperliquid, Binance USD-M, Bybit linear perpetuals, OKX SWAP, MEXC Contract, KuCoin Futures, Gate.io USDT Futures, Bitget USDT Futures, and AsterDEX. Production enablement is adapter-by-adapter. An adapter is marked supported only after request signing, pagination, retention disclosure, normalization, idempotency, and fixture-based tests pass. Unsupported or ambiguous histories must return an explicit limitation rather than silently generating patterns.

## References

[1]: https://scikit-learn.org/stable/modules/calibration.html "Scikit-learn: Probability calibration"
[2]: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint "Hyperliquid Docs: Info endpoint"
[3]: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade "Binance Developer Docs: USD-M Account Trade List"
[4]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4686376 "Arian, Norouzi Mobarekeh, and Seco: Backtest overfitting and out-of-sample testing"
[5]: https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1811716/full "Pindza: Microstructure alpha in cryptocurrency markets"
