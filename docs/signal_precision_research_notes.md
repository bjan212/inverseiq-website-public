# Signal Precision Research Notes

## Validated primary-source findings

### Probability calibration

Scikit-learn defines a well-calibrated classifier as one where predicted probability matches observed frequency: predictions near 0.8 should be correct approximately 80% of the time. Calibration must use data independent from the model-training data; fitting a calibrator on training predictions biases probabilities toward 0 and 1. The documentation supports sigmoid/Platt scaling for smaller samples and warns that isotonic regression is more flexible but overfits small datasets; it suggests isotonic generally needs roughly more than 1,000 samples. Reliability diagrams, Brier decomposition, and log loss should be used together rather than treating raw confidence as accuracy.

Source: https://scikit-learn.org/stable/modules/calibration.html

### Selective learning and abstention

NeurIPS 2025 research on selective learning for time-series forecasting reports that uniformly learning every noisy or anomalous timestep contributes to overfitting. Its dual-mask approach filters uncertain and anomalous timesteps during training. For Xrypt, the practical translation is to treat abstention as a first-class output and train/calibrate on event-relevant, generalizable samples instead of manufacturing a signal for every market state.

Source: https://proceedings.neurips.cc/paper_files/paper/2025/hash/8cf54ff53f44835b9bdab2c546a1ca6d-Abstract-Conference.html

### Leakage-resistant validation

The 2024 SSRN study by Arian, Norouzi Mobarekeh, and Seco compares out-of-sample methods in a synthetic controlled financial environment. Its abstract reports lower probability of backtest overfitting and stronger Deflated Sharpe Ratio stability for combinatorial purged cross-validation than conventional walk-forward testing. This supports using purging/embargo and multiple chronology-respecting paths before promoting any feature or confidence rule.

Source: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4686376

### Meta-labeling and path-aware outcomes

The Hudson & Thames research separates a primary directional model from a secondary take-or-skip model. It uses event-based sampling, triple-barrier labeling, lagged features, and held-out out-of-sample evaluation. The authors report benefits in two tested strategies but explicitly note dependence on a useful primary model and quality contextual features. Xrypt should therefore use meta-labeling as a filter, not as a claim that a weak directional model becomes profitable.

Source: https://hudsonthames.org/wp-content/uploads/2022/04/Does-Meta-Labeling-Add-to-Signal-Efficacy.pdf

## Preliminary implementation implications

1. Replace raw composite-score percentages with separately stored raw score, calibrated success probability, calibration version, regime, and abstention reason.
2. Keep the 88–100 automated threshold, but apply it to out-of-sample calibrated probability only.
3. Label outcomes by first TP, SL, or time barrier touched using exchange-native mark/index and realistic fees, funding, slippage, and fill state.
4. Add a take-or-skip meta-model and hard abstention when calibration support is sparse, model disagreement is high, liquidity is weak, or the regime is out of distribution.
5. Promote changes only after purged/embargoed validation, walk-forward monitoring, and live shadow evaluation demonstrate improved precision without unacceptable coverage collapse.

## Official connected-exchange history constraints

### Hyperliquid

Hyperliquid exposes public-address fill history through the official `POST /info` endpoint. `userFillsByTime` accepts the actual master or sub-account address plus `startTime`, optional `endTime`, and `aggregateByTime`. Although the page documents a general 500-element cap for time-range responses, the endpoint-specific section explicitly allows up to 2,000 fills per response and limits availability to the 10,000 most recent fills. Pagination advances from the last returned timestamp. Because fills are address-readable, history learning should use the configured account address and never decrypt or export the signing key.

Source: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

### Binance USD-M Futures

Binance’s official `GET /fapi/v1/userTrades` endpoint is signed and requires an API key. It requires a symbol and supports `startTime`, `endTime`, `fromId`, and `limit` up to 1,000. The official documentation states that a requested time window cannot exceed seven days and the endpoint supports only the previous three months; omitting time bounds returns the last seven days. Xrypt therefore needs symbol-aware incremental cursors and a first-connect backfill that walks seven-day windows, while warning users that API retention may not cover their entire history.

Source: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade

## Market microstructure and perpetual-specific features

### Microstructure signals are informative but weak after costs

A 2026 Frontiers study tested nine classical microstructure measures on 3,417,972 minute-level observations across six major cryptocurrencies on Binance spot and perpetual futures. Range-based spread proxies and realized volatility were among the most stable features, but gradient-boosted models overfit under proper leakage controls and no tested strategy survived realistic standard exchange fees. Models did not transfer well across different assets, although same-asset spot-to-futures transfer was meaningful. Xrypt should therefore use order-flow imbalance, depth, spread, and realized-volatility features primarily as pair-specific gating/context features, not as a universal standalone alpha engine.

