# Xrypt Signal Precision and Private Trade-History Learning

## Executive conclusion

**A higher displayed confidence number is not the same as a higher win rate.** Xrypt should optimize the precision of the signals it accepts, after fees, funding, slippage, and realistic TP/SL path ordering. The system should abstain more often when the evidence is weak. This can reduce signal frequency while improving the trustworthiness of the 88–100 band.

The first hardening stage is implemented locally. Uncalibrated ML agreement and private user performance can no longer increase an executable signal’s confidence. Private history can only act as a conservative suppression filter. This prevents a weak base setup from being promoted into the 88+ Auto Trader band.

## Confirmed production defect and remediation

Live monitoring exposed a deterministic defect: the production signal engine capped every setup at **82**, while the Auto Trader required **88–100**. Market scanning and rejection telemetry were functioning, but entry was mathematically impossible. The live worker was kept on the capped production version while the replacement was tested; it must be stopped before publication so the new execution behavior cannot activate without renewed approval.

The replacement `evidence-confluence-v5-hl-microstructure-continuous` score is deliberately not represented as an empirical win probability. Strong near-miss setups retain their weighted evidence continuously through 70–87 instead of collapsing to a hard 69 ceiling. A score of 88 or more still requires an A/A+ entry, aligned technical and Hyperliquid-native microstructure directions, technical score of at least 80, microstructure score of at least 75, entry-quality score of at least 70, composite score of at least 78, and volatility-quality score of at least 60. Higher values are monotonic with stronger measured evidence; private patterns and uncalibrated ML signals can still reduce but never promote the score.

A controlled non-executing Hyperliquid probe validated the prior continuous distribution against live data while the production worker continued on the published version. The v5 follow-on preserves that non-executing discipline and replaces discrete strict microstructure buckets with continuous strengths from the same L2-book, confirmation-candle, funding, and cached-OI inputs. This restores stronger discrimination without weakening the independent 88+ authorization gate or adding exchange requests.

Hyperliquid-native microstructure is normalized against the venue evidence actually available. L2 imbalance, 1m candle-volume-flow proxy, funding stress, and material rising OI confirmation use bounded continuous strengths. Missing, mixed, or immaterial inputs remain neutral; falling OI cannot create a short direction; and conflicting directions are discounted.

Historical resolved records confirm why the score must not be called a calibrated probability. The legacy dataset is contaminated by earlier scoring logic and cannot train the new mapping directly, but its diagnostics show that higher old labels were inversely related to realized TP-before-SL outcomes:

| Legacy confidence band | Resolved records | TP-before-SL | Observed rate |
|---|---:|---:|---:|
| 80–87 | 156 | 81 | 51.92% |
| 88–94 | 86 | 32 | 37.21% |
| 95–100 | 66 | 12 | 18.18% |

These figures are a warning against score inflation, not a forecast for the new model. The new score must accumulate its own model-versioned shadow outcomes before probability calibration is attempted.

## Evidence-backed priorities

| Priority | Change | Expected effect | Validation requirement |
|---|---|---|---|
| 1 | Out-of-sample probability calibration | Make “88” interpretable as an empirical success probability rather than a composite score | Reliability curve, expected calibration error, Brier score, log loss |
| 2 | Triple-barrier labels and take-or-skip meta-model | Align learning with whether TP, SL, or timeout occurs first | Purged/embargoed chronological validation and cost-aware outcomes |
| 3 | Pair- and regime-specific abstention | Avoid extrapolating one model across incompatible assets and regimes | Precision and coverage by symbol, volatility, liquidity, funding, and trend regime |
| 4 | Execution-aware edge veto | Reject setups whose expected movement cannot cover fees, spread, funding, latency, and slippage | Net expectancy and realized implementation shortfall |
| 5 | Venue-native microstructure quality checks | Use spread, depth, imbalance, volatility, and liquidity as gates rather than universal alpha | Same-venue shadow evaluation; no cross-venue substitution for live orders |
| 6 | Private behavioural learning with shrinkage | Avoid repeating a user’s persistent losing behaviours without treating their history as independent market alpha | Minimum samples, shrinkage, recency monitoring, and no positive confidence promotion |

