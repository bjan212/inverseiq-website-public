# Xrypt Release Checklist

## Current batch: Post-publish activation guard and calibration baseline

| Check | Status | Evidence |
|---|---|---|
| Batch scope frozen | Complete | Prevent accidental/stale live starts, ensure persisted inactive state terminates the in-memory loop, preserve the published one-minute safe cadence, and add outcome-based calibration metrics without lowering the 88 gate |
| Hyperliquid REST constraint | Complete | Official aggregate limit is 1,200 weight/minute; each 20-market dual-timeframe scan nearly consumes a minute's budget, so the immediate successor starts after the 60-second rolling window |
| Non-overlap | Complete | Each completed cycle schedules exactly one successor; an in-flight guard prevents a second concurrent cycle |
| Low-score cadence | Complete | Ineligible outcomes queue the next scan immediately and start after 60 seconds rather than the former five-minute delay |
| Error cadence | Complete | API, rate-limit, balance, execution, and worker failures back off exponentially from 60 seconds to a five-minute cap |
| Stop-race safety | Complete | Abort state and persisted `isActive` are rechecked before collateral access and again before order submission |
| Explicit start authorization | Complete | Browser confirmation plus an exact server-validated start token are required; stale clients and empty or replayed start mutations fail validation |
| Persisted stop enforcement | Complete | Managed cycles re-read persisted active state before scanning and before scheduling a successor; inactive or unreadable state terminates the loop fail-closed |
| Private shadow calibration | Complete | Versioned 15-minute best-candidate observations store evidence components and ambiguity-safe TP/SL/time outcomes; live score adjustment remains locked off |
| Real calibration baseline | Complete | One stopped-worker scan considered 177 pairs, analyzed 20/20 with 0 unavailable, and stored one private 69/100 ineligible observation without changing trading state |
| Timeframe evaluation | Complete | Real 48-hour Hyperliquid BTC/ETH/SOL diagnostics plus three primary studies support retaining 5m primary + 1m confirmation; one-minute-only execution remains disabled |
| Execution controls | Complete | 88–100 A/A+ gate, 25% dynamic margin, auto-max leverage, one position, ten trades/day, TP/SL verification, emergency close, and non-loosening trailing stop are unchanged |
| UI disclosure | Complete | Stopped development Auto Trader visually shows 1 private observation, 0 resolved outcomes, observed mean 69.00, live adjustment locked off, 88/100 execution floor, 25% dynamic margin, auto-max leverage, and one-minute safe-rescan disclosure without layout failure |
| Focused tests | Complete | 49 start/stop confirmation, cadence, request-weight, non-overlap, stop-race, candidate-gate, margin, signing, and trailing-stop tests pass |
| Full test suite | Complete | 61 test files and 318 tests pass, including activation, calibration, timeframe, cadence, execution, private-learning, and protection regressions |
| TypeScript | Complete | `pnpm exec tsc --noEmit` passes |
| Production build | Complete | Production build passes after activation, calibration, and timeframe changes |
| Development scanner load | Complete | Authenticated preview loads without runtime or layout failure; Auto Trades panel shows Idle with no trade and settings remain user-controlled |
| Diff audit | Complete | `git diff --check` passes; only activation guard, calibration, timeframe diagnostics, UI, schema migration, tests, and documentation files changed; temporary collection script removed |
| Production Auto Trader | Safe hold | Latest readback confirms inactive/idle, 25% margin, auto-max leverage, 1 position, 10/day, 60-second cadence setting, 88 floor, Hyperliquid only, and no worker error; the prior exchange check confirmed 0 positions and 0 open orders |
| Production domains | Complete | Managed domain loaded the published scanner; xrypt.net briefly returned a Railway edge 404 after deployment, then recovered to HTTP 200 for `/` and `/scanner` with no code or trading-state change |
| User-controlled Publish | Pending | Required after final checkpoint |
| Post-publish production verification | Complete | Startup recovered 0 active traders with no runtime error; managed and custom domains load; xrypt.net shows Idle, 1 private observation at mean score 69.00, live adjustment locked off, 88 floor, 25% dynamic margin, auto-max leverage, and one-minute safe-rescan disclosure |
| Best Trade score consistency | Complete locally | Primary and runner-ups are ranked on comparable base evidence; final Auto Trader evidence after ML/private safety suppression is shown separately. Real visual scan: primary 71/100 base, alternatives 69/68/66, final Auto Trader score 66/100 |
| Best Trade regression validation | Complete locally | 61 test files and 320 tests pass; TypeScript and production build pass; live Auto Trader execution threshold and risk controls are unchanged |
| Best Trade production verification | Complete | Published xrypt.net scan showed CL at 72/100 base above 68/65/63 alternatives, with final Auto Trader score 66/100 after safeguards and explicit below-88 disclosure |
| Shadow-calibration production outcome | Complete | Private observation 630003 at 69/100 was independently resolved as hit_sl; no live order was opened because the 88 execution gate correctly suppressed it |
| Post-ranking live safety check | Complete | Active worker continues one-minute rescans across 177 Hyperliquid perps; latest checks show 0 positions, 0 open orders, and no forced or sub-threshold execution |
| Extended first-position watch | Active | Additional cycles now consider 178 active perps and continue rejecting 65–69 evidence candidates; latest Hyperliquid readback remains 0 positions and 0 orders, so TP/SL and trailing verification remain market-event dependent |
| Live evidence-score distribution | Complete | Expanded denominator-safe audit covered 71 production cycles: mean 68.46/100, maximum 69/100, and 0 candidates at or above the 88 execution gate; no execution or protection event occurred |
| Signal feedback end-to-end verification | Complete | Multiple real 7 September BTC/USDT signals persisted, were independently resolved hit_tp, and reached delivered feedback status while tradeTaken and tradeVerified both remained 0 |
| Twilio SMS | User-deferred | No SMS credentials requested or changed; Telegram, browser, in-app, and email channels remain in scope |
| Continuous score root cause | Complete | v2 applied `min(rawEvidenceScore, 69)` whenever broad execution eligibility failed, collapsing strong near misses into the same visible band |
| Continuous score implementation | Complete locally | `evidence-confluence-v4-hl-microstructure` preserves monotonic weighted evidence through 70–87 while the independent 88+ A/A+ execution gate and all risk controls remain unchanged |
| Continuous score live probe | Complete | Non-executing 20-market Hyperliquid scan produced PONS 72/100 and HYPE 70/100; both remained execution-ineligible, proving differentiation without trade authorization |
| Calibration version isolation | Complete | v4 observations and summaries are filtered by model version so historical v2 capped and v3 continuous outcomes cannot contaminate the enriched score distribution |
| Continuous score validation | Complete | 61 test files and 322 tests pass; TypeScript and production build pass |
| Strict Hyperliquid microstructure enrichment | Complete locally | v4 adds material cached OI trend and a labelled 1m candle-volume flow proxy to existing funding and L2-book inputs, increasing strict evidence capacity from 4 to 6 without new requests |
| Strict microstructure live probes | Complete | Read-only five-market probes showed L2 and candle-flow agreement/disagreement transparently; immaterial OI remained neutral as designed, and no probe entered an order path |
| Strict microstructure validation | Complete | 61 test files and 322 tests pass; TypeScript and production build pass after v4 model-version isolation and conflict-discount regressions |
| Continuous score deployment safety stop | Complete | Production UI shows Idle/Start; persisted `isActive=0` and `currentStatus=idle`; no enabled Auto Trader recovery schedule was listed; Hyperliquid readback shows 0 positions and 0 orders; 88 floor and existing risk controls are unchanged |
| Continuous score production verification | Complete | Published Best Trade scan showed HYPE base evidence 68/100, runner-ups 65/65/64, and final Auto Trader evidence 65/100 after safeguards. Scores are comparable and no longer use the v2 hard-69 display cap; the Auto Trader remains Idle.
| v3 live restart | Complete | User explicitly authorized activation after a fresh flat-account preflight. Production is scanning with 178 pairs considered, 20 deeply analyzed, no unavailable data, 88 minimum, 25% dynamic margin, auto-max leverage, one-position and ten-per-day limits. First v3 result VVVUSDC scored 72/100 and was correctly rejected; Hyperliquid remained flat with zero orders.
| v3 live score distribution | Complete | Consecutive production cycles produced VVVUSDC 72/100, NEARUSDC 76/100, and NEARUSDC 80/100. The 80/100 NEAR long had technical 100 and aligned direction, but microstructure 50 and entry grade B kept it below the independent 88+ A/A+ execution authorization. No order was opened.
| Live Auto Trader restart | Separate approval | Requires fresh flat-account preflight and renewed explicit authorization for the faster scan cadence |
| First genuine position protection check | Outcome-dependent | Verify actual 25% margin, TP/SL triggers, reduce-only grouping, and trailing behavior after a genuine eligible fill |

## Standing rules

The Publish action is never automated. Read-only verification continues automatically after deployment confirmation. Live orders, position changes, credential changes, destructive data operations, and payments always retain explicit approval gates.
