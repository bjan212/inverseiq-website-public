# Project TODO

- [x] Batch future implementation changes into fewer checkpoints and continue read-only/non-sensitive work automatically after deployment confirmation, while retaining user-controlled Publish and explicit live-trading approvals
- [x] Document the enforced release workflow: batch non-sensitive changes, retain user-controlled publishing, and automatically continue read-only production verification after deployment confirmation
- [x] Add a durable release checklist that records each batch’s scope, pre-publish validation, approval gates, and post-publish verification steps

## Incident: Hyperliquid Balance Display (Sep 2026)
- [x] Reconcile the displayed total balance with the configured Hyperliquid wallet’s live account state
- [x] Compare matched-wallet perpetual-margin and spot account values before changing balance labels
- [x] Reconcile the Hyperliquid mobile-app Perps balance with the matched wallet’s legacy query; the unified-account USDC response is the funded collateral source
- [x] Update Auto Trader preflight collateral mapping to use the matched Hyperliquid unified-account balance instead of treating legacy perpetual withdrawable value as the sole source

## Incident: Public Website Access (Sep 2026)
- [x] Diagnose and restore the post-publish xrypt.net 404 route while preserving the stopped Auto Trader and verified managed deployment; the custom domain returned a transient Railway edge 404, then recovered to HTTP 200 without code or trading-state changes
- [x] Diagnose and restore access to xrypt.net and the managed production domain
- [x] Fix the confirmed blank white production page at xrypt.net after inspecting boot and asset errors

## Completed Features
- [x] Define Strategy interface and refactor Analysis Engine
- [x] Implement Supertrend strategy module
- [x] Create Strategy Registry for dynamic switching
- [x] Update UI to support strategy selection
- [x] Update 'crypto-trading-dev' skill templates
- [x] Deliver updated skill with Strategy Builder
- [x] Pluggable Strategy Builder (Inverse IQ, Supertrend, Composite)
- [x] Web3 wallet connection (wagmi + viem)
- [x] Direct DEX trading integration (Hyperliquid)
- [x] Margin and Leverage controls
- [x] Mobile-optimized trading UI
- [x] Live Signals page (Top3.tsx) with dynamic AI engine
- [x] Upgrade to full-stack (web-db-user)

## New Features (Database Integration & Verification)
- [x] Resolve client/src/main.tsx conflict (merge TradeProvider with tRPC providers) — superseded by the current tRPC application shell
- [x] Resolve client/src/pages/Home.tsx conflict (merge existing sections with template) — superseded by the current Home implementation
- [x] Resolve package.json conflict (merge dependencies) — superseded by the current build configuration
- [x] Create database schema for Signal History table — implemented as signalHistory
- [x] Implement backend API to save signals (POST /api/signals) — implemented through tRPC signal procedures
- [x] Implement backend API to retrieve signals (GET /api/signals) — implemented through tRPC signal procedures
- [x] Create Trade Verification page (/verification or /history) with real signal-history data
- [x] Align AiSetupFinder high-confidence persistence with the stated >80% threshold, or document and verify the current threshold — verified at ≥80% with persisted real signal fields
- [x] Implement signal outcome verification logic (check if TP was hit) — implemented by SignalVerifier
- [x] Add timestamp, entry, TP, and outcome columns to the verified signal-history page

## Real-Time Notification System
- [x] Create notification schema in database
- [x] Implement notification API endpoints (save, list, mark as read)
- [x] Set up WebSocket server for real-time updates
- [x] Create notification context and hooks
- [x] Build notification center UI component
- [x] Integrate notifications into signal verifier
- [x] Add browser push notification support
- [x] Test notification flow end-to-end

## Backend Integration (After Notifications)
- [x] Align the continuous-learning health test timeout with its 10-second network abort so a healthy endpoint cannot fail at Vitest's shorter default timeout
- [x] Clone inverse-iq GitHub repo — completed in the continuous-learning backend integration work
- [x] Review backend architecture and API endpoints — completed in the continuous-learning backend integration work
- [x] Connect frontend to backend AI engine — implemented through backendService.ts
- [x] Replace the static InverseIQ strategy with backend API calls — implemented through backendService.ts
- [x] Audit remaining static strategy paths and document backend-routed versus intentional local-only behavior
- [x] Add strategy-selection support to the backend bestCoin contract without treating the AiSetupFinder selector as a server execution switch
- [x] Add validated AI Best Pick and Momentum RSI strategy preferences to the best-coin server contract
- [x] Wire the AI Setup Finder selector to the supported server preferences without enabling trade execution
- [x] Verify continuous learning feedback loop end-to-end: retained verified outcomes remained queued during outage and were marked delivered after the recovered backend retry
- [x] Add server-side feedback outbox so verified signal outcomes persist locally across backend outages
- [x] Create and persist the project-level feedback-delivery Heartbeat task after publication
- [x] Verify a queued feedback record remains pending on backend failure and is later marked delivered by the scheduled retry path
- [x] Repair the feedback-delivery Heartbeat callback after its production target returned Application not found (404)
- [x] Recreate the feedback-delivery Heartbeat after the latest publish so it targets the fingerprint-enabled production version
- [x] Activate and record the published SignalVerifier, market-monitor, active-trade-monitor, and feedback-delivery Heartbeat tasks
- [x] Verify first successful runs for each newly activated durable callback through the platform schedule manager
- [x] Add persisted bounded exponential backoff for feedback outbox retries while the external backend is unreachable
- [x] Deploy the lightweight compatibility backend to production at https://learning.xrypt.net
- [x] Update Xrypt’s server-only backend URL to https://learning.xrypt.net and verify HTTPS connectivity
- [x] Create a replacement DigitalOcean backend droplet with the user's existing SSH key and validate secure SSH access — superseded by the approved console-guided deployment path and a repository-scoped read-only deploy key
- [x] Configure the replacement droplet for backend deployment, firewalling, process supervision, and health verification — completed for the compatibility service behind HTTPS
- [x] Deploy the existing continuous-learning backend package to the replacement Droplet and verify queued feedback connectivity — safely superseded by the lightweight compatibility service; seven retained verified outcomes were delivered once
- [x] Recover the missing continuous-learning backend repository: identified bjan212/inverse-iq and committed the compatible backend service
- [x] Establish an approved SSH deployment access method for the new Droplet without sharing the user's private key — completed with console access plus a read-only repository deploy key
- [x] Configure a 1 GB swap file and 128 MB Node heap / 192 MB service memory caps for the 458 MB Droplet
- [x] Capture non-sensitive swap, memory, and service resource evidence from the production Droplet
- [x] Remove hard-coded deployment secrets and change the recovered backend default listener to the required port 3001 — completed in the compatibility service, which uses root-readable environment configuration and binds to 127.0.0.1:3001
- [x] Protect or disable recovered backend administrative and credential-submission routes before public exposure — completed by deploying only the compatibility service, which omits those legacy routes
- [x] Reconcile the recovered backend feedback handler with the Xrypt outbox payload and idempotent retry behavior
- [x] Implement a lightweight continuous-learning compatibility backend with health, statistics, and verified-feedback endpoints
- [x] Add contract and idempotency tests for the lightweight backend before deployment
- [x] Configure the matching server-only feedback key on the deployed compatibility backend and validate an authenticated delivery
- [x] Resolve the observed 401 feedback-key mismatch between Xrypt production and the deployed compatibility backend
- [x] Add a cron-only feedback-key fingerprint diagnostic to compare production and Droplet configuration without exposing secrets

## Backend Integration (Continuous Learning AI) - IN PROGRESS
- [x] Clone inverse-iq GitHub repository to /home/ubuntu/inverse-iq
- [x] Review backend architecture and API structure
- [x] Create deployment package (inverseiq-backend-deploy.tar.gz)
- [x] Upload to DigitalOcean droplet (146.190.233.46)
- [x] **MANUAL STEP REQUIRED**: SSH into droplet and complete deployment — superseded by completed console deployment to the replacement host:
  ```bash
  ssh root@146.190.233.46
  cd /opt/inverseiq-backend
  npm install
  # Open firewall for port 3001
  ufw allow 3001/tcp
  # Restart PM2
  pm2 restart inverseiq-backend
  pm2 logs inverseiq-backend
  # Test health endpoint
  curl http://localhost:3001/api/health
  ```
- [x] Verify backend is accessible from external: http://146.190.233.46:3001/api/health
- [x] Update INVERSEIQ_BACKEND_URL secret to http://146.190.233.46:3001
- [x] Create backend service layer in frontend (backendService.ts)
- [x] Replace static InverseIQ strategy with backend API calls
- [x] Verify backend outcome-delivery retry behavior against the reachable authenticated HTTPS backend
- [x] Generate one non-executing live signal through the server contract: MUUSDT LONG, confidence 69, with no active auto-trader and no new auto-trade record
- [x] Verify newly generated, independently resolved live signals follow the complete persistence-to-feedback path without submitting an order; multiple 7 September BTC/USDT signals were stored, resolved hit_tp, delivered once, and remained tradeTaken=0 / tradeVerified=0
- [x] Verify deployed backend health, AI Stats read access, and the protected feedback request path
- [x] Diagnose the current backend timeout and obtain or establish the approved deployment-access path for recovery — old host was unreachable and the recovery path was completed on the replacement host
- [x] Retire the old-host root-cause investigation: exact cause remained unconfirmed because no console inspection was completed, but external SSH/HTTP evidence established unavailability and the secure replacement is active