Scikit-learn’s calibration guidance defines a calibrated 0.8 prediction as one that succeeds about 80% of the time, and warns that calibration must be fitted on data independent of model training. It also warns that flexible isotonic calibration can overfit smaller datasets.[1] Financial-model validation research supports purging and embargoes to reduce leakage and backtest overfitting.[2] Meta-labeling research supports a secondary take-or-skip model, but only when the primary directional model and contextual features are already useful.[3]

Crypto microstructure evidence shows that order-book and volatility features can contain information, while also showing that seemingly strong models can fail after realistic fees and leakage controls. These features should therefore be used as pair-specific context and rejection gates rather than as a universal promise of alpha.[4] Perpetual-futures research supports adding funding, basis, liquidity constraints, and spot-perpetual divergence as contextual features, while explicitly rejecting the idea that these differences are risk-free arbitrage.[5]

## Signal-quality scorecard

The 88–100 Auto Trader threshold should eventually be applied to a **calibrated probability**, not the current raw composite score. Until enough shadow outcomes exist, Xrypt should report the distinction explicitly.

| Metric | Definition | Promotion criterion |
|---|---|---|
| Precision at 88+ | TP-before-SL successes divided by resolved accepted signals, net of configured costs | Must improve on the locked production baseline out of sample |
| Coverage at 88+ | Percentage of eligible market observations producing an 88+ setup | Report alongside precision; never hide coverage collapse |
| Expected calibration error | Weighted gap between forecast probability and observed success frequency | Decrease relative to baseline |
| Brier score and log loss | Proper scoring rules for probability quality | Decrease relative to baseline |
| Net expectancy | Average realized return after fees, funding, spread, slippage, and latency | Positive and stable across validation paths before promotion |
| Regime stability | Precision and coverage by pair, volatility, trend, liquidity, and funding regime | No single unsupported regime should dominate results |
| Drawdown | Peak-to-trough loss under the exact execution policy | Remain inside an approved risk limit |

> **No model change should be promoted because its in-sample win rate is higher.** Promotion requires chronology-safe, out-of-sample improvement without an unacceptable reduction in coverage or increase in drawdown.

## Private connected-exchange learning

The user selected **private-only learning** and **one-time import after successful verification plus manual refresh**. No recurring background synchronization and no cross-user aggregation are enabled.

### Data isolation and security

Every normalized fill is scoped by `userId`, exchange, a non-reversible source-account hash, and external fill ID. A compound unique index provides the database-level duplicate guard. A second compound key isolates import status by user, exchange, and source account. Persistence rejects mixed-owner batches before any insert.

Manual CSV patterns and connected-exchange patterns have separate provenance, so an exchange refresh cannot erase a user’s manual upload. Inverse-pattern routes now require authentication and no longer fall back to another user ID. Connected-exchange credentials use authenticated AES-256-GCM encryption; legacy ciphertext is read-compatible and migrated on a successful credential read.

### Adapter coverage

| Exchange | Automatic trigger | Learning status | Primary limitation |
|---|---|---|---|
| Hyperliquid | Successful wallet verification | Deterministic close fills supported | API exposes only the 10,000 most recent fills; up to 2,000 per `userFillsByTime` response[6] |
| Binance USD-M | Successful API verification | Realized-PnL fills supported | Approximately three months; seven-day trade windows and per-symbol queries[7] |
| Bybit linear | Successful API verification | Closed-position PnL supported | Cursor pages are bounded; fill-level and closed-PnL records have different semantics[8] |
| OKX SWAP | Successful API verification | Closing `fillPnl` supported | Approximately three months; 100-fill cursor pages[9] |
| AsterDEX | Successful API-wallet verification | Realized-PnL fills supported | Seven-day windows; one-time import bounded to 90 days[10] |
| MEXC Futures | Successful API verification | Only reliable close-PnL rows learn | Many deal rows lack reliable realized PnL and are stored but excluded[11] |
| KuCoin Futures | Successful API verification | Stored; uncertain rows fail closed | Standard fill history does not reliably provide realized PnL[12] |
| Gate.io Futures | Successful API verification | Stored; uncertain rows fail closed | Personal fills require position-close matching for reliable PnL[13] |
| Bitget Futures | Successful API verification | Realized-PnL fills supported when present | Recent-history limits and classic/UTA field differences[14] |

