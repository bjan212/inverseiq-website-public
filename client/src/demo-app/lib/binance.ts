export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export class BinanceService {
  private baseUrl = 'https://fapi.binance.com'; // Futures API

  async getKlines(symbol: string, interval: string = '15m', limit: number = 100, startTime?: number): Promise<Kline[]> {
    try {
      let url = `${this.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      if (startTime) {
        url += `&startTime=${startTime}`;
      }
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Map raw array to Kline object
      // [Open Time, Open, High, Low, Close, Volume, Close Time, ...]
      return data.map((d: any[]) => ({
        openTime: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
        closeTime: d[6]
      }));
    } catch (error) {
      console.error('Failed to fetch klines:', error);
      return [];
    }
  }

  async getTopVolumeSymbols(limit: number = 10): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/fapi/v1/ticker/24hr`);
      if (!response.ok) throw new Error('Failed to fetch tickers');
      
      const data = await response.json();
      
      // Filter for USDT pairs and sort by volume
      return data
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map((t: any) => t.symbol);
    } catch (error) {
      console.error('Failed to fetch top symbols:', error);
      // Fallback list
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'TRXUSDT', 'LINKUSDT'];
    }
  }
}
