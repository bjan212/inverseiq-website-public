export interface StrategyInput {
  symbol: string;
  candles: any[]; // OHLCV data
  userHistory?: any[]; // Optional user trade history
}

export interface StrategySignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  reason: string;
  confluenceScore: number;
  confluenceFactors: string[];
}

export interface Strategy {
  name: string;
  description: string;
  analyze(input: StrategyInput): StrategySignal | null;
}
