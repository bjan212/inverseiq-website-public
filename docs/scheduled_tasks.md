# Project Scheduled Tasks

This registry records project-level Heartbeat jobs that are not owned by an individual end user. The task identifier is required to inspect, pause, resume, or delete the corresponding job through `manus-heartbeat`.

| Task | Task UID | Schedule (UTC) | Callback | Purpose |
|---|---|---|---|---|
| Daily confidence snapshot | `FmKeuDpEgv362Jn7AFbg8q` | `0 5 0 * * *` | `/api/scheduled/confidenceSnapshot` | Creates one verified confidence-history snapshot for the previous UTC day. |
| Signal outcome verifier | `dmrYahGejDN3M8cnmKbbKs` | Every 5 minutes | `/api/scheduled/signalVerify` | Verifies pending signals against Hyperliquid-native candle data and records outcomes; also checks at most ten due private shadow-calibration observations with ambiguity-safe TP/SL/time labels. |
| Feedback outbox delivery | `ivQzqJxeT9HqRcMJu328hY` | Every 5 minutes | `/api/scheduled/feedbackDelivery` | Current job created after the fingerprint-enabled publish; delivers locally queued verified outcomes to the continuous-learning backend with retry tracking. |
| Market condition monitor | `oUSwE8cSrFNgaKyA62sBkT` | Every 10 minutes | `/api/scheduled/marketMonitor` | Detects material changes to pending signal conditions and dispatches preference-aware alerts. |
| Active trade monitor | `UcB6opeEyWFhhGvqP7noqN` | Every 1 minute | `/api/scheduled/tradeMonitor` | Refreshes tracked open-trade P&L and sends configured risk warnings. |
