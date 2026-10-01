import { Kline } from './binance';

export interface AnalysisResult {
  type: 'FALSE_BREAKOUT' | 'FALSE_BREAKDOWN' | 'EXHAUSTION_TOP' | 'EXHAUSTION_BOTTOM' | 'LIQUIDATION_WICK' | 'VOLUME_SPIKE_REVERSAL' | 'NONE';
  symbol: string;
  interval: string;
  timestamp: number;
  direction: 'LONG' | 'SHORT';
  inverseDirection: 'LONG' | 'SHORT';
  confidence: number;
  confluenceScore: number; // 0-5 score based on matching factors
  confluenceFactors: string[]; // List of matching factors (e.g., "RSI Divergence", "Volume Spike")
  conditions: Record<string, number>;
  reason: string;
}

export class PublicDataAnalyzer {
  private avgVolume(klines: Kline[]): number {
    if (klines.length === 0) return 0;
    const sum = klines.reduce((acc, k) => acc + k.volume, 0);
    return sum / klines.length;
  }

  private calculateRSI(klines: Kline[], period: number = 14): number[] {
    if (klines.length < period + 1) return [];
    
    const changes = klines.slice(1).map((k, i) => k.close - klines[i].close);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    const rsi = [100 - (100 / (1 + avgGain / (avgLoss || 0.00001)))];
    
    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      rsi.push(100 - (100 / (1 + avgGain / (avgLoss || 0.00001))));
    }
    