## Notification Preferences
- [x] Create notificationPreferences table in database
- [x] Add notification preferences API endpoints
- [x] Build notification preferences UI page
- [x] Add toggle switches for each notification type
- [x] Add settings link to notification center
- [x] Test notification preference API
- [x] Implement preference filtering in notification context
- [x] Apply persisted in-app and browser preferences at client-side notification dispatch points
- [x] Audit every notification emitter, including market monitoring, signal verification, gem alerts, and Telegram bridges, and document its preference model
- [x] Apply persisted email and SMS event-type preferences to general signal and market notifications routed through notificationPreferences
- [x] Test general signal and market notification suppression for in-app, browser, email, and SMS delivery
- [x] Add focused preference tests for the intentionally separate gem-alert and Telegram-alert delivery models

## Email/SMS Alerts & Market Updates
- [x] Integrate email service using Manus built-in API
- [x] Integrate SMS service using Twilio
- [x] Create market condition monitoring service
- [x] Implement signal update detection logic (price movement, volatility)
- [x] Add email/SMS notification channels
- [x] Create notification templates for email/SMS
- [x] Test multi-channel notification delivery (5 tests passing)
- [x] Integrate multi-channel notifications into signal verifier
- [x] Add market monitoring to server startup
- [x] Request Twilio credentials from user (optional for SMS) — user explicitly deferred SMS; Telegram, browser, in-app, and email notifications remain enabled

## AI Statistics Dashboard
- [x] Create backend API endpoints for AI statistics
- [x] Fetch learning metrics from backend (patterns, traders, confidence)
- [x] Build AI statistics dashboard page component
- [x] Add data visualizations (progress bars for pattern distribution)
- [x] Display real-time learning status
- [x] Show pattern source breakdown (public vs trader data)
- [x] Add navigation link to AI stats page
- [x] Test dashboard with live backend data: user confirmed the published overview metrics after refresh
- [x] Verify the recovered backend’s delivered-outcome metrics render in AI Statistics on desktop and mobile
- [x] Normalize recovered backend flat statistics fields into the AI Statistics source and confidence breakdown contract
- [x] Fix AI Statistics rendering zero values when the recovered backend reports delivered outcomes
- [x] Refactor AI Statistics to consume only the normalized proxy statistics object, not ambiguous detailed fallback data
- [x] Add a reproducible UI regression test for normalized AI Statistics overview metrics
- [x] Add a project-file-backed mobile rendering verification artifact for AI Statistics live metrics

## Signal Outcome Feedback Loop & Confidence Trend Charts
- [x] Integrate submitSignalFeedback in signal verifier after each outcome
- [x] Track feedback submission success/failure with logging
- [x] Add confidenceHistory table to database schema
- [x] Record confidence snapshots daily for trend tracking
- [x] Add tRPC endpoint to fetch confidence history data
- [x] Build confidence trend area chart on AI Stats page (Recharts)
- [x] Add win rate trend chart over time
- [x] Add daily signal outcomes bar chart (TP/SL/Expired)
- [x] Add time range selector (7d/14d/30d/60d)
- [x] Test feedback loop with the live backend using retained real verified outcomes; all seven were delivered once after recovery

## Multi-Exchange Market Scanner (CEX + DeFi)
- [x] Build Bybit API data fetcher (futures + spot)
- [x] Build OKX API data fetcher (futures + spot)
- [x] Build Hyperliquid API data fetcher (DeFi perps)
- [x] Build dYdX API data fetcher (DeFi perps)
- [x] Build GMX API data fetcher (Arbitrum/Avalanche DeFi)
- [x] Create unified market aggregator that normalizes data across all exchanges
- [x] Implement liquidity depth scoring (order book thickness)
- [x] Implement funding rate anomaly detection
- [x] Implement cross-exchange price inefficiency detection
- [x] Add volume/OI ratio analysis
- [x] Create composite "best trade" scoring algorithm
- [x] Build MultiExchangeScanner UI component with exchange filter
- [x] Add exchange badge/tag to each signal card
- [x] Show liquidity score and funding rate per signal
- [x] Add copy-trade button for Hyperliquid signals (Web3 wallet)
- [x] Add copy-trade button for CEX signals (direct exchange link)
- [x] Add MultiExchangeScanner section to Home page
- [x] All 24 tests passing

## Bug Fixes
- [x] Fix AI Stats Network Error - route backend calls through tRPC server-side proxy

## Signal Validity Countdown Timer
- [x] Build useSignalCountdown hook (calculates validity from volatility/volume/timeframe)
- [x] Build SignalCountdown component with progress bar and color-coded status
- [x] Integrate countdown into AiSetupFinder signal cards
- [x] Gray out expired signals and show refresh button
- [x] Browser push notification at 5 minutes remaining
- [x] Browser push notification on signal expiry

## Binance Futures API Integration
- [x] Add binanceApiKeys table to database schema
- [x] Add tRPC endpoints for save/delete/test API key, hasApiKey, placeOrder, getPositions
- [x] Build BinanceSetup page with API key management
- [x] Add "Setup Binance API" link to Navbar
- [x] Build live positions panel using Binance Futures API
- [x] Add one-click order execution from AiSetupFinder signal cards
- [x] Encrypt API keys at rest using AES-256-CBC
- [x] All 24 tests passing

## Gem Finder Page
- [x] Build gem scanning engine (multi-exchange low-cap screener)
- [x] Implement risk-appetite filters (Very High / High / Medium / Low)
- [x] Add market cap range selectors and volume spike detection
- [x] Create dip depth + recovery momentum scoring
- [x] Build GemFinder page UI with full scanner and filter panel
- [x] Add gem watchlist with database persistence (tRPC + MySQL)
- [x] Embed notification panel for gem alerts (browser + persistent)
- [x] Auto-notify when watched gem breaks out
- [x] Add Gem Finder to Navbar navigation
- [x] All 24 tests passing

## Bug Fixes & Improvements (Mar 2026)
- [x] Add countdown validity timer to MultiExchangeScanner signal cards
- [x] Integrate active, warning, and expired validity states plus an actionable refresh path into scanner signal cards
- [x] Fix AI Stats page - no confidence history data showing
- [x] Audit AI Stats confidence-history records, query response, and chart transformation against live stored data
- [x] Fix AI Stats so available local confidence history renders without waiting for an unavailable backend stats service
- [x] Remove fabricated confidence-history seed data and replace duplicate snapshot inserts with a one-row-per-date real-data upsert
- [x] Replace AI Stats in-process confidence snapshot timer with an authenticated durable scheduled callback
- [x] Create and persist the project-level daily confidence snapshot Heartbeat task identifier after deployment
- [x] Implement continuous background confidence snapshot collection
- [x] Seed initial confidence data so AI Stats shows results immediately

## Features Page & AiSetupFinder Fix (Mar 2026)
- [x] Complete Features page with all platform features (multi-exchange, copy trading, gem finder, notifications, verification, AI stats)
- [x] Fix AiSetupFinder to always return a signal (add guaranteed fallback signal generation)
- [x] Add RSI/MACD momentum strategy as guaranteed fallback
- [x] Explain Deep Market Scanner vs AiSetupFinder difference in UI

## Bybit/OKX API + AsterDEX + Signal of the Day (Mar 2026)
- [x] Add AsterDEX to multiExchangeScanner.ts (public ticker API)
- [x] Add AsterDEX to exchange colors/icons/filter list
- [x] Add AsterDEX to Home page exchange coverage list
- [x] Extend DB schema: add cexApiKeys table for Bybit/OKX
- [x] Add Bybit API key save/verify/delete/placeOrder tRPC procedures
- [x] Add OKX API key save/verify/delete/placeOrder tRPC procedures
- [x] Rewrite BinanceSetup page as multi-exchange CEX API setup page (tabs: Binance/Bybit/OKX)
- [x] Add Bybit/OKX trade buttons to MultiExchangeScanner signal cards — implemented in Trade Execution Expansion
- [x] Add Signal of the Day quality-gated tRPC endpoint (highest eligible recent signal in last 24h)
- [x] Build SignalOfTheDay component with countdown timer
- [x] Insert SignalOfTheDay hero card on homepage

## Trade Execution Expansion (Mar 2026)
- [x] Add Bybit one-click trade button to MultiExchangeScanner signal cards
- [x] Add OKX one-click trade button to MultiExchangeScanner signal cards
- [x] Add AsterDEX Web3 EIP-712 trade execution button to MultiExchangeScanner
- [x] Rename "Binance API" nav link to "Exchange Setup" in Navbar

## Trading Dashboard — Platform Page (Mar 2026)
- [x] Fix raw floating-point price artifacts in Platform live-signal entry, target, and stop displays
- [x] Audit the existing Platform route, panels, and live-data queries against this legacy dashboard backlog
- [x] Build unified Platform dashboard page (Inter font, dark black design) — implemented in Platform.tsx
- [x] Left sidebar: Signal of the Day, tool nav, API key status, 30d stats
- [x] Main area: tabbed panels (Live Signals / Scanner / AI Setup Finder / Gem Finder / Stats)
- [x] Right panel: Open Positions, Live Alerts, AI Performance, Inverse Learning upload
- [x] Wire live signals from DB via tRPC (signals.list, last 24h)
- [x] Wire scanner results from multiExchangeScanner lib
- [x] Wire gem finder results from the gemScanner library
- [x] Wire open positions from Binance/Bybit/OKX APIs
- [x] Wire live alerts from notification history
- [x] Keep Platform.tsx as the unified trading dashboard implementation
- [x] Route App.tsx /platform to the unified Platform dashboard

