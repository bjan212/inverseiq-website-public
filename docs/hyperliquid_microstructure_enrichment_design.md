# Hyperliquid Microstructure Enrichment Design

## Observed constraint and v5 remediation

The prior strict Hyperliquid implementation normalized four venue-native inputs into six discrete points. This made a strong book, flow, and contextual-confirmation picture look similar to a weak threshold-crossing picture, and an otherwise useful setup could be bottlenecked by an arbitrary integer point boundary.

The `evidence-confluence-v5-hl-microstructure-continuous` model retains the same existing inputs and execution floors, but converts their measured strength into a bounded continuous score. It does not lower the independent 88–100 A/A+ authorization gate.

## Data sources and request budget

Hyperliquid’s shared `metaAndAssetCtxs` response includes current funding, open interest, mark price, and day notional volume. The existing strict scan already fetches 120 primary and 60 secondary candles plus one L2 book per selected market. The enrichment will use only data from those existing calls:

| Evidence input | Source | Additional request weight | Continuous contribution |
|---|---:|---:|---:|
| L2 depth imbalance | Existing per-market L2 book | 0 | Up to 50 points, bounded by signed notional imbalance |
| Short-horizon candle-volume flow proxy | Existing 1-minute confirmation candles | 0 | Up to 35 points, bounded by signed-volume share |
| Funding stress | Existing shared asset context | 0 | Up to 10 contrarian points when materially extreme |
| Open-interest change | Consecutive cached shared asset contexts | 0 | Up to 5 points only for material rising OI confirming technical direction |

Opposing directional strengths are subtracted rather than ignored. The established one-minute request estimate remains unchanged because no extra market-data calls are introduced. This preserves the documented 1,200 REST-weight-per-minute IP limit while operating within the existing 20-market rate-budget guard.[1]

## Interpretation safeguards

The candle-volume measure is a **proxy**, not native trade-side CVD. It is labelled as `1m candle-flow proxy` in output. The signal remains neutral when candle direction/volume is insufficient. Open interest remains neutral until two shared market contexts are available; falling OI is exhaustion context only and cannot create an autonomous short signal. Neither field can be inferred from a missing response.

The enrichment makes evidence differentiation more complete; it does **not** promote a weak setup automatically. The versioned v5 score remains a non-probabilistic evidence score. Execution remains separately constrained to 88–100, A/A+ entry quality, aligned technical and microstructure directions, minimum component floors, risk/reward, verified TP/SL, dynamic margin, and all existing fail-closed checks.

## Validation criteria

Tests prove that neutral or falling OI remains neutral, conflicting evidence has no directional shortcut, partial alignment stays intermediate, and only strong aligned observable inputs can clear the microstructure floor. A live read-only probe inspects fields without sending any exchange action.

## References

[1]: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits "Hyperliquid: Rate limits and user limits"
