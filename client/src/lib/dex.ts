import { type Address } from 'viem';

export interface DexMarket {
  id: string;
  symbol: string;
  name: string;
  url: string;
}

export class DexService {
  // Map Binance symbols to Hyperliquid/DEX markets
  // In a real app, this would fetch from an API
  private static marketMap: Record<string, string> = {
    'BTC/USDT': 'BTC',
    'ETH/USDT': 'ETH',
    'SOL/USDT': 'SOL',
    'SUI/USDT': 'SUI',
    'DOGE/USDT': 'DOGE',
    'XRP/USDT': 'XRP',
    'BNB/USDT': 'BNB',
    'ARB/USDT': 'ARB',
    'OP/USDT': 'OP',
    'LINK/USDT': 'LINK',
    'MATIC/USDT': 'MATIC',
    'AVAX/USDT': 'AVAX',
  };

  static getHyperliquidUrl(symbol: string): string {
    // Convert "BTC/USDT" -> "BTC"
    const baseSymbol = this.marketMap[symbol] || symbol.split('/')[0];
    return `https://app.hyperliquid.xyz/trade/${baseSymbol}`;
  }

  static getGmxUrl(symbol: string): string {
    const baseSymbol = this.marketMap[symbol] || symbol.split('/')[0];
    return `https://app.gmx.io/#/trade/${baseSymbol}`;
  }

  static getDydxUrl(symbol: string): string {
    const baseSymbol = this.marketMap[symbol] || symbol.split('/')[0];
    return `https://dydx.trade/trade/${baseSymbol}-USD`;
  }
}