## Platform UI Optimization + Trade Taken + Exchange Expansion + AI Analyzer (Mar 2026)
- [x] Optimize Platform dashboard: sticky price ticker, cleaner sidebar, better signal table UX
- [x] Add "Trade Taken" button to each signal row with manual confirmation
- [x] Add cross-verification: check user's exchange positions against signals
- [x] Add tradeTaken / tradeTakenAt / tradeTakenExchange fields to signalHistory schema
- [x] Add signals.markTradeTaken tRPC procedure
- [x] Add signals.verifyTradeTaken tRPC procedure (cross-checks exchange positions)
- [x] Expand Exchange Setup: MEXC, KuCoin, Gate.io, Bitget API key support
- [x] Add MEXC/KuCoin/Gate.io/Bitget tRPC routers (saveApiKey, verifyApiKey, getPositions)
- [x] Build AI Trade Analyzer page (/trade-analyzer)
- [x] AI Trade Analyzer: fetch positions from all connected exchanges
- [x] AI Trade Analyzer: LLM-powered position health analysis (entry quality, momentum, risk)
- [x] AI Trade Analyzer: generate cut-loss vs hold recommendations with reasoning
- [x] AI Trade Analyzer: show warning levels (safe/caution/danger/exit now)
- [x] Add /trade-analyzer route to App.tsx and Navbar

## Trade Analyzer Improvements (Mar 2026)
- [x] Add multi-timeframe RSI/MACD/BB (15m, 1H, 4H, 1D) to indicators endpoint
- [x] Add funding rate to indicators endpoint
- [x] Add open interest trend to indicators endpoint
- [x] Add volume delta (buy vs sell pressure) to indicators endpoint
- [x] Feed all indicator data into LLM analyze prompt for expert-grade analysis
- [x] Add direction confidence score to analysis result
- [x] Add suggested TP/SL levels based on BB and recent structure
- [x] Rewrite TradeAnalyzer UI with multi-timeframe confluence panel
- [x] Add funding rate and OI panels to PositionCard

## Mobile Optimization (Mar 2026)
- [x] Navbar: hamburger menu, collapsible nav links, touch-friendly — completed in Mobile Optimization Sprint
- [x] Platform dashboard: stack sidebar/main/right panels vertically on mobile, collapsible sidebar — verified via mobile drawer implementation and capture
- [x] Platform dashboard: horizontal scroll for signals table on mobile — verified via mobile overflow container
- [x] Home page: responsive hero, feature cards stack on mobile — verified at 375px capture
- [x] Features page: responsive grid, cards stack on mobile — verified at 375px capture
- [x] Trade Analyzer: implement and verify responsive position cards plus a scrollable indicators panel with code-level mobile layout evidence
- [x] Exchange Setup: responsive tabs (horizontal scroll), form inputs full-width on mobile — completed in Mobile Optimization Sprint
- [x] AI Stats: add explicit mobile-safe chart axis sizing and wire all responsive chart layout tokens end-to-end
- [x] AI Stats: add focused automated coverage for the mobile chart layout class contract
- [x] AI Stats: diagnose and fix the mobile loading state so real confidence-history charts can render
- [x] Gem Finder: responsive gem cards on mobile — verified at 375px capture
- [x] Global: minimum 44px touch targets, readable font sizes on mobile — completed in Mobile Optimization Sprint
- [x] Global: no horizontal overflow on any page — completed in Mobile Optimization Sprint

## Future Features
- [x] AsterDEX programmatic execution — implemented in the completed AsterDEX router, signing, execution UI, and test items below; no new order was submitted during this recovery work

## AsterDEX Programmatic Execution (Mar 2026)
- [x] Add AsterDEX tRPC router (saveApiKey, deleteApiKey, hasApiKey, verifyApiKey, getPositions, getBalance)
- [x] Add AsterDEX placeOrder, setLeverage, cancelOrder tRPC procedures
- [x] Add AsterDEX tab to Exchange Setup page
- [x] Add AsterDEX Execute button to Platform signal cards
- [x] Wire AsterDEX positions into Trade Analyzer cross-exchange view — implemented in Suggested Features Implementation Batch
- [x] Wire AsterDEX positions into Platform right-panel Positions — implemented in Suggested Features Implementation Batch
- [x] Add AsterDEX API key status to Platform sidebar exchange status bar
- [x] Write Vitest tests for AsterDEX router (18 tests, all passing)

## AsterDEX Sidebar Status Widget (Mar 2026)
- [x] Add AsterDEX real-time connection status widget to Platform sidebar (balance, positions count, latency indicator, last-updated timestamp)

## AsterDEX Link Audit & Fix (Mar 2026)
- [x] Audit and fix all broken AsterDEX trade links and execution paths

## AsterDEX Connection Verification (Mar 2026)
- [x] Auto-verify AsterDEX API keys after save (test auth, fetch live balance, show connected/failed status badge)
- [x] Show live USDT balance, available margin, and account tier in the AsterDEX panel after successful verification
- [x] Show clear error messages with fix hints when verification fails (invalid key, IP restriction, permission error)

## Persistent User Inverse Patterns (Mar 2026)
- [x] Add userPatterns table to drizzle schema (userId, patternType, confidence, description, action, tradeCount, createdAt, updatedAt)
- [x] Add db helpers: saveUserPatterns, getUserPatterns, deleteUserPatterns
- [x] Add tRPC procedures: userPatterns.save, userPatterns.list, userPatterns.clear
- [x] Update TradeContext to auto-load patterns from DB on login and persist on upload
- [x] Update AiSetupFinder to use persisted patterns from DB, show "patterns loaded from history" badge
- [x] Write Vitest tests for userPatterns procedures (53 tests total, all passing)

## Symbol-Level InverseEngine Extension (Mar 2026)
- [x] Extend InverseEngine with analyzeSymbolPatterns() — per-pair win rate, avg PnL, direction bias, best/worst pairs
- [x] Add SymbolPattern type to inverseEngine.ts
- [x] Add userSymbolPatterns table to drizzle schema and push migration
- [x] Add db helpers: saveUserSymbolPatterns, getUserSymbolPatterns, deleteUserSymbolPatterns
- [x] Add tRPC procedures: userPatterns.saveSymbols, userPatterns.listSymbols, userPatterns.getSymbol
- [x] Wire symbol patterns into AiSetupFinder adjustSignal() — boost/suppress confidence per pair
- [x] Feed symbol patterns into Trade Analyzer LLM system prompt for pair-specific analysis
- [x] Write Vitest tests for symbol-level pattern analysis (73 tests total, all passing)

## External Exchange Links Audit (Mar 2026)
- [x] Audit and fix all external DEX/exchange trade links to ensure they open the correct asset-specific URL (Binance futures URL fixed, OKX swap URL casing fixed, dYdX domain updated to dydx.trade)

## Futures Trade Direction Predictor (Mar 2026)
- [x] Add predictDirection tRPC procedure (multi-timeframe indicators + LLM UP/DOWN verdict)
- [x] Build TradePredictor page with position input form (symbol, entry, direction, leverage, size)
- [x] Show UP/DOWN verdict with probability %, confidence score, and LLM reasoning
- [x] Show multi-timeframe RSI, MACD, Bollinger Bands, funding rate, OI trend as supporting evidence
- [x] Show per-symbol inverse pattern warning if user has uploaded trade history
- [x] Add /predict route to App.tsx and nav link to Navbar
- [x] Write Vitest tests for predictDirection procedure (28 tests, all passing)

## Futures Market Scanner Page (Jun 2026)
- [x] Add tRPC procedure: getFuturesSymbols — fetch all active USDT perpetual pairs from Binance Futures
- [x] Add tRPC procedure: scanCoin — multi-timeframe indicators + LLM verdict with entry, TP, SL, and bad-entry detection
- [x] Build FuturesScanner page with searchable coin selector (all Binance Futures pairs)
- [x] Show LONG/SHORT verdict card with entry price, TP1, TP2, SL, and R:R ratio
- [x] Show bad-entry warning with "Refresh & Try Again" button when entry timing is poor
- [x] Show validity countdown timer for the signal (with 5-min browser notification)
- [x] Add /scanner route to App.tsx and nav link to Navbar
- [x] Write Vitest tests for scanCoin procedure (0 TypeScript errors)

## Best Coin Right Now Feature (Jun 2026)
- [x] Add bestCoinNow tRPC procedure — fetch top 20 by 24h volume, parallel scan, conviction scoring, return best pick
- [x] Add Best Coin Now button and result card to FuturesScanner page
- [x] Show scanning progress (coin count, progress bar) while running
- [x] Show runner-up coins ranked by conviction score

## Hyperliquid One-Click Trade Execution (Jul 2026)
- [x] Research Hyperliquid EIP-712 order signing and REST API endpoints
- [x] Add hyperliquidKeys table to drizzle schema (userId, encryptedPrivateKey, walletAddress, createdAt)
- [x] Add Hyperliquid signing utility (server/hyperliquidSigning.ts) — EIP-712 order construction and signing
- [x] Add tRPC procedures: hyperliquid.saveKey, hyperliquid.deleteKey, hyperliquid.hasKey, hyperliquid.verifyKey, hyperliquid.placeOrder, hyperliquid.getPositions, hyperliquid.getBalance, hyperliquid.getAccount, hyperliquid.cancelOrder
- [x] Add Hyperliquid tab to Exchange Setup page with private key input, wallet address display, and balance verification (HyperliquidPanel.tsx)
- [x] Add Execute button to all Hyperliquid-tagged signal cards on Platform page (mobile + desktop)
- [x] Add Execute button to Hyperliquid signals in MultiExchangeScanner (pending) — implemented in 1-Click Trade Execution Expansion
- [x] Add Execute button to FuturesScanner verdict card when Hyperliquid is selected (pending) — implemented in 1-Click Trade Execution Expansion
- [x] Write Vitest tests for Hyperliquid signing and tRPC procedures (0 TypeScript errors, all passing)

