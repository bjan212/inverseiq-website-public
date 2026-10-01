import { Strategy } from './types';
import { InverseIQStrategy } from './InverseIQ';
import { SupertrendStrategy } from './Supertrend';
import { CompositeStrategy } from './Composite';
import { MomentumRSIStrategy } from './MomentumRSI';

export class StrategyRegistry {
  private strategies: Map<string, Strategy> = new Map();

  constructor() {
    this.register(new InverseIQStrategy());
    this.register(new SupertrendStrategy());
    this.register(new MomentumRSIStrategy());
    this.register(new CompositeStrategy());
  }

  register(strategy: Strategy) {
    this.strategies.set(strategy.name, strategy);
  }

  get(name: string): Strategy | undefined {
    return this.strategies.get(name);
  }

  getAll(): Strategy[] {
    return Array.from(this.strategies.values());
  }
}

export const strategyRegistry = new StrategyRegistry();
