import { BinanceService, Kline } from './binance';
import { PublicDataAnalyzer } from './analysis';

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  profitFactor: number;
  maxDrawdown: number;
  trades: SimulatedTrade[];
}

export interface SimulatedTrade {
  coin: string;
  type: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  status: 'WIN' | 'LOSS';
  confluenceScore: number;
}

export class BacktestEngine {
  private binanceService: BinanceService;
  private analyzer: PublicDataAnalyzer;

  constructor() {
    this.binanceService = new BinanceService();
    this.analyzer = new PublicDataAnalyzer();
  }

  async runBacktest(symbol: string, days: number = 30): Promise<BacktestResult> {
    // 1. Fetch historical data
    // 15m candles * 4 per hour * 24 hours * days
    const limit = 1000; // Binance limit per call
    const totalCandles = days * 24 * 4;
    const now = Date.now();
    const startTime = now - (days * 24 * 60 * 60 * 1000);
    
    // Fetch in chunks if needed, for now let's grab the max allowed or a reasonable chunk
    // To keep it simple and fast for the demo, we'll fetch the last 1000 candles (~10 days of 15m data)
    const klines = await this.binanceService.getKlines(symbol, '15m', 1000);
    
    if (klines.length < 50) {
      throw new Error('Insufficient historical data');
    }

    const trades: SimulatedTrade[] = [];
    let activeTrade: SimulatedTrade | null = null;
    let maxBalance = 0;
    let currentDrawdown = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;

    // 2. Replay data candle by candle
    // We need at least 50 candles for indicators (RSI, MACD, Bollinger) to stabilize
    for (let i = 50; i < klines.length - 1; i++) {
      const currentCandle = klines[i];
      const nextCandle = klines[i + 1]; // We execute/check exit on the NEXT candle
      
      // Slice data up to current candle to simulate "live" view
      const historicalSlice = klines.slice(0, i + 1);

      // Check if we have an active trade to manage
      if (activeTrade) {
        const result = this.checkTradeExit(activeTrade, nextCandle);
        if (result) {
          trades.push(result);
          runningPnL += result.pnl;
          
          // Drawdown calc
          if (runningPnL > maxBalance) maxBalance = runningPnL;
          const dd = maxBalance - runningPnL;
          if (dd > maxDrawdown) maxDrawdown = dd;

          activeTrade = null;
        }
        continue; // Don't enter a new trade if one is active
      }

      // Run Analysis on the slice
      const analysis = this.analyzer.analyze(historicalSlice);
      
      // If we have a high-confidence setup (Confluence Score >= 2)
      if (analysis && analysis.confluenceScore >= 2) {
        // Simulate Entry
        const entryPrice = nextCandle.open; // Enter on open of next candle
        // analysis.type is the PATTERN type, not direction. 
        // We need to use analysis.inverseDirection which is the trade direction we want to take
        const isLong = analysis.inverseDirection === 'LONG';
        
        // Calculate TP/SL based on the analysis logic (2% risk rule simulated)
        // Since AnalysisResult doesn't carry price levels, we calculate standard 1:2 RR based on ATR or %
        // For backtest simplicity, we'll use a fixed 1.5% stop loss and 3% take profit
        // In a real engine, this would be dynamic based on the pattern's specific structure (e.g. wick low)
        
        const stopPercent = 0.015; // 1.5% Stop Loss
        const targetPercent = 0.03; // 3% Take Profit
        
        const stopLoss = isLong 
          ? entryPrice * (1 - stopPercent) 
          : entryPrice * (1 + stopPercent);
          
        const takeProfit = isLong 
          ? entryPrice * (1 + targetPercent) 
          : entryPrice * (1 - targetPercent);

        activeTrade = {
          coin: symbol,
          type: analysis.type,
          entryTime: nextCandle.openTime,
          exitTime: 0, // Pending
          entryPrice: entryPrice,
          exitPrice: 0, // Pending
          pnl: 0, // Pending
          status: 'WIN', // Placeholder
          confluenceScore: analysis.confluenceScore
        } as any; // Type assertion to store temp TP/SL in the object if needed, or just track locally
        
        // Store TP/SL on the trade object for management (using 'any' to attach temp props or extend interface)
        (activeTrade as any).tp = takeProfit;
        (activeTrade as any).sl = stopLoss;
      }
    }

    // 3. Compile Results
    const wins = trades.filter(t => t.status === 'WIN').length;
    const losses = trades.filter(t => t.status === 'LOSS').length;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    
    return {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      totalPnL,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit,
      maxDrawdown,
      trades
    };
  }

  private checkTradeExit(trade: any, candle: Kline): SimulatedTrade | null {
    const { type, tp, sl, entryPrice } = trade;
    
    // Check if price hit SL or TP within the candle (High/Low)
    // We assume worst-case: if both hit in same candle, it's a loss (SL hit first)
    
    let exitPrice = 0;
    let status: 'WIN' | 'LOSS' | null = null;

    if (type === 'LONG') {
      if (candle.low <= sl) {
        exitPrice = sl;
        status = 'LOSS';
      } else if (candle.high >= tp) {
        exitPrice = tp;
        status = 'WIN';
      }
    } else { // SHORT
      if (candle.high >= sl) {
        exitPrice = sl;
        status = 'LOSS';
      } else if (candle.low <= tp) {
        exitPrice = tp;
        status = 'WIN';
      }
    }

    if (status) {
      // Calculate PnL %
      const pnlPercent = type === 'LONG' 
        ? (exitPrice - entryPrice) / entryPrice 
        : (entryPrice - exitPrice) / entryPrice;
        
      return {
        ...trade,
        exitTime: candle.closeTime,
        exitPrice,
        pnl: pnlPercent * 100, // Return as percentage
        status
      };
    }

    return null; // Trade continues
  }
}