The manual refresh control reports rows fetched, newly inserted rows, duplicate rows ignored, eligible private outcomes, retention notes, and the last error. A partial result is reported as partial; the application does not claim complete historical coverage when an exchange cannot provide it.

### Controlled Hyperliquid verification

On 7 September 2026, the owner-authorized Hyperliquid account was imported twice through the new private pipeline. The first run fetched and stored **246 fills**. Of those rows, **118** were deterministic closing fills; aggregation of partial closes produced **111 completed learning outcomes**, **2 exchange-derived global patterns**, and **9 exchange-derived symbol patterns**. The immediate second run fetched the same 246 fills, inserted **0** new rows, and reported **246 duplicates ignored**. The database contained only user 1’s imported rows, while the pre-existing **4 manual global patterns** and **28 manual symbol patterns** remained separate and unchanged. No order, position, balance, or Auto Trader state was modified during this read-only exchange verification.

## Private shadow-calibration baseline

Xrypt now stores one private, versioned observation per user and 15-minute sampling bucket from the best fully analyzed Hyperliquid candidate. Each observation records the active evidence-model version, technical and venue-native microstructure scores, entry grade, direction agreement, execution eligibility, timeframe, entry, TP, SL, expiry, and an ambiguity-safe TP/SL/time outcome. Calibration summaries filter to the active model version so historical v2 capped and v3 continuous scores are never mixed with v4 enriched-microstructure outcomes. A compound user-and-observation key prevents duplicate rows.

The existing durable signal verifier checks at most ten due shadow observations per run and spaces repeated checks by at least five minutes. If TP and SL fall inside the same candle, the outcome is labeled **ambiguous** and excluded from win-rate calculations. The UI reports observed count, resolved TP/SL count, measured mean evidence score, and sample sufficiency. Live score adjustment is explicitly locked off until there are at least 100 resolved observations, including at least 30 resolved observations in the 88–100 bands; reaching those counts triggers manual review rather than automatic promotion.

The first controlled stopped-worker observation considered 177 active Hyperliquid perps, deeply analyzed 20 with no unavailable data, and stored a 69/100 C-grade INJ candidate as ineligible. This is a real measured baseline, not a forced 85 average. The Auto Trader remained inactive.

## Implemented first-stage precision controls

The following controls are implemented locally and validated by focused tests:

| Control | Behaviour |
|---|---|
| Private-history shrinkage | Small samples are pulled toward a neutral 50% prior and weighted by sample size |
| Suppression-only personalization | Private behaviour can lower confidence but cannot raise it or flip market direction |
| Conservative duplicate resolution | If manual and exchange patterns overlap, the most conservative suppression is selected |
| Uncalibrated ML agreement | Recorded as context but does not raise confidence |
| Trained ML disagreement | May reduce confidence after a minimum real-data sample |
| Strict Auto Trader gate | Hyperliquid-only 88–100 A/A+ execution remains strict, but the former hard 82 ceiling is replaced with a reachable, monotonic evidence-confluence score |
| Venue-aware microstructure | Hyperliquid L2 depth, funding, cached material OI confirmation, and a labelled 1m candle-flow proxy use bounded continuous strengths; sparse, neutral, or conflicting evidence cannot appear complete |
| Final-score candidate ranking | Execution candidates are ranked by the conservative final evidence score, so a valid 88+ setup cannot be hidden behind a higher raw-composite but sub-threshold candidate |
| Private shadow calibration | Versioned 15-minute observations accumulate ambiguity-safe outcomes without changing live scores or order eligibility |
| Calibration promotion lock | Outcome-based adjustment remains disabled until resolved and high-band sample floors are met and a manual review approves a chronology-safe model |

