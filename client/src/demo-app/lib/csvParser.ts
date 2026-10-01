export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  pnl: number;
  timestamp: number;
  fee: number;
}

export class TradeHistoryParser {
  /**
   * Parses raw CSV text into structured TradeRecord objects.
   * Supports standard Binance Futures export format.
   */
  static parse(csvText: string): TradeRecord[] {
    const lines = csvText.split('\n');
    const trades: TradeRecord[] = [];
    
    // Skip header row
    const dataLines = lines.slice(1);

    dataLines.forEach((line, index) => {
      if (!line.trim()) return;
      
      // Handle potential quoted fields in CSV
      const columns = this.splitCSVLine(line);
      
      // Basic validation: must have at least symbol, side, price
      if (columns.length < 5) return;

      try {
        // Mapping based on standard Binance Futures Export:
        // Date(0), Symbol(1), Side(2), Price(3), Quantity(4), Amount(5), Fee(6), Realized Profit(7)
        
        const timestamp = new Date(columns[0]).getTime();
        const symbol = columns[1];
        const side = columns[2].toUpperCase() as 'BUY' | 'SELL';
        const price = parseFloat(columns[3]);
        const quantity = parseFloat(columns[4]);
        const fee = parseFloat(columns[6] || '0');
        const pnl = parseFloat(columns[7] || '0');

        if (!isNaN(price) && !isNaN(pnl)) {
          trades.push({
            id: `trade-${index}`,
            symbol,
            side,
            price,
            quantity,
            pnl,
            timestamp,
            fee
          });
        }
      } catch (e) {
        console.warn(`Failed to parse line ${index}:`, line);
      }
    });

    return trades;
  }

  private static splitCSVLine(line: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  }
}