## Suggested Features Implementation Batch (Jul 2026)
- [x] Quick Predict shortcut on signal cards — brain icon pre-fills /predict with symbol, direction, entry
- [x] My Pairs breakdown page (/my-pairs) — per-symbol win rate table, BOOST/SUPPRESS badges, best/worst pairs — implemented in 1-Click Trade Execution Expansion
- [x] Scan history persistence — scanHistory DB table, save each FuturesScanner + bestCoinNow result, history page — implemented in 1-Click Trade Execution Expansion
- [x] Confidence threshold filter on FuturesScanner — hide verdict when confidence is LOW, show "Insufficient data" message — implemented in 1-Click Trade Execution Expansion
- [x] Pre-execution order modal — configurable size, leverage, limit/market toggle before AsterDEX/Hyperliquid order fires — implemented in 1-Click Trade Execution Expansion
- [x] Kelly criterion position size recommendation in pre-execution modal based on per-symbol win rate — implemented in 1-Click Trade Execution Expansion
- [x] Signal verifier symbol-level accuracy tracking (added symbolAccuracy query + panel on MyPairs page) — record TP/SL outcome per symbol, compare to personal win rate
- [x] Hyperliquid Execute button in MultiExchangeScanner signal cards
- [x] Hyperliquid Execute button on FuturesScanner verdict card
- [x] AsterDEX positions wired into Trade Analyzer cross-exchange view
- [x] AsterDEX positions wired into Platform right-panel Positions
- [x] P&L column on AsterDEX sidebar status card (unrealised PnL)
- [x] Verify the AsterDEX balance threshold alert through a controlled durable monitor callback test
- [x] Inspect and exercise the AsterDEX balance-alert policy through a non-executing controlled callback path
- [x] Add persisted per-user AsterDEX balance floor, enabled browser/Telegram channels, and cooldown-based duplicate-notification state
- [x] Verify AsterDEX balance-floor evaluation and duplicate-notification suppression across repeated controlled monitor runs
- [x] Persist last AsterDEX verification result (checkedAt + last-known balance) to DB for page-load pre-population
- [x] Persist only successful authenticated AsterDEX balance checks and show timestamped last-known status without exposing credentials
- [x] Save prediction history to DB — store each /predict result for accuracy review
- [x] My Pairs nav link in Navbar — verified in the current desktop navigation

## 1-Click Trade Execution Expansion (Jul 2026)
- [x] Add PreExecutionModal component with Kelly criterion position sizing
- [x] Add "EXECUTE LONG/SHORT — 1-CLICK TRADE" button to FuturesScanner verdict card
- [x] Wire PreExecutionModal into FuturesScanner (Binance/Bybit/OKX/Hyperliquid)
- [x] Add Hyperliquid 1-click execution to MultiExchangeScanner SignalCard
- [x] Add hasHyperliquidKey prop to SignalCard and parent scanner component
- [x] Add scan history persistence (scanHistory tRPC router: save/list/clear)
- [x] Add LOW confidence filter to FuturesScanner (skip LOW signals in verdict card)
- [x] Add My Pairs breakdown page (/my-pairs) with per-symbol win rate table
- [x] Add /my-pairs route to App.tsx and Navbar
- [x] Write 11 Vitest tests for Kelly criterion, symbol normalisation, and scan history

## Futures-First Restructure (Jul 2026)
- [x] Navbar redesigned with futures tools as primary group (Futures Tools / Analytics / Account)
- [x] FuturesScanner header updated with PERP FUTURES badge
- [x] TradePredictor header updated with PERP FUTURES badge
- [x] Top3 / Deep Scanner header updated with FUTURES PERPS badge
- [x] MultiExchangeScanner header updated with PERP FUTURES badge
- [x] Platform sidebar: Gems tab removed, Gem Finder shown as external SPOT link
- [x] Platform MainContent: gems panel and gems strip removed
- [x] GemFinder: SPOT ONLY badge added + link back to Futures Scanner
- [x] Hero: futures-first headline, CTAs to Dashboard + Futures Scanner, quick-access tool pills

## AI Sentiment Indicator for Perpetual Futures (Jul 2026)
- [x] Design SentimentScore type and scoring algorithm (funding rate, OI trend, volume delta, RSI, price momentum)
- [x] Build server/lib/sentimentEngine.ts with fetchSentiment(symbol, exchange) function
- [x] Add sentiment tRPC router: sentiment.get (single pair) and sentiment.getBatch (multiple pairs)
- [x] Build SentimentBadge UI component (BULLISH/NEUTRAL/BEARISH with score bar and tooltip)
- [x] Build useSentiment hook with auto-refresh every 30s
- [x] Integrate SentimentBadge into Platform live signals table (next to pair name)
- [x] Integrate SentimentBadge into Platform SignalCard (mobile)
- [x] Integrate SentimentBadge into MultiExchangeScanner signal cards
- [x] Integrate SentimentBadge into FuturesScanner result card
- [x] Add Sentiment Overview mini-panel to Platform sidebar (top 5 pairs by sentiment)
- [x] Write Vitest tests for sentiment scoring logic

## Volume Profile + Social Sentiment Integration (All Tools)
- [x] Build server/lib/volumeProfile.ts — VPVR from candle data (POC, VAH, VAL, HVN/LVN detection)
- [x] Build server/lib/socialSentiment.ts — CoinGecko trending + community data + Fear & Greed index
- [x] Integrate volume profile scoring into signalEngine.ts (affects Live Scanner + AI Setup Finder)
- [x] Integrate social sentiment scoring into signalEngine.ts
- [x] Add volume profile + sentiment to predict.direction router (Trade Analyzer)
- [x] Add volume profile + sentiment to Gem Finder backend
- [x] Update Live Scanner result card UI to show POC, VAH/VAL, sentiment score
- [x] Update Trade Analyzer result UI to show volume profile and sentiment
- [x] Update Gem Finder result UI to show sentiment score
- [x] Update AI Setup Finder (client-side) to display sentiment badge and use server engine

## Inverse Protocol & Signal Intelligence (Jul 2026)
- [x] Wire inverse protocol into signal engine scoring (server-side, not just LLM prompt text)
- [x] Auto-fetch user patterns from DB in bestCoinNow and scanCoin procedures
- [x] Auto-save signals >=85% confidence to signalHistory immediately on generation
- [x] Add Bybit trade history import from connected API keys
- [x] Add OKX trade history import from connected API keys
- [x] Fix exchange filter — Binance-only selection restricts signal universe to Binance pairs
- [x] Fix 1-click trade button to route to the exchange the signal is listed on
- [x] Show multi-exchange validity badge when signal is valid on 2+ exchanges

## Auto-Refresh Scanning, Trade Tracking & Telegram Alerts (Jul 2026)
- [x] Auto-refresh scanning after first scan (every 2 min)
- [x] Market warnings (sell-off, volatility spikes) banner on Live Scanner
- [x] "I Took This Trade" button on signal cards
- [x] Active Trades page with live P&L monitoring (/active-trades)
- [x] Trade health monitoring (SL approach detection, auto-close on TP/SL hit)
- [x] Telegram bot notification service (trade warnings, market alerts, trade closed)
- [x] Trade monitor background service (60s interval, checks all open trades)
- [x] Replace active-trade monitor's in-process 60-second timer with a durable scheduled callback
- [x] Active Trades route added to App.tsx

## Hyperliquid 1-Click Trade Integration Verification (Jul 2026)
- [x] Verify hyperliquidSigning.ts module (EIP-712 signing, buildOrderAction, buildLeverageAction, floatToWire)
- [x] Verify Hyperliquid placeOrder tRPC procedure (market/limit, leverage setting, IOC slippage)
- [x] Verify Hyperliquid key management (saveKey, deleteKey, hasKey, verifyKey, getAccount)
- [x] Verify frontend 1-click execution wired in MultiExchangeScanner, FuturesScanner, LiveScanner, Platform
- [x] Verify HyperliquidPanel.tsx setup UI (private key input, verify, delete, positions display)
- [x] Verify Hyperliquid in Exchange Setup page (BinanceSetup.tsx tab)
- [x] Verify PreExecutionModal supports Hyperliquid exchange selection
- [x] Write and pass 11 vitest tests (signing, API connectivity, order building)
- [x] Confirm live Hyperliquid API connectivity (universe: 231 assets, BTC/ETH mid prices)

## Bug Fix: Mobile Dropdown Menu (Jul 2026)
- [x] Fix top-right corner dropdown menu not functioning correctly on mobile

## Gem Finder Fix (Jul 2026)
- [x] Remove volume selection filter from Gem Finder UI
- [x] Fix Gem Finder not displaying results — remove restrictive filters, just show best coins
- [x] Simplify to show best coins worth considering without volume gate

## Continuous Gem Scanning + Telegram Notifications (Jul 2026)
- [x] Implement server-side periodic gem scanning (Heartbeat job, task_uid: bj4M4e2pz7EHP4unWmGB9h)
- [x] Store discovered gems in database with timestamps
- [x] Send Telegram notifications when new gems are found
- [x] Create dedicated /gems page showing latest updated gems list
- [x] Link Telegram notifications to the gems page

## Bug Fix: Hyperliquid API Key Save Error (Jul 2026)
- [x] Fix Hyperliquid API key save error (authentication/validation issue)