These controls improve **confidence integrity**. They do not yet prove a higher realized win rate; that requires accumulating clean outcomes and running the calibration and validation program below.

## Recommended next research-to-production sequence

The first data-collection stage is now active for private, versioned best-candidate observations. The next stage is to compute reliability diagrams, expected calibration error, Brier score, log loss, precision, coverage, net expectancy, and drawdown after sufficient outcomes accumulate. Only then should sigmoid calibration be fitted on chronology-separated data; isotonic should wait for substantially larger samples. A secondary take-or-skip model must use triple-barrier outcomes and execution costs, and any candidate must beat a locked baseline with purged and embargoed validation plus live shadow evaluation. Only then should calibrated probabilities influence the 88+ execution band.

## Timeframe decision

Real 48-hour Hyperliquid diagnostics across BTC, ETH, and SOL found that one-minute bars had an average median absolute move of 2.50 basis points and an average 90th-percentile move of 7.95 basis points. Only 6.42% of one-minute bars moved at least 10 basis points. Five-minute bars increased those figures to 5.49 and 17.00 basis points, with 26.51% moving at least 10 basis points. Direction-flip rates remained near 50% and lag-one return correlations remained near zero at every interval. The descriptive sample therefore does not justify one-minute-only candle execution.

Xrypt should retain **five-minute primary setup analysis, one-minute confirmation, and one-minute non-overlapping rescans**. Genuine higher-frequency execution requires event-level book/trade data and cost-aware purged validation. Full methodology and raw data appear in [`timeframe_evaluation.md`](./timeframe_evaluation.md) and [`data/timeframe_diagnostics_latest.json`](./data/timeframe_diagnostics_latest.json).

The likely result is **fewer but more defensible signals**, not a guaranteed 95–100% win rate. Any premium product claim should use measured out-of-sample results and should reference ACE&CROWN in client contracts and commercialization materials.

## Sources

[1]: https://scikit-learn.org/stable/modules/calibration.html "Scikit-learn probability calibration"
[2]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4686376 "Backtest overfitting and combinatorial purged cross-validation"
[3]: https://hudsonthames.org/wp-content/uploads/2022/04/Does-Meta-Labeling-Add-to-Signal-Efficacy.pdf "Does Meta-Labeling Add to Signal Efficacy?"
[4]: https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1811716/full "Crypto market microstructure and prediction"
[5]: https://arxiv.org/html/2212.06888v5 "Fundamentals of Perpetual Futures"
[6]: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint "Hyperliquid info endpoint"
[7]: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List "Binance USD-M account trade list"
[8]: https://bybit-exchange.github.io/docs/v5/position/close-pnl "Bybit closed PnL"
[9]: https://www.okx.com/docs-v5/en/#order-book-trading-trade-get-transaction-details-last-3-months "OKX fills history"
[10]: https://docs.asterdex.com/for-developers/aster-api/api-documentation "AsterDEX API documentation"
[11]: https://www.mexc.com/api-docs/futures/integration-guide "MEXC Futures API"
[12]: https://www.kucoin.com/docs-new/rest/futures-trading/orders/get-trade-history "KuCoin Futures trade history"
[13]: https://www.gate.com/docs/developers/apiv4/ "Gate API v4"
[14]: https://www.bitget.com/api-doc/uta/trade/Get-Order-Fills "Bitget fill history"
[15]: https://arxiv.org/html/2602.00776v1 "Explainable Patterns in Cryptocurrency Microstructure"
[16]: https://stoye.economics.cornell.edu/docs/Easley_ssrn-4814346.pdf "Microstructure and Market Dynamics in Crypto Markets"
[17]: https://www.sciencedirect.com/science/article/pii/S2214845025001188 "High-frequency dynamics of Bitcoin futures"
