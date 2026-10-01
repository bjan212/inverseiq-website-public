import { Strategy, StrategyInput, StrategySignal } from './types';
import { Kline } from '../binance';

/**
 * MomentumRSI Strategy
 *
 * A robust strategy that ALWAYS produces a signal by combining:
 * - RSI (overbought/oversold)
 * - MACD momentum direction
 * - EMA trend alignment (20 vs 50)
 * - ATR-based dynamic TP/SL
 *
 * This is used as the guaranteed fallback when pattern-based strategies
 * (InverseIQ, Supertrend) find no qualifying setups.
 */
export class MomentumRSIStrategy implements Strategy {
  name = 'Momentum RSI';
  description = 'RSI + MACD + EMA trend confluence — always finds the best current setup.';

  analyze(input: StrategyInput): StrategySignal | null {
    const klines = input.candles as Kline[];
    if (klines.length < 52) return null;

    const closes = klines.map(k => k.close);
    const current = klines[klines.length - 1];

    const rsi = this.calculateRSI(closes, 14);
    const currentRSI = rsi[rsi.length - 1];

    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const currentEMA20 = ema20[ema20.length - 1];
    const currentEMA50 = ema50[ema50.length - 1];

    const macdData = this.calculateMACD(closes);
    const currentMACD = macdData.histogram[macdData.histogram.length - 1];
    const prevMACD = macdData.histogram[macdData.histogram.length - 2];

    const atr = this.calculateATR(klines, 14);

    // ── Direction scoring ──────────────────────────────────────────────────
    let bullScore = 0;
    let bearScore = 0;
    const factors: string[] = [];

    // RSI signal
    if (currentRSI < 40) {
      bullScore += 2;
      factors.push(`RSI Oversold (${currentRSI.toFixed(1)})`);
    } else if (currentRSI > 60) {
      bearScore += 2;
      factors.push(`RSI Overbought (${currentRSI.toFixed(1)})`);
    } else if (currentRSI < 50) {
      bullScore += 1;
      factors.push(`RSI Bearish Territory (${currentRSI.toFixed(1)})`);
    } else {
      bearScore += 1;
      factors.push(`RSI Bullish Territory (${currentRSI.toFixed(1)})`);
    }

    // MACD momentum
    if (currentMACD > 0 && currentMACD > prevMACD) {
      bullScore += 2;
      factors.push('MACD Bullish & Rising');
    } else if (currentMACD < 0 && currentMACD < prevMACD) {
      bearScore += 2;
      factors.push('MACD Bearish & Falling');
    } else if (currentMACD > prevMACD) {
      bullScore += 1;
      factors.push('MACD Momentum Turning Bullish');
    } else {
      bearScore += 1;
      factors.push('MACD Momentum Turning Bearish');
    }

    // EMA trend alignment
    if (currentEMA20 > currentEMA50) {
      bullScore += 2;
      factors.push('EMA20 > EMA50 (Uptrend)');
    } else {
      bearScore += 2;
      factors.push('EMA20 < EMA50 (Downtrend)');
    }

    // Price vs EMA20
    if (current.close > currentEMA20) {
      bullScore += 1;
      factors.push('Price Above EMA20');
    } else {
      bearScore += 1;
      factors.push('Price Below EMA20');
    }

    const direction: 'LONG' | 'SHORT' = bullScore >= bearScore ? 'LONG' : 'SHORT';
    const totalScore = bullScore + bearScore;
    const dominantScore = direction === 'LONG' ? bullScore : bearScore;

    // Confidence: 60–90% based on score dominance
    const rawConfidence = 60 + Math.round((dominantScore / totalScore) * 30);
    const confidence = Math.min(90, Math.max(60, rawConfidence));

    const entryPrice = current.close;
    const stopLoss =
      direction === 'LONG'
        ? entryPrice - atr * 1.5
        : entryPrice + atr * 1.5;
    const takeProfit =
      direction === 'LONG'
        ? entryPrice + atr * 3
        : entryPrice - atr * 3;

    const rsiLabel = currentRSI.toFixed(1);
    const reason =
      direction === 'LONG'
        ? `Bullish confluence: RSI ${rsiLabel}, MACD ${currentMACD > 0 ? 'positive' : 'recovering'}, EMA ${currentEMA20 > currentEMA50 ? 'uptrend' : 'recovering'}`
        : `Bearish confluence: RSI ${rsiLabel}, MACD ${currentMACD < 0 ? 'negative' : 'weakening'}, EMA ${currentEMA20 < currentEMA50 ? 'downtrend' : 'breaking down'}`;

    return {
      symbol: input.symbol,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      confidence,
      reason,
      confluenceScore: Math.round((dominantScore / totalScore) * 5),
      confluenceFactors: factors,
    };
  }

  private calculateRSI(closes: number[], period: number): number[] {
    if (closes.length < period + 1) return [50];
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.map(c => (c > 0 ? c : 0));
    const losses = changes.map(c => (c < 0 ? -c : 0));

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rsi = [100 - 100 / (1 + avgGain / (avgLoss || 0.00001))];
    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 0.00001)));
    }
    return rsi;
  }

  private calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  private calculateMACD(closes: number[]): { histogram: number[] } {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]).slice(26);
    const signalLine = this.calculateEMA(macdLine, 9);
    const histogram = macdLine.slice(9).map((v, i) => v - signalLine[i]);
    return { histogram };
  }

  private calculateATR(klines: Kline[], period: number): number {
    if (klines.length < period + 1) return klines[klines.length - 1].close * 0.02;
    let trSum = 0;
    for (let i = klines.length - period; i < klines.length; i++) {
      const tr = Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - klines[i - 1].close),
        Math.abs(klines[i].low - klines[i - 1].close)
      );
      trSum += tr;
    }
    return trSum / period;
  }
}
