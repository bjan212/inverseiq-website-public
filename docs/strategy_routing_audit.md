# Strategy Routing Audit

## Verified backend-routed path

`AiSetupFinder` generates actionable setups through the server-side `bestCoinNow` mutation. The returned setup carries server-engine direction, entry, take-profit, stop-loss, technical, microstructure, volatility, volume-profile, and sentiment inputs. Persisted high-confidence signals therefore originate from the server signal engine rather than from a browser-only strategy calculation.

## Intentional local-only paths

The browser strategy registry (`InverseIQ`, `Supertrend`, `MomentumRSI`, and `Composite`) is retained for local UI exploration and the legacy `Top3` experience. It is not the source of persisted AiSetupFinder trading signals. `BacktestEngine` is also intentionally local because it performs client-side historical presentation rather than live execution eligibility.

## Remaining migration boundary

The AiSetupFinder selector currently labels the persisted signal strategy but does not pass a selected strategy to the `bestCoinNow` server contract. A complete per-strategy backend migration requires a backend API contract that accepts a strategy identifier and returns strategy-specific server-engine output. This remains intentionally open rather than silently presenting the selector as an execution switch.