## Navigation: All Pages Must Have Navigation (Jul 2026)
- [x] Ensure every page has Navbar or back-to-home navigation

## Bug Fix: Sign Up Page (Jul 2026)
- [x] Fix the sign-up page — replaced fake email/password form with OAuth sign-in

## Telegram Settings Discoverability + Test Alert (Jul 2026)
- [x] Add "Send Test Alert" button to Telegram Settings page (already existed)
- [x] Make Telegram Settings easily accessible from the navigation/Navbar (added to Account nav group)

## Live Scanner: Best Exchange Recommendation (Jul 2026)
- [x] Show which exchange is best for each trade signal in Live Scanner results

## Dashboard Reorganization + Multi-Exchange Trade + Active Trades (Jul 2026)
- [x] Reorganize dashboard layout — cleaner, more organized (Active Trades in sidebar, multi-exchange modal, streamlined nav)
- [x] Update 1-click trade execution modal: show checkboxes for exchanges that have the valid pair
- [x] Only list exchanges that have the specific pair (e.g., BNBUSDT)
- [x] Allow multi-exchange execution (checkboxes, not single select)
- [x] Add Active Trades to navigation menu
- [x] Add Active Trades section/widget to dashboard

## PreExecutionModal Enhancements + Close Position (Jul 2026)
- [x] Add explicit position size input field to PreExecutionModal
- [x] Add leverage input field to PreExecutionModal
- [x] Add Market/Limit order type toggle to PreExecutionModal
- [x] Add close position button that actually closes the position on the exchange (reduce-only order)
- [x] Update all exchange placeOrder backends to support limit orders (Binance, Bybit, OKX)
- [x] Add AsterDEX execution path to FuturesScanner

## Hyperliquid USDC Pair Fix (Jul 2026)
- [x] Fix Hyperliquid symbol normalization to use USDC instead of USDT
- [x] Show USDC denomination for Hyperliquid pairs in PreExecutionModal
- [x] Only show Hyperliquid as available exchange when the pair actually exists on Hyperliquid
- [x] Validate pair availability against Hyperliquid universe before showing execute option
- [x] Fix MultiExchangeScanner Hyperliquid symbol normalization for USDC pairs
- [x] Fix all exchange close procedures to handle USDC-quoted symbols

## Auto-Load Exchange Balance in PreExecutionModal (Jul 2026)
- [x] Add backend procedure to fetch available balance from each exchange (Binance, Bybit, OKX, Hyperliquid, AsterDEX)
- [x] Wire balance fetching into PreExecutionModal — auto-populate account size when modal opens or exchange selection changes
- [x] Show loading state while fetching balance
- [x] Handle errors gracefully (show manual input fallback)

## PreExecutionModal USDC + Balance Fix (Jul 2026)
- [x] Show USDC denomination label for Hyperliquid and other DEX exchanges in PreExecutionModal
- [x] Ensure balance auto-fills correctly when switching exchanges in PreExecutionModal
- [x] Show USDC pair option when signal is from a USDC exchange (Hyperliquid)

## Nav Menu + Mobile + Predictor Exchange + Deep Scan Coins (Jul 2026)
- [x] Add Futures Direction Predictor to Navbar (desktop + mobile)
- [x] Add Predictor link to Platform sidebar Quick Links
- [x] Add exchange selector to Futures Direction Predictor page (Binance, Bybit, OKX, Hyperliquid USDC, AsterDEX)
- [x] Expand Deep Scan coin search to show all coins from all connected exchanges (dynamic backend query, up to 200 results with exchange badges)

## Mobile Menu + Hyperliquid Positions Fix (Jul 2026)
- [x] Fix mobile hamburger menu animation (double rAF for reliable paint-then-animate on mobile)
- [x] Fix Hyperliquid open positions not showing in Trade Analyzer (symbol now shows as SYMBOL/USDC)
- [x] Add leverage and markPrice to Hyperliquid getAccount response
- [x] Fix indicators procedure to handle USDC-denominated symbols (converts to USDT for kline API)

## Gem Finder Background Notifications (Jul 2026)
- [x] Add minConfidence, enableEmail, enableTelegram fields to gemScanSettings schema
- [x] Add saveAlertPreferences + getAlertPreferences tRPC procedures
- [x] Update gemScannerServer to check per-user confidence threshold and send email/Telegram notifications
- [x] Add Alert Settings UI panel on GemFinder page (threshold slider, email/telegram toggles)

## LEGACY Gem Finder Background Notifications (Jul 2026)
- [x] Add gemAlertPreferences table (userId, minConfidence, enableEmail, enableTelegram, enableBrowser, active) — superseded by gemScanSettings
- [x] Add tRPC procedures for gem alert preferences (get, save, toggle) — superseded by gem alert preference procedures
- [x] Build Gem Alert Settings UI on Gem Finder page (threshold slider, channel toggles) — implemented with current alert settings UI
- [x] Implement Heartbeat job that scans gems periodically and sends email/Telegram alerts when confidence exceeds user threshold — implemented by the active gem scanning task
- [x] Send email notifications via built-in notification API for gem alerts — implemented by current gem alert delivery
- [x] Send Telegram notifications for gem alerts using existing Telegram bot integration — implemented by current gem alert delivery
- [x] Ensure alerts run in background even when user leaves the website (server-side Heartbeat) — implemented by the active gem scanning task

## Checkpoint Suggestions (Jul 2026)
- [x] Implement suggested improvements from the last checkpoint — added normalized AI Statistics contract, responsive overview component, and regression coverage

## User Settings Page + Test Alert Button (Jul 2026)
- [x] Create User Settings page with default exchange preferences (preferred exchange, default leverage, default position size %)
- [x] Add alert configuration section (email address, Telegram chat ID, notification channels toggle)
- [x] Add route to App.tsx and nav link
- [x] Persist settings to DB via tRPC procedures (userSettings router)
- [x] Add "Send Test Alert" button to Gem Finder alert settings to verify email/Telegram config

## Feature Engineering Pipeline + Self-Adaptive ML (Jul 2026)
- [x] Create server/lib/featureEngine.ts — multi-timeframe feature expansion (RSI, EMA, BB, ADX, MFI, OBV, MACD across 5m/15m/1h/4h)
- [x] Generate 100+ features including lagged values (t-1, t-2, t-3) and BTC correlation
- [x] Create server/lib/mlEngine.ts — LightGBM-style classifier using decision tree ensemble
- [x] Implement sliding window training (last 30 days of verified signal outcomes)
- [x] Add Heartbeat job for daily model retraining (/api/scheduled/mlRetrain)
- [x] Wire ML confidence score into signalEngine.ts as a boost/filter layer
- [x] Store model state and feature importance in DB (mlModelState table)
- [x] Add tRPC endpoints: ml.status, ml.retrain, ml.predict, ml.features
- [x] Vitest tests passing (6/6)

## Bug Fix: Signals Shown Backwards (Jul 2026)
- [x] Fix LLM direction override causing entry/TP/SL mismatch in bestCoin procedure
- [x] Fix LLM direction override causing entry/TP/SL mismatch in scanCoin procedure
- [x] Ensure direction always comes from engine (consistent with price levels)

## Bad Entry Filter Feature (Jul 2026)
- [x] Add badEntryFilter field to userSettings schema (hide/deprioritize/show)
- [x] Add tRPC endpoint for saving/reading bad-entry filter preference
- [x] Backend: when filter=hide, re-scan next best coin if top pick is bad entry
- [x] Backend: when filter=deprioritize, reduce confidence and add warning badge
- [x] Frontend: add filter toggle UI in UserSettings page (3-option selector)
- [x] Frontend: pass badEntryFilter from FuturesScanner + AiSetupFinder to backend
- [x] Frontend: visual treatment for filtered (hidden) signals — grey panel with rescan
- [x] Frontend: visual treatment for deprioritized bad-entry signals (warning + reduced confidence)

## Quick-Toggle Bad Entry Filter on Live Scanner (Jul 2026)
- [x] Add inline toggle button (Hide/Deprioritize/Show) directly on FuturesScanner page header
- [x] Toggle updates local state immediately and persists to userSettings in background
- [x] Add tooltip on deprioritized signals showing the specific LLM bad-entry reason ("AI Reason for Flagging" panel)

## Trade Analyzer — Close Position Button (Jul 2026)
- [x] Add "Close Position" button to each position card in Trade Analyzer
- [x] Implement double confirmation dialog before closing (first click → confirm dialog → second click → execute)
- [x] Wire close position to exchange APIs (Binance/Bybit/OKX) via closePosition.execute tRPC procedure

## Close Position PnL Display (Jul 2026)
- [x] Show estimated PnL (dollar amount + percentage) on the double confirmation prompt before closing
- [x] Include entry price, mark price, and leveraged PnL in the confirmation UI

## Pre-Execution Review — Hyperliquid Balance Fix (Jul 2026)
- [x] Verify Hyperliquid USDC balance loading (already correctly implemented via clearinghouseState API)
- [x] Confirmed balance displays correctly as USDC denomination (quoteCurrency: "USDC")

## Pre-Execution Review — TP/SL Fields (Jul 2026)
- [x] Add Take Profit field pre-filled from signal TP value (with % distance display)
- [x] Add Stop Loss field pre-filled from signal SL value (with % distance display)
- [x] Wire TP/SL into the order submission payload (OrderSubmitPayload.takeProfit/stopLoss)

## Dynamic Risk/Reward Ratio in Pre-Execution (Jul 2026)
- [x] Calculate R:R dynamically from TP/SL/Entry in PreExecutionModal
- [x] Display R:R ratio visually between TP and SL fields (color-coded bar + USDT risk/reward amounts)

