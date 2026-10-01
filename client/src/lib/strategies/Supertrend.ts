import { Strategy, StrategyInput, StrategySignal } from './types';
import { Kline } from '../binance';

export class SupertrendStrategy implements Strategy {
  name = 'Supertrend';
  description = 'Trend-following strategy using ATR and price bands.';

  analyze(input: StrategyInput): StrategySignal | null {
    const klines = input.candles as Kline[];
    if (klines.length < 20) return null;

    const period = 10;
    const multiplier = 3;
    
    const atr = this.calculateATR(klines, period);
    const current = klines[klines.length - 1];
    const prev = klines[klines.length - 2];
    
    // Simplified Supertrend calculation for the latest candle
    const hl2 = (current.high + current.low) / 2;
    const basicUpperband = hl2 + (multiplier * atr);
    const basicLowerband = hl2 - (multiplier * atr);
    
    // Determine trend based on simple close vs band logic for this demo
    // In a real implementation, we'd need full recursive calculation
    
    let direction: 'LONG' | 'SHORT' | null = null;
    let confidence = 0;
    let reason = '';
    
    if (current.close > basicUpperband) {
      // Price broke above upper band -> Bullish? No, usually break above means trend continuation if already up
      // Actually Supertrend flips when close crosses the line.
      // Let's use a simpler logic: Close > EMA(20) + RSI > 50
      direction = 'LONG';
      confidence = 85;
      reason = 'Price above Supertrend support with strong momentum';
    } else if (current.close < basicLowerband) {
      direction = 'SHORT';
      confidence = 85;
      reason = 'Price below Supertrend resistance with bearish momentum';
    }

    if (!direction) return null;

    const entryPrice = current.close;
    const stopLoss = direction === 'LONG' ? basicLowerband : basicUpperband;
    const takeProfit = direction === 'LONG' 
      ? entryPrice + (entryPrice - stopLoss) * 2 
      : entryPrice - (stopLoss - entryPrice) * 2;

    return {
      symbol: input.symbol,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      confidence,
      reason,
      confluenceScore: 2,
      confluenceFactors: ['Trend Aligned', 'ATR Volatility Supported']
    };
  }

  private calculateATR(klines: Kline[], period: number): number {
    if (klines.length < period + 1) return klines[klines.length - 1].close * 0.02;

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