    return rsi;
  }

  private calculateMACD(klines: Kline[]): { macd: number[], signal: number[], histogram: number[] } {
    const closes = klines.map(k => k.close);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    
    const macdLine = ema12.map((v, i) => v - ema26[i]).slice(26);
    const signalLine = this.calculateEMA(macdLine, 9);
    const histogram = macdLine.slice(9).map((v, i) => v - signalLine[i]);
    
    return { macd: macdLine, signal: signalLine, histogram };
  }

  private calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  private calculateBollingerBands(klines: Kline[], period: number = 20, multiplier: number = 2) {
    const closes = klines.map(k => k.close);
    const bands = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const stdDev = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
      
      bands.push({
        upper: mean + multiplier * stdDev,
        middle: mean,
        lower: mean - multiplier * stdDev
      });
    }
    
    return bands;
  }

  private calculateConfidence(factors: Record<string, number>): number {
    let score = 0;
    let count = 0;
    
    for (const key in factors) {
      score += Math.min(Math.max(factors[key], 0), 1); // Clamp between 0 and 1
      count++;
    }
    
    if (count === 0) return 0;
    return Math.round((score / count) * 100);
  }

  private calculateConfluence(
    current: Kline, 
    direction: 'LONG' | 'SHORT', 
    rsi: number, 
    macd: number, 
    prevMacd: number,
    bb: { upper: number, lower: number, middle: number }
  ): { score: number, factors: string[] } {
    let score = 0;
    const factors: string[] = [];

    if (direction === 'LONG') {
      // RSI Oversold
      if (rsi < 35) {
        score += 1;
        factors.push('RSI Oversold (<35)');
      }
      // MACD Bullish Crossover or Rising
      if (macd > prevMacd) {
        score += 1;
        factors.push('MACD Momentum Rising');
      }
      // Bollinger Band Lower Rejection
      if (current.low <= bb.lower && current.close > bb.lower) {
        score += 1;
        factors.push('Bollinger Lower Rejection');
      }
    } else {
      // RSI Overbought
      if (rsi > 65) {
        score += 1;
        factors.push('RSI Overbought (>65)');
      }
      // MACD Bearish Crossover or Falling
      if (macd < prevMacd) {
        score += 1;
        factors.push('MACD Momentum Falling');
      }
      // Bollinger Band Upper Rejection
      if (current.high >= bb.upper && current.close < bb.upper) {
        score += 1;
        factors.push('Bollinger Upper Rejection');
      }
    }

    return { score, factors };
  }

  public analyze(klines: Kline[]): AnalysisResult | null {
    // Analyze the LATEST candle in the provided array
    if (klines.length < 50) return null;
    
    const results = this.analyzeFailurePatterns(klines, 'BACKTEST', '15m');
    // Return the highest confidence result for the latest candle
    // We only care about the very last candle for backtesting step-by-step
    const latest = results.filter(r => r.timestamp === klines[klines.length - 1].openTime);
    
    if (latest.length > 0) {
      return latest.sort((a, b) => b.confidence - a.confidence)[0];
    }
    return null;
  }

  public analyzeFailurePatterns(klines: Kline[], symbol: string, interval: string): AnalysisResult[] {
    const patterns: AnalysisResult[] = [];
    
    // Need at least 50 candles for pattern detection
    if (klines.length < 50) {
      return patterns;
    }
    
    // Analyze the most recent completed candle (index -2) and current candle (index -1)
    // We look back a bit to find recent setups
    // For backtesting, we might call this with a specific slice where we only care about the last one
    // But the original logic scans a lookback window. 
    // To preserve original logic but support single-step backtest, we default lookback to 5
    // unless the array is short (which shouldn't happen given the check above)
    const lookback = 5;
    
    for (let i = klines.length - lookback; i < klines.length; i++) {
      const current = klines[i];
      const previous = klines.slice(i - 50, i);
      
      // Calculate technical indicators for confluence
      const rsi = this.calculateRSI(klines);
      const macd = this.calculateMACD(klines);
      const bb = this.calculateBollingerBands(klines);
      
      const currentRSI = rsi[rsi.length - 1];
      const currentMACD = macd.histogram[macd.histogram.length - 1];
      const prevMACD = macd.histogram[macd.histogram.length - 2];
      const currentBB = bb[bb.length - 1];

      // Pattern 1: False Breakout (LONG trap)
      const falseBreakoutLong = this.detectFalseBreakout(current, previous, 'LONG');
      if (falseBreakoutLong) {
        const confluence = this.calculateConfluence(current, 'SHORT', currentRSI, currentMACD, prevMACD, currentBB);
        patterns.push({
          type: 'FALSE_BREAKOUT',
          symbol,
          interval,
          timestamp: current.openTime,
          direction: 'LONG', // Direction that would lose
          inverseDirection: 'SHORT', // Profitable direction
          confidence: (falseBreakoutLong.confidence + confluence.score * 10) / 2,
          confluenceScore: confluence.score,
          confluenceFactors: confluence.factors,
          conditions: falseBreakoutLong.conditions,
          reason: 'Price broke above resistance but immediately rejected - classic bull trap'
        });
      }
      
      // Pattern 2: False Breakdown (SHORT trap)
      const falseBreakoutShort = this.detectFalseBreakout(current, previous, 'SHORT');
      if (falseBreakoutShort) {
        const confluence = this.calculateConfluence(current, 'LONG', currentRSI, currentMACD, prevMACD, currentBB);
        patterns.push({
          type: 'FALSE_BREAKDOWN',
          symbol,
          interval,
          timestamp: current.openTime,
          direction: 'SHORT',
          inverseDirection: 'LONG',
          confidence: (falseBreakoutShort.confidence + confluence.score * 10) / 2,
          confluenceScore: confluence.score,
          confluenceFactors: confluence.factors,
          conditions: falseBreakoutShort.conditions,
          reason: 'Price broke below support but immediately recovered - classic bear trap'
        });
      }
      
      // Pattern 3: Exhaustion Top (LONG trap)
      const exhaustionTop = this.detectExhaustionTop(current, previous);
      if (exhaustionTop) {
        const confluence = this.calculateConfluence(current, 'SHORT', currentRSI, currentMACD, prevMACD, currentBB);
        patterns.push({
          type: 'EXHAUSTION_TOP',
          symbol,
          interval,
          timestamp: current.openTime,
          direction: 'LONG',
          inverseDirection: 'SHORT',
          confidence: (exhaustionTop.confidence + confluence.score * 10) / 2,
          confluenceScore: confluence.score,
          confluenceFactors: confluence.factors,
          conditions: exhaustionTop.conditions,
          reason: 'Parabolic move with extreme volume - buyers exhausted, reversal likely'
        });
      }
      
      // Pattern 4: Exhaustion Bottom (SHORT trap)
      const exhaustionBottom = this.detectExhaustionBottom(current, previous);
      if (exhaustionBottom) {
        const confluence = this.calculateConfluence(current, 'LONG', currentRSI, currentMACD, prevMACD, currentBB);
        patterns.push({
          type: 'EXHAUSTION_BOTTOM',
          symbol,
          interval,
          timestamp: current.openTime,
          direction: 'SHORT',
          inverseDirection: 'LONG',
          confidence: (exhaustionBottom.confidence + confluence.score * 10) / 2,
          confluenceScore: confluence.score,
          confluenceFactors: confluence.factors,
          conditions: exhaustionBottom.conditions,
          reason: 'Capitulation selling with extreme volume - sellers exhausted, bounce likely'
        });
      }
      
      // Pattern 5: Liquidation Wick (both directions)
      const liquidationWick = this.detectLiquidationWick(current, previous);
      if (liquidationWick) {
        const confluence = this.calculateConfluence(current, liquidationWick.inverseDirection, currentRSI, currentMACD, prevMACD, currentBB);
        patterns.push({
          type: 'LIQUIDATION_WICK',
          symbol,
          interval,
          timestamp: current.openTime,
          direction: liquidationWick.direction,
          inverseDirection: liquidationWick.inverseDirection,
          confidence: (liquidationWick.confidence + confluence.score * 10) / 2,
          confluenceScore: confluence.score,
          confluenceFactors: confluence.factors,
          conditions: liquidationWick.conditions,
          reason: 'Long wick indicates mass liquidations - strong reversal signal'
        });
      }
      
      // Pattern 6: Volume Spike Reversal
      const volumeSpike = this.detectVolumeSpike(current, previous);
      if (volumeSpike) {
        const confluence = this.calculateConfluence(current, volumeSpike.inverseDirection, currentRSI, currentMACD, prevMACD, currentBB);
        patterns.push({
          type: 'VOLUME_SPIKE_REVERSAL',
          symbol,
          interval,
          timestamp: current.openTime,
          direction: volumeSpike.direction,
          inverseDirection: volumeSpike.inverseDirection,
          confidence: (volumeSpike.confidence + confluence.score * 10) / 2,
          confluenceScore: confluence.score,
          confluenceFactors: confluence.factors,
          conditions: volumeSpike.conditions,
          reason: 'Extreme volume spike often marks trend exhaustion'
        });
      }
    }
    
    return patterns;
  }

  private detectFalseBreakout(current: Kline, previous: Kline[], direction: 'LONG' | 'SHORT') {
    if (direction === 'LONG') {
      // Calculate resistance from previous candles
      const resistance = Math.max(...previous.slice(-20).map(k => k.high));
      
      // Check if current candle broke above resistance
      const breakout = current.high > resistance;
      
      // Check if it closed below resistance (rejection)
      const rejection = current.close < resistance;
      
      // Check for long upper wick (sign of rejection)
      const wickSize = current.high - Math.max(current.open, current.close);
      const bodySize = Math.abs(current.close - current.open);
      const longWick = wickSize > bodySize * 1.5;
      
      if (breakout && rejection && longWick) {
        const confidence = this.calculateConfidence({
          wickRatio: Math.min(wickSize / (bodySize || 0.00001), 5) / 5,
          rejectionStrength: Math.min((resistance - current.close) / resistance * 1000, 1),
          volumeConfirmation: current.volume > this.avgVolume(previous) ? 1 : 0.5
        });
        
        return {
          confidence,
          conditions: {
            resistance,
            breakoutHigh: current.high,
            closePrice: current.close,
            wickSize,
            bodySize,
            volume: current.volume
          } as Record<string, number>
        };
      }
    } else {
      // SHORT - False breakdown
      const support = Math.min(...previous.slice(-20).map(k => k.low));
      const breakdown = current.low < support;
      const recovery = current.close > support;
      
      const wickSize = Math.min(current.open, current.close) - current.low;
      const bodySize = Math.abs(current.close - current.open);
      const longWick = wickSize > bodySize * 1.5;
      
      if (breakdown && recovery && longWick) {
        const confidence = this.calculateConfidence({
          wickRatio: Math.min(wickSize / (bodySize || 0.00001), 5) / 5,
          recoveryStrength: Math.min((current.close - support) / support * 1000, 1),
          volumeConfirmation: current.volume > this.avgVolume(previous) ? 1 : 0.5
        });
        
        return {
          confidence,
          conditions: {
            support,
            breakdownLow: current.low,
            closePrice: current.close,
            wickSize,
            bodySize,
            volume: current.volume
          } as Record<string, number>
        };
      }
    }
    
    return null;
  }

  private detectExhaustionTop(current: Kline, previous: Kline[]) {
    // Calculate average volume
    const avgVolume = this.avgVolume(previous);
    
    // Check for volume spike (2x+ average)
    const volumeSpike = current.volume > avgVolume * 2;
    
    // Check for parabolic move (strong uptrend)
    const recentGains = previous.slice(-10).filter(k => k.close > k.open).length;
    const parabolic = recentGains >= 7; // 7 out of 10 green candles
    
    // Check for long upper wick (rejection at top)
    const wickSize = current.high - Math.max(current.open, current.close);
    const bodySize = Math.abs(current.close - current.open);
    const longWick = wickSize > bodySize * 1.5;
    
    // Check if current candle is bearish or doji
    const bearishOrDoji = current.close <= current.open;
    
    if (volumeSpike && parabolic && longWick && bearishOrDoji) {
      const confidence = this.calculateConfidence({
        volumeRatio: Math.min(current.volume / avgVolume, 5) / 5,
        wickRatio: Math.min(wickSize / (bodySize || 0.00001), 5) / 5,
        trendStrength: recentGains / 10,
        rejection: bearishOrDoji ? 1 : 0.5
      });
      
      return {
        confidence,
        conditions: {
          volume: current.volume,
          avgVolume,
          volumeRatio: current.volume / avgVolume,
          wickSize,
          bodySize
        }
      };
    }
    return null;
  }

  private detectExhaustionBottom(current: Kline, previous: Kline[]) {
    const avgVolume = this.avgVolume(previous);
    const volumeSpike = current.volume > avgVolume * 2;
    
    const recentLosses = previous.slice(-10).filter(k => k.close < k.open).length;
    const capitulation = recentLosses >= 7;
    
    const wickSize = Math.min(current.open, current.close) - current.low;
    const bodySize = Math.abs(current.close - current.open);
    const longWick = wickSize > bodySize * 1.5;
    
    const bullishOrDoji = current.close >= current.open;
    
    if (volumeSpike && capitulation && longWick && bullishOrDoji) {
      const confidence = this.calculateConfidence({
        volumeRatio: Math.min(current.volume / avgVolume, 5) / 5,
        wickRatio: Math.min(wickSize / (bodySize || 0.00001), 5) / 5,
        trendStrength: recentLosses / 10,
        rejection: bullishOrDoji ? 1 : 0.5
      });
      
      return {
        confidence,
        conditions: {
          volume: current.volume,
          avgVolume,
          volumeRatio: current.volume / avgVolume,
          wickSize,
          bodySize
        }
      };
    }
    return null;
  }

  private detectLiquidationWick(current: Kline, previous: Kline[]) {
    const avgBodySize = previous.slice(-20).reduce((sum, k) => sum + Math.abs(k.close - k.open), 0) / 20;
    
    // Check for massive wick relative to average body
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    
    const isLongUpper = upperWick > avgBodySize * 3;
    const isLongLower = lowerWick > avgBodySize * 3;
    
    if (isLongUpper) {
      return {
        direction: 'LONG' as const,
        inverseDirection: 'SHORT' as const,
        confidence: 85,
        conditions: {
          wickSize: upperWick,
          avgBodySize
        }
      };
    }
    
    if (isLongLower) {
      return {
        direction: 'SHORT' as const,
        inverseDirection: 'LONG' as const,
        confidence: 85,
        conditions: {
          wickSize: lowerWick,
          avgBodySize
        }
      };
    }
    
    return null;
  }

  private detectVolumeSpike(current: Kline, previous: Kline[]) {
    const avgVolume = this.avgVolume(previous);
    const volumeRatio = current.volume / avgVolume;
    
    if (volumeRatio > 3) { // 3x average volume
      // If price barely moved despite huge volume, it's absorption/reversal
      const bodySize = Math.abs(current.close - current.open);
      const avgBodySize = previous.slice(-20).reduce((sum, k) => sum + Math.abs(k.close - k.open), 0) / 20;
      
      if (bodySize < avgBodySize) {
        // High volume, small move = absorption
        const direction = current.close > current.open ? 'LONG' : 'SHORT';
        return {
          direction: direction as 'LONG' | 'SHORT',
          inverseDirection: (direction === 'LONG' ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT',
          confidence: 80,
          conditions: {
            volumeRatio,
            bodySize,
            avgBodySize
          }
        };
      }
    }
    return null;
  }
}