## Hyperliquid Symbol Normalization Fix (Jul 2026)
- [x] Fix symbol normalization for HL orders: SNDKUSDT → SNDK (strip USDT/USDC/USD + separators)
- [x] Fixed LiveScanner (was only .replace("USDT","") — now robust regex like FuturesScanner)
- [x] Fixed Platform.tsx (added USDC/USD strip)
- [x] getExchangesForSymbol already correctly normalizes (confirmed working)
- [x] Added Hyperliquid support to closePosition procedure (was missing)
- [x] Order placement flow verified: symbol → strip suffixes → match HL universe → place order

## Pre-Execution: % Position Size Buttons (Jul 2026)
- [x] Add 25%/50%/75%/100% buttons to quickly set position size from available balance
- [x] Calculate size based on balance, leverage, and entry price

## Pre-Execution: Exchange/Symbol Badge (Jul 2026)
- [x] Display clear badge showing selected exchange + normalized symbol being traded
- [x] Show USDC denomination for Hyperliquid, USDT for others

## HL Toast Notifications (Jul 2026)
- [x] Verify toast success/error feedback for limit orders on Hyperliquid (already implemented)
- [x] Verify toast success/error feedback for close position on Hyperliquid (already implemented)

## Fix Liquidation Price (Jul 2026)
- [x] Fix liquidation price in Trade Analyzer PositionCard (was entry*(1-1/lev+0.005), now entry*(1-(1-MMR)/lev))
- [x] Fix liquidation price in Trade Analyzer sort function (same formula fix)
- [x] Fix liquidation price in server-side tradeAnalyzer.analyze procedure
- [x] Telegram notifications don't include liq (they show entry/SL/PnL only) — no fix needed

## Telegram: Gem Finder Alerts Integration (Jul 2026)
- [x] Gem Finder alerts already use same Telegram settings (alertOnGems flag)
- [x] Added clear category labels: "💎 SPOT — GEM ALERT" vs "📊 FUTURES — TRADE WARNING" vs "📊 FUTURES — NEW SIGNAL"
- [x] Compact message formatting (removed excessive whitespace, single-line entries)

## Telegram: Interactive Trade Buttons (Jul 2026)
- [x] Add inline keyboard buttons to trade warning messages (Close Trade, Move SL, Set TP, Analyze)
- [x] Implement Telegram bot callback_query handler (telegramCallbackHandler.ts)
- [x] Close trade button: double confirmation with PnL display, then closes in DB
- [x] Adjust SL button: shows breakeven/2%/5% quick-set buttons + reply option
- [x] Set TP button: shows 3%/5%/10% quick-set buttons + reply option
- [x] Compact formatting across all message types (telegramBot.ts rewritten)

## Telegram: /trades Menu Command (Jul 2026)
- [x] Add /trades command handler to show all open positions with exchange info
- [x] Display each trade with symbol, direction, entry, current PnL, and exchange name
- [x] Add inline buttons per trade: Add SL/Move SL, Add TP/Adjust TP, Close Trade, Analyze
- [x] Added /help command with full command reference
- [x] Updated unknown message handler to show commands

## Bug Fix: Mobile Dropdown Menu Not Working (Jul 2026)
- [x] Fix mobile hamburger menu not opening/closing on tap (z-index, pointer-events, event propagation)

## Telegram /trades: Fetch Live Exchange Positions (Jul 2026)
- [x] Updated /trades command to fetch live positions from all connected exchanges (HL, Binance, Bybit, OKX)
- [x] Show real-time PnL from exchange data with leverage and size
- [x] Include inline action buttons (Close, Set SL, Set TP, Analyze) for live exchange positions
- [x] Created telegramExchangeActions.ts for handling exchange-based callbacks
- [x] Double confirmation on close with PnL display
- [x] SL/TP quick-set buttons per position

## Signal Accuracy Investigation (Jul 2026)
- [x] Investigate ML boost/penalty impact on signal accuracy — ML now only penalizes when trained on 50+ samples
- [x] Review if badEntryFilter is too aggressive
- [x] Added ML training guard: penalty only applies when trainingSamples >= 50

## Telegram /balances Command (Jul 2026)
- [x] Add /balances command to show available funds + margin usage across all connected exchanges
- [x] Display USDC for Hyperliquid, USDT for CEX

## Telegram Interactive SL/TP Input (Jul 2026)
- [x] Implement force_reply prompt when clicking Set SL/TP buttons
- [x] Handle reply messages to set custom SL/TP values

## Telegram /trades: Liquidation + Margin Ratio (Jul 2026)
- [x] Calculate and display liquidation price for each live position (all 4 exchanges)
- [x] Show margin ratio with color-coded indicators (🟢 <50%, 🟡 50-75%, 🔴 >75%)

## Telegram Bot: Fix /start + Menu Buttons (Jul 2026)
- [x] Fix /start to detect already-linked accounts and show welcome-back menu
- [x] Add persistent reply keyboard (📊 My Trades, 💰 Balances, ⚙️ Settings, ❓ Help)
- [x] Remove "connect" prompt for already-linked users
- [x] Add keyboard button text handlers for all menu items

## Bug Fix: Mobile Dropdown Menu Not Working (Jul 2026 - Recurrence)
- [x] Fix mobile hamburger dropdown menu — portaled to body to escape overflow-hidden clipping from page wrappers

## Telegram: Show Keyboard From First Interaction (Jul 2026)
- [x] Show persistent reply keyboard on ALL /start responses (new users + already-linked users)
- [x] Ensure keyboard appears even before account linking is complete
- [x] Added keyboard to code verification success and unknown message fallback

## Telegram: Fix Bot Address + Shared Chat ID (Jul 2026)
- [x] Fix incorrect bot address @InverseIQ_bot → @XryptTrade_Bot with clickable link in Gem Finder settings
- [x] When Telegram is linked via /start or code, auto-sync chat ID to gemScanSettings (single link = both services)
- [x] getAlertPreferences auto-populates telegramChatId from main telegramSettings if not set in gem settings

## Dashboard: Asset Deck for Connected Exchanges (Jul 2026)
- [x] Show connected exchanges (Hyperliquid, Binance, Bybit, OKX, AsterDEX) as Asset Deck cards on dashboard with balance/positions/P&L
- [x] Show unconnected exchanges as greyed-out cards with "Connect →" prompt linking to Exchange Setup
- [x] Added Bybit + OKX position queries and combined positions from all 5 exchanges

## Bug Fix: Hyperliquid One-Click Trade Execution (Jul 2026)
- [x] Fix balance not showing — now returns accountValue (full equity) instead of withdrawable
- [x] Fix trades not executing — now fetches live mark price for market orders (was using stale signal entry price)
- [x] Increased slippage from 1% to 3% for reliable IOC market fills
- [x] Added szDecimals rounding (Hyperliquid rejects orders with too many decimal places)
- [x] Added price rounding to 5 significant figures (Hyperliquid standard)

## One-Click Trade: TP/SL Checkbox (Jul 2026)
- [ ] Critical: complete a separately authorized live protected-position check before representing TP/SL placement as exchange-verified in production; code paths and no-live-order tests are complete
- [x] Validate Phantom Agent trigger-action bytes and signatures against the official Hyperliquid SDK before re-enabling execution
- [x] Resolve the previously referenced CHIP TP/SL check: the authorized read-only exchange query found no open CHIP position or CHIP trigger orders, so no order was submitted
- [x] Perform an authorized read-only Hyperliquid CHIP position and open-trigger protection check without modifying exchange state: no open CHIP position or CHIP trigger orders were present
- [x] Add checkbox in PreExecutionModal to enable TP/SL (defaults ON, toggleable)
- [x] Show TP and SL price input fields + R:R ratio only when checkbox is checked (pre-fill from signal data)
- [x] Pass TP/SL values in the onSubmit payload (conditionally based on checkbox state)
- [x] Implement server-side TP/SL trigger order placement on Hyperliquid after entry fill
- [x] Wire TP/SL through LiveScanner + FuturesScanner handleOrderSubmit
- [x] Support TP/SL request builders for Binance, Bybit, and OKX with validation and exchange-native protection semantics; no live CEX order was submitted
- [x] Add Binance, Bybit, and OKX market-entry TP/SL request builders with direction validation and exchange-native position protection semantics
- [x] Report unverified or pending protection explicitly for limit entries and partial exchange-side failures
- [x] Add test coverage for CEX TP/SL request fields and position-closing safeguards without placing live orders

