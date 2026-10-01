import { TradeRecord } from './csvParser';

export interface InversePattern {
  type: 'LONG_FAILURE' | 'SHORT_FAILURE' | 'FOMO_ENTRY' | 'PANIC_SELL';
  confidence: number;
  description: string;
  action: 'INVERT_LONG' | 'INVERT_SHORT' | 'WAIT';
}

export class InverseEngine {
  private trades: TradeRecord[];

  constructor(trades: TradeRecord[]) {
    this.trades = trades;
  }

  /**
   * Analyzes the user's trade history to find recurring losing patterns.
   * Returns a list of "Inverse Patterns" that the AI suggests trading AGAINST.
   */
  analyzePatterns(): InversePattern[] {
    const losingTrades = this.trades.filter(t => t.pnl < 0);
    const winningTrades = this.trades.filter(t => t.pnl > 0);
    
    if (losingTrades.length < 5) {
      return []; // Not enough data
    }

    const patterns: InversePattern[] = [];

    // 1. Analyze Directional Bias (e.g., User loses 80% of Longs)
    const longLosses = losingTrades.filter(t => t.side === 'BUY').length;
    const shortLosses = losingTrades.filter(t => t.side === 'SELL').length;
    const totalLongs = this.trades.filter(t => t.side === 'BUY').length;
    const totalShorts = this.trades.filter(t => t.side === 'SELL').length;

    const longFailureRate = totalLongs > 0 ? longLosses / totalLongs : 0;
    const shortFailureRate = totalShorts > 0 ? shortLosses / totalShorts : 0;

    if (longFailureRate > 0.65) {
      patterns.push({
        type: 'LONG_FAILURE',
        confidence: Math.round(longFailureRate * 100),
        description: `User has a ${Math.round(longFailureRate * 100)}% failure rate on Long positions.`,
        action: 'INVERT_LONG' // Suggest Shorting when user wants to Long
      });
    }

    if (shortFailureRate > 0.65) {
      patterns.push({
        type: 'SHORT_FAILURE',
        confidence: Math.round(shortFailureRate * 100),
        description: `User has a ${Math.round(shortFailureRate * 100)}% failure rate on Short positions.`,
        action: 'INVERT_SHORT' // Suggest Longing when user wants to Short
      });
    }

    // 2. Analyze "Revenge Trading" (Consecutive losses in short timeframe)
    // Group trades by time (within 1 hour)
    let revengeCount = 0;
    for (let i = 1; i < losingTrades.length; i++) {
      const timeDiff = Math.abs(losingTrades[i].timestamp - losingTrades[i-1].timestamp);
      if (timeDiff < 3600000) { // 1 hour
        revengeCount++;
      }
    }

    if (revengeCount > 3) {
      patterns.push({
        type: 'FOMO_ENTRY',
        confidence: 85,
        description: "Detected frequent rapid-fire entries after losses (Revenge Trading).",
        action: 'WAIT'
      });
    }

    return patterns;
  }

  /**
   * Adjusts a standard AI signal based on the user's personal "Inverse" patterns.
   */
  adjustSignal(baseSignal: { type: 'LONG' | 'SHORT', confidence: number }, patterns: InversePattern[]) {
    let adjustedSignal = { ...baseSignal };
    let rationale = "";

    // Check if the base signal aligns with a known failure pattern
    const relevantPattern = patterns.find(p => 
      (baseSignal.type === 'LONG' && p.type === 'LONG_FAILURE') ||
      (baseSignal.type === 'SHORT' && p.type === 'SHORT_FAILURE')
    );

    if (relevantPattern) {
      // If AI says LONG, but User fails at LONGs -> This is actually GOOD for the user to follow AI
      // because the AI is NOT the user. 
      // WAIT: The "Inverse IQ" concept is: "Do the opposite of what YOU (the loser) would naturally do."
      // If the AI generates a signal that matches the user's *natural instinct* (which is bad), we should warn them.
      // But here, the AI is generating the signal based on market data, not user instinct.
      
      // Correct Logic:
      // We use the user's history to *validate* the AI signal.
      // If AI says SHORT, and User fails at LONGs (meaning User is biased to Long),
      // then the AI Short signal is "Inverse" to the User's bias. -> HIGH CONFIDENCE.
      
      if (baseSignal.type === 'SHORT' && relevantPattern.type === 'LONG_FAILURE') {
        adjustedSignal.confidence += 15; // Boost confidence
        rationale = `Strong Signal: Opposes your ${relevantPattern.confidence}% failure rate on Longs.`;
      } else if (baseSignal.type === 'LONG' && relevantPattern.type === 'SHORT_FAILURE') {
        adjustedSignal.confidence += 15;
        rationale = `Strong Signal: Opposes your ${relevantPattern.confidence}% failure rate on Shorts.`;
      }
    }

    return {
      ...adjustedSignal,
      confidence: Math.min(adjustedSignal.confidence, 99),
      inverseRationale: rationale
    };
  }
}