Source: https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1811716/full

### Perpetual basis, funding, and arbitrage limits

The 2024 `Fundamentals of Perpetual Futures` paper formalizes funding as the mechanism that tends to narrow futures-spot gaps, while emphasizing that perpetuals have no expiry date that guarantees convergence. Its empirical work finds large, correlated deviations from theoretical no-arbitrage values and connects those deviations to funding, liquidity constraints, momentum, and common sentiment. The paper also warns that apparent arbitrage remains exposed to margin and liquidation risk. Xrypt should add pair-specific basis z-scores, funding percentile and direction, cross-asset basis stress, and divergence from same-asset spot as contextual features or vetoes; it should not label these as risk-free arbitrage.

Source: https://arxiv.org/html/2212.06888v5

## Research synthesis: highest-priority signal changes

| Priority | Change | Why it improves trustworthiness |
|---|---|---|
| 1 | Calibrated probability layer trained only on held-out, chronology-safe outcomes | Converts composite scores into empirically interpretable probabilities and prevents an 88 score from masquerading as an 88% win probability |
| 2 | Triple-barrier, exchange-aware outcome labels plus a secondary take-or-skip model | Aligns training labels with TP, SL, and time expiry while reducing false positives |
| 3 | Pair- and regime-specific calibration with hard abstention | Avoids pooling incompatible assets/regimes and refuses predictions outside supported data |
| 4 | Execution-aware features and net-edge vetoes | Rejects signals whose expected movement cannot cover spread, fees, funding, latency, and slippage |
| 5 | Model-disagreement and data-quality vetoes | Prevents high displayed confidence when independent models disagree or venue-native data is incomplete |
| 6 | User-specific inverse learning with shrinkage and recency weighting | Personalizes patterns without letting a small or stale trade history dominate the global signal engine |

## Short-timeframe and high-frequency evidence

The 2026 *Explainable Patterns in Cryptocurrency Microstructure* study uses one-second Binance Futures order-book and trade data, not OHLC candles alone. Its strongest short-horizon feature families are top-of-book spread/depth, order-flow imbalance, trade imbalance, and buy/sell VWAP deviation from the mid. The study evaluates with rolling time-series cross-validation, a deliberate temporal purge gap, conservative taker/maker execution assumptions, and flash-crash robustness. This supports a future event-level microstructure model, but it does **not** justify converting the current candle-based Auto Trader into one-minute-only execution.

Source: https://arxiv.org/html/2602.00776v1

Browser validation on 7 September 2026 confirmed the paper's one-second Binance Futures order-book/trade dataset, three-second mid-price target, spread/depth/order-flow/VWAP feature families, and rolling time-series validation with a purge gap.

Easley, O'Hara, Yang, and Zhang use one-minute crypto bars to construct Roll, Roll-impact, Kyle lambda, Amihud, and VPIN measures with 50- and 100-bar lookbacks. Their predictive targets use a substantial forward window to avoid overlap between adjacent rolling features and labels. Reported AUC values are generally 0.54–0.61, which is evidence of modest predictability rather than near-certain directional accuracy.

Source: https://stoye.economics.cornell.edu/docs/Easley_ssrn-4814346.pdf

Pinto's 2025 study evaluates Bitcoin and Ether perpetual-futures microstructure across 1-, 5-, 10-, 15-, 30-, and 60-minute aggregations. It explicitly warns that one-minute data may be distorted by bid–ask bounce, discrete prices, and order-book frictions, and notes that increasing aggregation reduces microstructure noise. The paper cites five-minute sampling as more accurate for realized-volatility forecasting.

Source: https://www.sciencedirect.com/science/article/pii/S2214845025001188

The public browser route presented a human-verification challenge during follow-up validation. The open-access article text and methodology had already been retrieved through direct full-page extraction; no claim in this note relies on a search-result snippet alone.

**Current engineering implication:** retain **five-minute candles as the primary setup timeframe and one-minute candles as confirmation**. The faster one-minute rescan cadence improves search latency without pretending that one-minute candles provide true high-frequency microstructure. A one-minute-primary or sub-minute execution mode should remain disabled until Xrypt has synchronized event-level book/trade data, realistic fee/slippage/funding simulation, purged walk-forward evaluation, and regime-specific sample sufficiency.
