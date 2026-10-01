import { Strategy, StrategyInput, StrategySignal } from './types';
import { PublicDataAnalyzer } from '../analysis';
import { Kline } from '../binance';

export class InverseIQStrategy implements Strategy {
  name = 'Inverse IQ';
  description = 'Analyzes failure patterns and user history to generate inverse signals.';

  analyze(input: StrategyInput): StrategySignal | null {
    const analyzer = new PublicDataAnalyzer();
    // Cast input candles to Kline[]
    const klines = input.candles as Kline[];
    
    const result = analyzer.analyze(klines);
    
    if (!result) return null;

    // Calculate Entry, SL, TP based on the signal
    const currentPrice = klines[klines.length - 1].close;
    const atr = this.calculateATR(klines, 14);
    
    let entryPrice = currentPrice;
    let stopLoss = 0;
    let takeProfit = 0;

    if (result.inverseDirection === 'LONG') {
      stopLoss = currentPrice - (atr * 1.5);
      takeProfit = currentPrice + (atr * 3); // 1:2 Risk/Reward
    } else {
      stopLoss = currentPrice + (atr * 1.5);
      takeProfit = currentPrice - (atr * 3); // 1:2 Risk/Reward
    }

    return {
      symbol: input.symbol,
      direction: result.inverseDirection,
      entryPrice,
      stopLoss,
      takeProfit,
      confidence: result.confidence,
      reason: result.reason,
      confluenceScore: result.confluenceScore || 0,
      confluenceFactors: result.confluenceFactors || []
    };
  }

  private calculateATR(klines: Kline[], period: number): number {
    if (klines.length < period + 1) return klines[klines.length - 1].close * 0.02; // Fallback 2%

    let trSum = 0;
    for (let i = klines.length - period; i < klines.length; i++) {
      const high = klines[i].high;
      const low = klines[i].low;
      const prevClose = klines[i - 1].close;
      
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    
    return trSum / period;
  }
}