## Auto Trades — Automated Trading Loop (Jul 2026)
- [ ] Authenticate the production browser as the Xrypt owner before retrying the user-authorized v4 Auto Trader start; the last start never reached the server because the page showed Sign In and the settings row remained unchanged
- [ ] Diagnose and repair the explicit Auto Trader start path after a user-confirmed v4 start left the production worker idle with no start log or recovery task
- [ ] Add regression coverage for the explicit start token, durable-recovery creation, user feedback, and active-state readback so a failed start cannot be presented as active
- [x] Stop and diagnose the unintended post-publish Auto Trader reactivation before any timeframe or calibration change; production startup recovered 0 active traders, the later start followed a web-client session, and the fail-closed stop left 0 positions and 0 orders
- [x] Require an explicit server-validated Auto Trader start confirmation payload and browser confirmation so a stale, replayed, or accidental start request cannot reactivate production
- [x] Re-check persisted active state at every managed-cycle boundary and before scheduling a successor so a database-level safety stop terminates the in-memory scan loop, not only the order path
- [x] Evaluate the current 5m-primary/1m-confirmation strategy against shorter-timeframe alternatives using real Hyperliquid diagnostics and primary research; retain 5m primary + 1m confirmation because one-minute OHLC movement is too small/noisy for a justified one-minute-only strategy
- [x] Begin the next non-overlapping scan immediately after a completed low-score or otherwise ineligible result, starting it after Hyperliquid's one-minute REST-weight window instead of waiting five minutes
- [x] Preserve bounded exponential backoff after API, rate-limit, or worker errors so immediate queued rescanning cannot create an uncontrolled retry storm
- [x] Re-check the abort signal and persisted active state immediately before any order path so a stop request during a scan cannot race into execution
- [x] Prove immediate queued rescan does not change the 88–100 A/A+ gate, dynamic 25% margin, auto-max leverage, one-position limit, daily limit, or TP/SL and trailing safeguards
- [x] Stop the currently active five-minute-cadence worker before publishing the immediate-rescan behavior so deployment cannot change live cadence without renewed approval
- [x] Replace fixed Auto Trader margin with a dynamic 25% of available Hyperliquid unified-account USDC calculation at each eligible entry, with fail-closed balance validation and clear UI telemetry
- [x] Recreate a missing or stale Auto Trader recovery task during an explicitly authorized restart instead of starting the live worker without durable recovery
- [x] Diagnose and prevent the unexpected post-publish transition from active/scanning to inactive/idle: only the stop path writes that state, so stop now requires an explicit typed confirmation payload, a browser confirmation, and a production audit log
- [x] Monitor multiple live scan cycles and verify truthful telemetry, durable recovery, and strict eligibility without loosening the dynamic 25%-of-available-balance / 88–100 A/A+ limits
- [x] Replace the rate-limited deep scan with an all-active-pairs metadata prefilter and rotating rate-limit-safe deep-analysis set
- [x] Report all-pairs considered, pairs deeply analyzed, and unavailable pairs separately in Auto Trader telemetry
- [x] Prevent development hot reloads from recovering an active production Auto Trader and creating a duplicate live worker
- [ ] Verify the first newly accepted live position has exchange-side TP/SL and a functioning non-loosening trailing stop
- [ ] Verify protected position closure, cooldown, continuous rescan, and durable recovery after a real trade outcome
- [x] Start the user-authorized 70 USDC Hyperliquid Auto Trader and verify protected scanning state: worker scanning, no open position, durable recovery task present
- [x] Set the stopped Auto Trader’s margin configuration to the user-requested 70 USDC without enabling execution
- [x] Perform a read-only activation preflight and present maximum exposure before any Auto Trader start action
- [x] Obtain final explicit activation confirmation after the matched wallet’s unified-account collateral exceeded the configured 70 USDC margin
- [x] Re-run the read-only perpetual-collateral preflight against the inactive 70 USDC Auto Trader configuration
- [x] Enforce Hyperliquid USDC perpetual contracts as the sole Auto Trader market scope
- [x] Replace Hyperliquid Auto Trader USDT symbol aliases with USDC perpetual contract symbols
- [x] Require 88–100 confidence and A-quality entry gates before any future Auto Trader entry eligibility
- [x] Verify continuous Hyperliquid scanning configuration: full-universe cycles remain non-overlapping at five-minute intervals while inactive
- [x] Restrict Auto Trader discovery and execution eligibility to the full Hyperliquid perpetual universe
- [x] Raise Auto Trader entry eligibility to 88+ confidence and retain the existing high-quality entry gate
- [x] Require verified exchange-side TP/SL protection before accepting a new automated Hyperliquid position
- [x] Add a conservative trailing-stop safety mechanism that never loosens protection
- [x] Complete the separately authorized signed Hyperliquid trailing-stop modify-and-verify implementation while Auto Trader remains stopped
- [x] Integrate and test the authorized exchange-side Hyperliquid trailing-stop modify-and-verify path while Auto Trader remains stopped
- [x] Implement and test a code-only verified reduce-only Hyperliquid stop-trigger modification builder without sending a live request
- [x] Complete a non-executing readiness audit for Hyperliquid-only scanning, 88+ gating, mandatory TP/SL verification, and trailing-stop integration
- [x] Validate that Auto Trader leverage 0 resolves to each Hyperliquid pair’s current maximum leverage and fails closed when metadata or the leverage update response is unavailable
- [x] Add "Auto Trades" tab to Live Scanner page (alongside Auto/Manual/History)
- [x] Build server-side autoTrader engine:
  - [x] Scan loop: use signalEngine on 5m timeframe to find 90%+ confidence + A-grade entry signals
  - [x] Execute: place market order on Hyperliquid with TP/SL trigger orders
  - [x] Monitor: poll position status until TP/SL hit or manual stop
  - [x] Repeat: after position closes, wait cooldown then scan again (15s interval)
- [x] Build Auto Trades UI panel:
  - [x] Start/Stop toggle button (big, prominent, animated)
  - [x] Margin per trade input (fixed $ amount, $5-$10000)
  - [x] Leverage selector (1x-50x)
  - [x] Max concurrent trades setting (1-3)
  - [x] Max daily trades limit (0=unlimited)
  - [x] Cooldown between trades setting (seconds)
  - [x] Minimum confidence threshold (default 90%)
  - [x] Live status display (Scanning / Executing / In Position / Cooldown / Error / Idle)
  - [x] Current position card (if active) with symbol + direction
  - [x] Trade history log (recent auto-executed trades with outcomes)
  - [x] Daily P&L + Total P&L + Win Rate stats
  - [x] Telegram notification toggle for auto-trade events
  - [x] Symbol include/exclude filters
  - [x] Max drawdown protection setting
- [x] Add tRPC endpoints:
  - [x] autoTrader.start — start the loop for user
  - [x] autoTrader.stop — stop the loop
  - [x] autoTrader.status — get current state + active position + open trades
  - [x] autoTrader.history — get recent auto-trade results
  - [x] autoTrader.updateSettings — update margin/leverage/limits
- [x] Add autoTraderSettings table to DB schema (userId, isActive, margin, leverage, maxConcurrent, maxDaily, cooldown, minConfidence, dailyPnl, totalPnl, tradesToday, currentStatus, etc.)
- [x] Add autoTraderHistory table to DB schema (userId, symbol, direction, entryPrice, exitPrice, pnl, outcome, duration, confidence, entryQuality, etc.)
- [x] Send Telegram notification on each trade open/close with P&L details

## Bug Fix: Auto-Trader Symbol Mapping (Jul 2026)
- [x] Fix symbol format mismatch: signal engine returns "BTCUSDT" but Hyperliquid uses "BTC"
- [x] Strip USDT/USDC/USD suffix before executing on Hyperliquid
- [x] Fix allMids price lookup to use converted hlSymbol instead of raw signal.symbol

## Telegram: Auto-Trader Immediate Alerts (Jul 2026)
- [x] Send Telegram alert on successful trade execution (already existed)
- [x] Send Telegram alert on trade close with P&L (already existed)
- [x] Add Telegram alert on FAILED trade execution (new — was previously silent)
- [x] Add Telegram alert on unexpected scan/execute errors (new — catch block notification)

## Auto-Trader: Full Hyperliquid Universe + Max Leverage (Jul 2026)
- [x] Scan ALL available Hyperliquid perp coins (fetches full universe from meta API, 5min cache)
- [x] Auto-detect and use maximum available leverage per asset from Hyperliquid API
- [x] Update UI to show "AUTO MAX" leverage toggle (leverage=0 means auto-max per asset)
- [x] Telegram notifications show actual leverage used (e.g., "50x (MAX)")
- [x] Router accepts leverage=0 as valid input for auto-max mode

## Bug Fix: Auto-Trader Not Generating Signals + USDT/USDC Cross-Match (Jul 2026)
- [x] Fixed: runSignalScan was using default getTopSymbols() instead of HL universe — now passes customSymbols
- [x] Fixed: Entry quality check was too strict (A/A+ only) — relaxed to B or above (score 55+)
- [x] Fixed: Position monitoring symbol matching (BTCUSDT vs BTC) — now strips USDT/USDC/USD suffix
- [x] Fixed: userFills coin matching also uses HL format
- [x] USDT/USDC cross-match: HL symbols converted to USDT format for OKX/Bybit candle fetching, then back to base for HL execution
- [x] Added console.log debugging for scan results, confidence checks, and entry quality filtering

## Auto Trades: Live Scan Status Indicator (Jul 2026)
- [x] Show which coin is currently being scanned in real-time
- [x] Show timestamp of last completed scan
- [x] Update backend to track lastScanAt and currentScanSymbol in autoTraderSettings

## Live Scan Status Indicator (Auto Trades Tab)
- [x] Add lastScanAt, lastScanSymbol, lastScanCount, lastScanBest fields to autoTraderSettings schema
- [x] Push DB migration for new scan status fields
- [x] Update db.ts updateAutoTraderStatus helper to accept new scan status fields
- [x] Update autoTrader.ts scan cycle to write scan status (lastScanAt, lastScanSymbol, lastScanCount, lastScanBest) to DB
- [x] Add Live Scan Status panel to AutoTradesTab.tsx showing: currently scanning symbol, last scan time (relative), symbols scanned count, best signal found
- [x] Panel auto-refreshes every 5s via existing statusQuery polling

