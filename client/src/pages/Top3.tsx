import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowUpRight, ArrowDownRight, Target, Shield, Zap, TrendingUp, TrendingDown, Activity, Clock, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useSignals } from "@/contexts/SignalContext";
import { CompositeStrategy } from "@/lib/strategies/Composite";
import { DexService } from "@/lib/dex";

export default function Top3() {
  const { markSignalsAsRead } = useSignals();
  const [liveSignals, setLiveSignals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    markSignalsAsRead();
    fetchLiveSignals();
  }, [markSignalsAsRead]);

  const fetchLiveSignals = async () => {
    setIsLoading(true);
    // Simulate fetching live signals from the AI engine
    // In a real app, this would call the backend or run the strategy logic
    const strategy = new CompositeStrategy();
    
    // Generate 3 distinct signals for demonstration
    const coins = ["BTC", "ETH", "SOL"];
    const signals = await Promise.all(coins.map(async (coin) => {
      // Mock candles for demonstration as we don't have live data feed here yet
      const result = await strategy.analyze({ 
        symbol: coin,
        candles: Array(100).fill({
          open: 50000, high: 51000, low: 49000, close: 50500, volume: 1000, time: Date.now()
        })
      });
      
      if (!result) return null;

      // Cast to any to bypass strict type checking for now as StrategySignal interface might differ
      const r = result as any;
      const isBuy = r.signal === "BUY" || r.signal === "LONG";
      
      return {
        coin: coin,
        name: coin === "BTC" ? "Bitcoin" : coin === "ETH" ? "Ethereum" : "Solana",
        type: isBuy ? "PUMP" : "DUMP",
        price: r.entry.toString(),
        change: (Math.random() * 5 * (isBuy ? 1 : -1)).toFixed(2) + "%",
        rationale: r.reason,
        entry: r.entry.toString(),
        target: r.takeProfit.toString(),
        stop: r.stopLoss.toString(),
        confidence: r.confidence,
        color: isBuy ? "text-green-400" : "text-red-400",
        bg: isBuy ? "bg-green-400/10" : "bg-red-400/10",
        border: isBuy ? "border-green-400/30" : "border-red-400/30",
        glow: isBuy ? "shadow-[0_0_30px_rgba(74,222,128,0.2)]" : "shadow-[0_0_30px_rgba(248,113,113,0.2)]",
        expiry: new Date(Date.now() + 15 * 60 * 1000) // 15 mins expiry
      };
    }));

    setLiveSignals(signals.filter(s => s !== null));
    setLastUpdated(new Date());
    setIsLoading(false);
  };

  const openDex = (symbol: string) => {
    const url = DexService.getHyperliquidUrl(symbol);
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground overflow-hidden relative">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 pointer-events-none"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/20 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
      
      <Navbar />

      <main className="flex-grow container mx-auto px-4 pt-32 pb-20 relative z-10">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary mb-4 animate-fade-in">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </div>
            <span className="font-mono text-xs font-bold tracking-wider">
              LIVE AI SIGNALS • UPDATED {Math.floor((new Date().getTime() - lastUpdated.getTime()) / 60000)}M AGO
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-4 w-4 ml-2 hover:bg-transparent hover:text-white"
              onClick={fetchLiveSignals}
              disabled={isLoading}
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              DEEP <span className="text-primary">SCANNER</span>
            </h1>
            <span className="self-center px-2 py-1 rounded text-[10px] font-bold tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">FUTURES ONLY</span>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Multi-exchange perpetual futures signals ranked by AI confluence score.
            <br />
            <span className="text-primary/80">Binance · Bybit · OKX · Hyperliquid · dYdX · AsterDEX</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {isLoading ? (
            // Loading Skeletons
            [1, 2, 3].map((i) => (
              <div key={i} className="h-[600px] bg-card/20 rounded-2xl animate-pulse border border-border/30"></div>
            ))
          ) : (
            liveSignals.map((coin, index) => (
              <div 
                key={coin.coin}
                className={`group relative bg-card/50 backdrop-blur-xl border ${coin.border} rounded-2xl p-8 hover:scale-[1.02] transition-all duration-500 ${coin.glow}`}
              >
                {/* Expiry Timer */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-background/60 backdrop-blur-md px-2 py-1 rounded-md border border-border/30">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">14:59</span>
                </div>

                {/* Card Header */}
                <div className="flex justify-between items-start mb-8 mt-2">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-xl ${coin.bg} flex items-center justify-center border ${coin.border}`}>
                      <span className={`font-bold tracking-tight text-2xl ${coin.color}`}>{coin.coin[0]}</span>
                    </div>
                    <div>
                      <h3 className="font-bold tracking-tight text-2xl text-foreground">{coin.coin}</h3>
                      <p className=" text-muted-foreground">{coin.name}</p>
                    </div>
                  </div>
                  <div className={`flex flex-col items-end ${coin.color}`}>
                    <div className="flex items-center gap-1 font-mono font-bold text-xl">
                      {coin.type === "PUMP" ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      {coin.type}
                    </div>
                    <span className="font-mono text-sm opacity-80">{coin.change} (24h)</span>
                  </div>
                </div>

                {/* Rationale */}
                <div className="mb-8 p-4 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Activity className="w-4 h-4" />
                    <span className="font-mono text-xs uppercase tracking-wider">AI Rationale</span>
                  </div>
                  <p className="text-base md:text-lg leading-relaxed text-foreground/90">
                    {coin.rationale}
                  </p>
                </div>

                {/* Trade Parameters */}
                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30 border border-border/30 group-hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Target className="w-4 h-4" />
                      <span className="font-mono text-sm">ENTRY</span>
                    </div>
                    <span className="font-mono font-bold text-lg text-foreground">{coin.entry}</span>
                  </div>
                  
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30 border border-border/30 group-hover:border-green-500/30 transition-colors">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ArrowUpRight className="w-4 h-4 text-green-500" />
                      <span className="font-mono text-sm">TAKE PROFIT</span>
                    </div>
                    <span className="font-mono font-bold text-lg text-green-400">{coin.target}</span>
                  </div>

                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30 border border-border/30 group-hover:border-red-500/30 transition-colors">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                      <span className="font-mono text-sm">STOP LOSS</span>
                    </div>
                    <span className="font-mono font-bold text-lg text-red-400">{coin.stop}</span>
                  </div>
                </div>

                {/* Confidence Meter */}
                <div className="mb-8">
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-muted-foreground">AI CONFIDENCE</span>
                    <span className={coin.color}>{coin.confidence}%</span>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${coin.type === 'PUMP' ? 'bg-green-500' : 'bg-red-500'} transition-all duration-1000 ease-out`}
                      style={{ width: `${coin.confidence}%` }}
                    ></div>
                  </div>
                </div>

                {/* Action Button */}
                <Button 
                  className={`w-full font-bold tracking-tight tracking-wide ${
                    coin.type === 'PUMP' 
                      ? 'bg-green-500 hover:bg-green-600 text-black' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  } shadow-lg hover:shadow-xl transition-all duration-300`}
                  onClick={() => openDex(coin.coin)}
                >
                  EXECUTE {coin.type}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="mt-20 text-center">
          <Link href="/platform">
            <Button variant="outline" className="text-base md:text-lg px-8 py-6 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary transition-all duration-300">
              VIEW FULL DASHBOARD
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
