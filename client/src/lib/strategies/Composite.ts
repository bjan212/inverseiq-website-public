import { Strategy, StrategyInput, StrategySignal } from './types';
import { strategyRegistry } from './registry';

export class CompositeStrategy implements Strategy {
  name = 'AI Best Pick (All Strategies)';
  description = 'Scans all strategies to find the single highest-probability setup.';

  analyze(input: StrategyInput): StrategySignal | null {
    const strategies = strategyRegistry.getAll().filter(s => s.name !== this.name);
    let bestSignal: StrategySignal | null = null;

    for (const strategy of strategies) {
      const signal = strategy.analyze(input);
      
      if (signal) {
        // Scoring Logic: Prioritize Confidence first, then Risk/Reward
        if (!bestSignal) {
          bestSignal = signal;
        } else {
          const currentScore = this.calculateScore(signal);
          const bestScore = this.calculateScore(bestSignal);
          
          if (currentScore > bestScore) {
            bestSignal = signal;
          }
        }
      }
    }

    if (bestSignal) {
      // Enhance the signal to indicate it was selected by AI
      return {
        ...bestSignal,
        reason: `[Selected by AI Best Pick] ${bestSignal.reason}`,
        confluenceFactors: [...(bestSignal.confluenceFactors || []), `Strategy: ${bestSignal.direction === 'LONG' ? 'Bullish' : 'Bearish'} Consensus`]
      };
    }

    return null;
  }

  private calculateScore(signal: StrategySignal): number {
    // Score = Confidence * (Risk/Reward Ratio)
    // Example: 85% confidence * 2.5 RR = 212.5
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfit - signal.entryPrice);
    const rr = risk === 0 ? 0 : reward / risk;
    
    return signal.confidence * rr;
  }
}
