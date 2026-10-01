# Freqtrade Research Findings for InverseIQ Platform

## Source: https://github.com/freqtrade/freqtrade (52,478 stars, GPL-3.0)

## What Freqtrade Is
- Free, open source crypto trading bot written in Python
- Supports all major exchanges (Binance, Bybit, OKX, Hyperliquid, Gate, Bitget, Kraken, etc.)
- Contains backtesting, plotting, money management tools
- Strategy optimization by machine learning (FreqAI)
- Controlled via Telegram or WebUI

## Key Features Relevant to InverseIQ

### 1. FreqAI - Adaptive Machine Learning (HIGHEST VALUE)
- **Self-adaptive retraining**: Models retrain during live deployments to adapt to market conditions
- **Rapid feature engineering**: Create 10k+ features from simple base indicators (RSI, MFI, EMA, SMA, BB, ADX, ROC, volume)
- **Feature expansion**: Auto-expands features across multiple timeframes (5m, 15m, 4h), correlated pairs, shifted candles
- **Outlier detection**: DI (Dissimilarity Index), SVM, DBSCAN methods to remove bad data
- **Dimensionality reduction**: PCA to reduce training data size
- **Supported ML models**: LightGBM, XGBoost, CatBoost, PyTorch, Reinforcement Learning
- **Realistic backtesting**: Emulates self-adaptive training on historic data
- **Labels/Targets**: Predicts future price movement (e.g., close price shift / rolling mean)

### 2. Exchange Connections (via CCXT)
- Uses CCXT library for unified exchange API access
- Supports both spot and futures on: Binance, Bybit, OKX, Hyperliquid, Gate, Bitget, Kraken
- Handles leverage, margin modes, position management
- Already covers all exchanges we support

### 3. Strategy System
- Pluggable strategy architecture
- Strategies define: buy/sell signals, indicators, stoploss, take profit, trailing stop
- Hyperopt: automated parameter optimization using Bayesian optimization
- Edge positioning: calculates win rate, risk reward, optimal staking

### 4. Backtesting Engine
- Full historical simulation with realistic fills
- Supports multiple timeframes
- Lookahead analysis (prevents data leakage)
- Recursive analysis (prevents formula issues)

### 5. Data Pipeline
- Automatic OHLCV data downloading from exchanges
- Multi-timeframe data handling
- Trade data to OHLCV conversion
- Data normalization and cleaning

### 6. Telegram Bot Integration
- Start/stop trading
- View open positions, profit/loss
- Force exit trades
- Performance reports
- Balance checks

### 7. Risk Management
- Stoploss (fixed, trailing, custom)
- ROI (Return on Investment) tables
- Position sizing based on available balance
- Edge positioning (Kelly criterion-like)

## What We Can Adapt for InverseIQ

### A. FreqAI Feature Engineering Pipeline (HIGH PRIORITY)
**Current InverseIQ**: Uses basic RSI/MACD/BB indicators + LLM analysis
**Freqtrade approach**: Generates 10k+ features by expanding base indicators across:
- Multiple timeframes (5m, 15m, 1h, 4h, 1D)
- Correlated pairs (BTC, ETH correlation)
- Shifted candles (lagged features)
- Multiple periods (10, 20, 50, 100, 200)

**Implementation idea**: Create a server-side feature engineering pipeline that:
1. Takes a symbol
2. Downloads multi-timeframe OHLCV data
3. Computes expanded feature set (RSI across 5 periods × 4 timeframes = 20 features just from RSI)
4. Feeds into ML model for direction prediction
5. Returns confidence score + direction

### B. Self-Adaptive Model Retraining (HIGH PRIORITY)
**Current InverseIQ**: Static LLM-based analysis, inverse learning from user history
**Freqtrade approach**: Models retrain every N candles on fresh data
**Implementation idea**: 
- Train lightweight models (LightGBM/XGBoost) on recent market data
- Retrain periodically (every 4h or daily) via Heartbeat job
- Use model predictions to boost/validate LLM signal confidence
- Track model accuracy over time

### C. Hyperopt Strategy Optimization (MEDIUM PRIORITY)
**Current InverseIQ**: Fixed indicator parameters
**Freqtrade approach**: Bayesian optimization of strategy parameters
**Implementation idea**:
- Allow users to run parameter optimization on their preferred pairs
- Find optimal RSI thresholds, EMA periods, etc. for each symbol
- Store optimized parameters per symbol in DB

### D. Backtesting Module (MEDIUM PRIORITY)
**Current InverseIQ**: No backtesting capability
**Freqtrade approach**: Full historical simulation
**Implementation idea**:
- Add a "Backtest Strategy" page
- User selects symbol, timeframe, date range
- System runs signal generation on historical data
- Shows simulated P&L, win rate, drawdown

### E. Outlier Detection for Signal Quality (LOW-MEDIUM)
**Current InverseIQ**: No outlier filtering
**Freqtrade approach**: DI, SVM, DBSCAN to identify unusual market conditions
**Implementation idea**:
- Before generating a signal, check if current market conditions are "normal"
- If outlier detected, reduce confidence or add warning
- Helps avoid signals during flash crashes, manipulation events

### F. Correlated Pairs Analysis (LOW-MEDIUM)
**Current InverseIQ**: Analyzes pairs independently
**Freqtrade approach**: Includes correlated pair features in predictions
**Implementation idea**:
- When analyzing ETHUSDT, also check BTC, SOL, etc.
- If BTC is dumping, reduce LONG confidence on alts
- Cross-pair correlation as a signal filter

### G. Edge Positioning / Kelly Criterion (ALREADY PARTIALLY DONE)
**Current InverseIQ**: Has Kelly criterion in PreExecutionModal
**Freqtrade approach**: Calculates expected return, win rate, risk/reward per pair
**Status**: Already implemented, could enhance with historical accuracy data

## What We Should NOT Take

1. **Full bot automation** - InverseIQ is signal-focused with 1-click execution, not a fully autonomous bot
2. **Python runtime** - Our platform is Node.js/TypeScript, we'd adapt concepts not code
3. **CCXT library directly** - We already have direct exchange API integrations
4. **Dry-run mode** - Not applicable to our signal generation model
5. **GPL-3.0 code** - Cannot copy code directly due to license, but can implement similar concepts

## Recommended Implementation Priority

1. **Feature Engineering Pipeline** - Expand our indicator analysis from ~10 features to 100+ per signal
2. **Self-Adaptive ML Model** - Add LightGBM/XGBoost predictions alongside LLM analysis
3. **Backtesting Page** - Let users validate strategies on historical data
4. **Outlier Detection** - Filter out unreliable market conditions
5. **Hyperopt** - Auto-optimize parameters per symbol
6. **Correlated Pairs** - Cross-pair analysis for better context