## Signal Engine Accuracy & Reliability Audit (Jul 2026)
- [x] Replace discrete strict Hyperliquid microstructure point buckets with continuous measured strengths for funding, L2-book imbalance, cached OI change, and 1m candle-flow, without adding requests
- [x] Retain neutral treatment for missing or immaterial inputs and a conflict discount when bullish and bearish microstructure strengths compete
- [x] Add continuous-strength regressions proving realistic partial alignment can score between 70–87 while no weak or conflicted setup reaches the 88+ execution band
- [x] Audit why strict Hyperliquid scans repeatedly receive a 50/100 microstructure score from only one directional input and quantify its effect on 88+ eligibility: v3 strict scans used funding and L2 book only, so one two-point book signal became 50/100
- [x] Enrich strict Hyperliquid microstructure confirmation with verifiable funding, order-book, open-interest, and short-horizon trade-flow inputs while keeping request weight within the one-minute budget; cached context and existing 1m candles add no new requests
- [x] Add regressions for neutral, conflicted, and fully aligned microstructure evidence to ensure enrichment is continuous, bounded, and cannot inflate a weak setup into an 88+ executable entry
- [x] Audit why strict Hyperliquid scans repeatedly receive a 50/100 microstructure score from only one directional input and quantify its effect on 88+ eligibility — superseded by the completed v4 enrichment audit above
- [x] Enrich strict Hyperliquid microstructure confirmation with verifiable funding, order-book, open-interest, and short-horizon trade-flow inputs while keeping request weight within the one-minute budget — superseded by the completed v4 enrichment above
- [x] Add regressions for neutral, conflicted, and fully aligned microstructure evidence to ensure enrichment is continuous, bounded, and cannot inflate a weak setup into an 88+ executable entry — superseded by the completed v4 regression coverage above
- [x] Measure the live evidence-component distribution and confirm why strong near-miss setups collapse to 69 or below: v2 returned min(rawEvidenceScore, 69) whenever the broad execution gate failed; a non-executing v3 probe produced real 72 and 70 near-miss scores
- [x] Replace the hard sub-confluence 69 cap with a continuous monotonic evidence scale for 70–87 while preserving separate strict 88+ A/A+ execution eligibility; a live non-executing probe produced 72 and 70 while both remained ineligible
- [x] Add regressions proving stronger partial confluence scores above weaker setups, no failed strict floor reaches 88, and historical evidence labels remain clearly non-probabilistic
- [x] Version the continuous evidence scale separately and filter private calibration summaries by the active model version so v2 capped and v3 continuous scores are never mixed with v4 enriched-microstructure outcomes
- [x] Stop the production Auto Trader before deploying v3 scoring; verify persisted idle/inactive state, no enabled recovery schedule, 0 Hyperliquid positions, 0 open orders, and unchanged 88 floor / 25% margin / auto-max leverage / 1-position / 10-per-day controls
- [x] Audit and correct the 1D Best Trade panel when a lower-scoring primary result is displayed above higher-scoring runner-ups; the card now ranks by comparable base evidence and separately discloses the final Auto Trader score after conservative safeguards
- [x] Separate and label base versus final execution evidence so the primary cannot be presented as the best while showing higher comparable alternatives; real visual verification showed primary base 71/100 above 69/68/66 alternatives and final Auto Trader score 66/100 after safeguards
- [x] Preserve the 88–100 A/A+ execution gate while establishing a measured evidence-score distribution and outcome-calibration baseline; do not force an artificial 85 average
- [x] Add private shadow calibration metrics for evidence-score bands, coverage, verified outcomes, ambiguity-safe labels, and sample sufficiency before allowing any outcome-based score adjustment; first real stopped-worker observation stored at 69/100
- [x] Lock outcome-based score adjustment off until private shadow observations meet minimum resolved and high-band sample thresholds; no calibration path can promote sub-confluence setups into execution eligibility
- [x] Fix the confirmed hard 82% confidence ceiling that makes the required 88–100 Auto Trader gate mathematically unreachable, using conservative evidence-calibrated scoring rather than arbitrary inflation
- [x] Add deterministic tests proving sub-confluence setups remain below 88 while only fully aligned A/A+ setups can reach the executable 88–100 band
- [x] Prevent one isolated Hyperliquid microstructure factor from being reported as 100% microstructure conviction by normalizing against the venue-specific available evidence budget
- [x] Rank execution-eligible candidates by the final conservative evidence-confidence score so a valid 88+ setup cannot be hidden behind a higher raw-composite but sub-threshold candidate
- [x] Stop the currently active capped-confidence worker before publishing the reachable-confidence fix so deployment cannot activate new execution behavior without renewed approval; verified inactive/idle, no recovery schedule, 0 positions, and 0 open orders
- [x] Deep-research modern, evidence-based methods for improving high-confidence crypto-perpetual signal precision without inflating reported confidence
- [x] Define measurable signal-quality targets using out-of-sample precision, calibration error, coverage, drawdown, and regime-specific performance rather than a guaranteed win-rate claim
- [x] Design privacy-preserving, user-scoped trade-history ingestion for every supported connected exchange with explicit consent and minimum read-only permissions
- [x] Automatically import newly connected exchange trade history idempotently and update the user’s inverse patterns and symbol-level patterns
- [x] Scope decision: use one-time post-verification import plus manual refresh; do not add recurring background synchronization
- [x] Keep all imported fills, completed-position reconstructions, and derived inverse patterns private to the owning user with no cross-user aggregation
- [x] Persist exchange-scoped fill provenance and unique identifiers so repeated post-verification or manual imports cannot duplicate history
- [x] Correct generic connector credential lookups and deactivation queries so they are scoped by both user and exchange before automatic imports are enabled
- [x] Trigger a non-blocking one-time history import only after successful credential verification, and expose a manual refresh action with truthful partial-import errors
- [x] Add regression coverage for user isolation, compound idempotency, mixed-owner rejection, incomplete-fill fail-closed behavior, credential tampering, and conservative inverse-pattern updates
- [x] Verify the real Hyperliquid private import twice: 246 rows inserted once, 246 duplicates ignored on retry, 111 completed outcomes derived, and manual pattern provenance preserved
- [x] Prevent private user history and uncalibrated ML agreement from boosting a sub-threshold setup into the 88+ execution band
- [x] Add mocked signed-request, credential/API failure, and pagination contract tests for every exchange adapter before broad multi-venue rollout
- [x] Fix SignalVerifier candle retrieval for Hyperliquid USDC perpetual symbols so outcome metrics are not skipped
- [x] Replace SignalVerifier's in-process 5-minute timer with a durable scheduled callback
- [x] Replace marketMonitor's in-process 10-minute timer with a durable scheduled callback
- [x] Make market-monitor retries idempotent by suppressing duplicate alerts for the same signal and schedule window
- [x] Telegram: make live multi-exchange balances clear, concise, and refreshable from the bot
- [x] Telegram: add a secure exchange-connection handoff that never collects API secrets in chat
- [x] Telegram: add user-configurable A/A+ 95%+ signal alerts with selectable delivery intervals
- [x] Analyze actual historical 95%+ signal frequency; persist A/A+ grades now so exact quality-qualified wait metrics can accumulate
- [x] Emergency: stop the user-authorized Hyperliquid auto-trader and disable its recovery job while signing is repaired
- [x] Pause the still-enabled auto-trader recovery Heartbeat task so it matches the user-authorized stopped state — deleted because the project CLI cannot pause jobs
- [x] Clear the deleted auto-trader recovery task UID from persisted settings
- [x] Apply the user-authorized active Auto Trader minimum-confidence change from 90% to 80% and verify the next worker decision
- [x] Audit recent signal outcomes against the signal direction, entry, TP, and SL recorded at generation time
- [x] Identify failed or stale market-data sources and measure their impact on signal availability and scoring
- [x] Add evidence-based reliability gates so signals without fresh, validated data cannot enter auto-trader execution
- [x] Calibrate signal confidence using verified historical outcomes rather than unvalidated composite scores
- [x] Validate the revised engine with live Hyperliquid data and report observed quality metrics before relying on it for auto-trading
- [x] Replace the in-memory auto-trader runtime model with a durable, user-confirmed operating model so starts survive service restarts
- [x] Run the active Hyperliquid auto-trader on an always-on worker with a 15-second scan/monitor loop
- [x] Add a durable periodic health and recovery job that reconciles persisted settings after restarts
- [x] Persist worker heartbeats, last error, and recovery decisions for user-visible diagnostics

## Mobile Optimization Sprint (Jul 2026)
- [x] Navbar: ensure hamburger menu works reliably, touch-friendly targets (44px+), proper z-index
- [x] Platform dashboard: stack sidebar/main/right panels vertically on mobile, collapsible sidebar
- [x] Platform dashboard: horizontal scroll for signals table on mobile
- [x] Home page: responsive hero section, feature cards stack on mobile
- [x] Live Scanner / FuturesScanner: responsive signal cards, touch-friendly buttons
- [x] Trade Analyzer: responsive position cards, scrollable indicators panel
- [x] Exchange Setup: responsive tabs, full-width form inputs on mobile
- [x] AI Stats: responsive charts, stats cards stack on mobile
- [x] Gem Finder: responsive gem cards on mobile
- [x] AutoTradesTab: responsive settings form and scan status panel on mobile
- [x] Global: no horizontal overflow on any page, minimum 44px touch targets
- [x] Global: readable font sizes on mobile (min 14px body text)

## Bug Fix: My Pairs Duplicate React Keys (Aug 2026)
- [x] Replace duplicate symbol-only React keys on My Pairs with stable collision-safe identifiers
- [x] Add focused coverage for duplicate-symbol normalization and verify the browser warning is eliminated
- [x] Consolidate duplicate My Pairs symbol records before computing summary totals and best/worst pair highlights
