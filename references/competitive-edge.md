# InverseIQ / XRYPT.NET — Competitive Edge & Accuracy Specification

## 1. Competitive Landscape Summary

| Platform | Accuracy Claim | What They Do Well | Critical Gap |
|---|---|---|---|
| **TradingView** | No signal accuracy claim | 400+ indicators, Pine Script, multi-asset | No AI setup finder, no 1-click execution, no futures-specific scanner |
| **3Commas** | No accuracy claim | Bot automation, signal routing, multi-exchange | Signals come from 3rd-party providers — no proprietary accuracy engine |
| **altFINS** | "130+ signals" (no % claim) | 150+ pre-computed indicators, AI chart patterns | Spot-focused, no perp futures OI/funding integration, no 1-click trade |
| **Coinalyze** | No accuracy claim | OI, funding rate, liquidation data | Data-only, no signal generation, no execution |
| **Hyblock** | No accuracy claim | Liquidation heatmaps, screener | No AI signal generation, no execution |
| **Token Metrics** | ~55–65% directional | Fundamental AI ratings | Fundamentals-only, no technical confluence, no execution |
| **LunarCrush** | No accuracy claim | Social sentiment | No technical signals, no execution |
| **CryptoPulse AI** | "83% success rate" (unverified) | Mobile app signals | No multi-timeframe confluence, no execution, no personalization |
| **Telegram groups** | "80–90%" (unverified) | Community, fast alerts | No verifiable track record, no execution, no personalization |

### Key Industry Findings
- **Industry-wide directional accuracy: 55–65%** for AI-only tools (Jenova.ai, academic research)
- **Multi-timeframe confluence raises accuracy by 8–15%** (academic: MDPI, KuCoin research)
- **Confidence-score thresholds** (only showing HIGH-confidence signals) push win rate to 67–72% (Lennartsson & Csanadi, 2025)
- **Personalization / inverse learning** is largely absent from all competitors — no tool learns from the individual user's loss patterns
- **1-click execution** is absent from all signal/scanner tools (3Commas has bots, not 1-click from a signal)
- **Futures-specific signals** (funding rate, OI trend, liquidation proximity) are absent from all signal generators — only data tools (Coinalyze, Hyblock) provide this data without signals

---

## 2. Our Accuracy Edge — The 5-Layer Confluence Engine

Every competitor generates signals from 1–2 layers. We use **5 stacked layers** that must all agree before a signal is issued.

### Layer 1 — Multi-Timeframe Technical Confluence (MTF-TC)
- RSI alignment across 5m / 15m / 1h / 4h (all must point same direction)
- MACD histogram direction on 1h and 4h
- Bollinger Band position (price relative to bands on 1h)
- EMA stack (9/21/50 alignment on 1h)
- **Minimum 4/6 indicators must agree → signal proceeds to Layer 2**

### Layer 2 — Futures Market Microstructure (FMM)
- Funding rate direction and magnitude (positive = bullish bias, negative = bearish)
- Open Interest trend (rising OI + rising price = strong long; rising OI + falling price = strong short)
- Liquidation proximity (avoid signals near large liquidation clusters)
- Volume delta (buy vs sell pressure on 15m)
- **All 4 must align with signal direction → signal proceeds to Layer 3**

### Layer 3 — Volatility & Timing Filter (VTF)
- ATR-based entry quality (entry must be within 0.3 ATR of current price)
- Avoid signals in first/last 30 min of major session opens (high noise)
- Minimum volume threshold (avoid low-liquidity setups)
- **All 3 must pass → signal proceeds to Layer 4**

### Layer 4 — AI Confidence Scoring (ACS)
- LLM synthesises all Layer 1–3 data and assigns a confidence score 0–100
- Only signals scoring ≥ 72 are shown (industry threshold for meaningful edge)
- LLM also generates the entry, TP1, TP2, SL, R:R ratio, and validity window
- **Score ≥ 72 → signal proceeds to Layer 5**

### Layer 5 — Inverse Learning Personalisation (ILP)
- For logged-in users: cross-reference signal against their personal loss patterns
- If this exact setup (symbol + direction + RSI zone + session) has lost ≥ 3 times for this user → suppress or invert
- If this setup has won ≥ 3 times → boost confidence score by +10
- **Personalised confidence score replaces Layer 4 score for display**

### Expected Accuracy by Layer
| Layers Active | Expected Win Rate |
|---|---|
| Layer 1 only (industry standard) | 55–62% |
| Layers 1–2 (+ futures microstructure) | 63–68% |
| Layers 1–3 (+ volatility filter) | 67–72% |
| Layers 1–4 (+ AI confidence threshold) | 70–75% |
| Layers 1–5 (+ inverse personalisation) | 73–80%* |

*Personalised accuracy improves with more trade history. New users start at Layer 4 accuracy.

---

## 3. Gem Finder Edge (Spot)

Competitors (CoinGecko, DEX Screener, altFINS) show data but don't generate actionable spot setups.

Our Gem Finder uses:
- **Dip + Recovery Pattern**: price down 15–40% from ATH but RSI recovering from oversold
- **Volume Accumulation**: rising volume on down candles (institutional accumulation signal)
- **Narrative Momentum**: token category trending (AI, RWA, DePIN, etc.)
- **On-chain Proxy**: exchange outflow (coins leaving exchanges = holding, bullish)
- **Risk Tier**: Very High / High / Medium / Low based on market cap + liquidity

---

## 4. Unique Differentiators vs All Competitors

1. **Only tool with 5-layer confluence** — competitors use 1–2 layers
2. **Only tool with inverse personalisation** — learns from YOUR losses, not generic data
3. **Only tool with 1-click execution** — from signal to trade in one click, no copy-pasting
4. **Only tool combining futures microstructure (OI/funding) with technical confluence in a single signal**
5. **Validity timer based on live ATR** — not a fixed "24h" window like competitors
6. **Confidence threshold enforcement** — we refuse to show LOW-confidence signals (competitors show everything)

---

## 5. Consolidated Tool Architecture

### Tool 1: Futures Scanner (`/scanner`)
Single page, two modes:
- **AUTO**: Scan all 4 exchanges → 5-layer filter → surface single best setup
- **MANUAL**: Search any coin → run 5-layer filter → show full breakdown

All of these are merged INTO the Futures Scanner:
- FuturesScanner.tsx (deep scan logic)
- MultiExchangeScanner.tsx (multi-exchange universe)
- Top3.tsx / Deep Scanner (top candidates)
- TradePredictor.tsx (direction prediction)
- AiSetupFinder.tsx (best trade button)
- LiveScanner.tsx (current unified page)
- Platform scanner tabs

### Tool 2: Gem Finder (`/gem-finder`)
Single page, SPOT ONLY:
- Auto-scan for dip+recovery gems across all major spot markets
- Risk tier filter (Very High / High / Medium / Low)
- Watchlist + alerts
- Manual search for any spot coin
