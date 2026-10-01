import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, TrendingDown, Activity, Zap, Copy, Check, ExternalLink, History } from "lucide-react";
import { toast } from "sonner";
import { BinanceService } from "@/lib/binance";
import { PublicDataAnalyzer, AnalysisResult } from "@/lib/analysis";
import TradeHistoryUpload from "./TradeHistoryUpload";
import { TradeHistoryParser } from "@/lib/csvParser";
import { InverseEngine, InversePattern } from "@/lib/inverseEngine";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BacktestEngine, BacktestResult } from "@/lib/backtest";

interface TradeSetup {
  coin: string;
  type: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  volatility: "LOW" | "MEDIUM" | "HIGH";
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  rationale: string;
  patternType: string;
  inverseRationale?: string;
  confluenceScore?: number;
  confluenceFactors?: string[];
}

export default function AiSetupFinder() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [setup, setSetup] = useState<TradeSetup | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [userPatterns, setUserPatterns] = useState<InversePattern[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const handleHistoryUpload = (trades: any[]) => {
    const engine = new InverseEngine(trades);
    const patterns = engine.analyzePatterns();
    setUserPatterns(patterns);
    
    if (patterns.length > 0) {
      toast.success(`AI identified ${patterns.length} recurring failure patterns in your history.`);
    } else {
      toast.info("No significant failure patterns found in uploaded history.");
    }
  };

  const copyTrade = () => {
    if (!setup) return;
    
    const tradeString = `
=== XRYPT AI SIGNAL ===
PAIR: ${setup.coin}
TYPE: ${setup.type}
ENTRY: ${setup.entry}
TARGET: ${setup.takeProfit}
STOP: ${setup.stopLoss}
RISK/REWARD: 1:${setup.riskReward}
CONFIDENCE: ${setup.confidence}%
PATTERN: ${setup.patternType}
${setup.inverseRationale ? `INVERSE LOGIC: ${setup.inverseRationale}` : ''}
=======================
`.trim();

    navigator.clipboard.writeText(tradeString);
    setCopied(true);
    toast.success("Trade setup copied to clipboard");
    
    setTimeout(() => setCopied(false), 2000);
  };

  const openExchange = (exchange: "BINANCE" | "BYBIT") => {
    if (!setup) return;

    // Auto-copy parameters before opening
    copyTrade();

    const symbol = setup.coin.replace("/", ""); // e.g., BTCUSDT
    let url = "";

    if (exchange === "BINANCE") {
      url = `https://www.binance.com/en/trade/${symbol.replace('USDT', '_USDT')}?type=futures`;
    } else if (exchange === "BYBIT") {
      url = `https://www.bybit.com/trade/usdt/${symbol}`;
    }

    window.open(url, "_blank");
  };

  const runBacktest = async () => {
    if (!setup) return;
    
    setIsBacktesting(true);
    setBacktestResult(null);
    
    try {
      const engine = new BacktestEngine();
      const symbol = setup.coin.replace('/', '');
      
      toast.info(`Running 30-day backtest for ${symbol}...`);
      const result = await engine.runBacktest(symbol, 30);
      
      setBacktestResult(result);
      toast.success("Backtest completed successfully");
    } catch (error) {
      console.error("Backtest failed:", error);
      toast.error("Backtest failed. Check console for details.");
    } finally {
      setIsBacktesting(false);
    }
  };

  const generateSetup = async () => {
    setIsAnalyzing(true);
    setSetup(null);
    setBacktestResult(null); // Reset backtest on new setup
    setStatusMessage("Initializing AI Engine...");

    try {
      const binance = new BinanceService();
      const analyzer = new PublicDataAnalyzer();

      // 1. Get top volume symbols to scan
      setStatusMessage("Scanning top volume markets...");
      const symbols = await binance.getTopVolumeSymbols(15);
      
      let bestSetup: AnalysisResult | null = null;
      let bestSymbol = "";
      let bestKline = null;

      // 2. Scan each symbol for patterns
      for (const symbol of symbols) {
        setStatusMessage(`Analyzing ${symbol}...`);
        const klines = await binance.getKlines(symbol, '15m', 100);
        
        if (klines.length > 50) {
          const patterns = analyzer.analyzeFailurePatterns(klines, symbol, '15m');
          
          // Find the highest confidence pattern
          for (const pattern of patterns) {
            if (!bestSetup || pattern.confidence > bestSetup.confidence) {
              bestSetup = pattern;
              bestSymbol = symbol;
              bestKline = klines[klines.length - 1];
            }
          }
        }
        
        // Add small delay to prevent rate limiting and allow UI update
        await new Promise(r => setTimeout(r, 100));
      }

      if (bestSetup && bestKline) {
        setStatusMessage("Applying Inverse IQ Logic...");
        await new Promise(r => setTimeout(r, 600));

        // Apply User History Logic
        let confidence = bestSetup.confidence;
        let rationale = bestSetup.reason;
        let inverseRationale = undefined;

        if (userPatterns.length > 0) {
          // Mocking an engine instance just to use the adjustSignal method logic
          // In a real app, we might keep the engine instance in state
          const engine = new InverseEngine([]); 
          const adjusted = engine.adjustSignal({
            type: bestSetup.inverseDirection as 'LONG' | 'SHORT',
            confidence: bestSetup.confidence
          }, userPatterns);

          confidence = adjusted.confidence;
          if (adjusted.inverseRationale) {
            inverseRationale = adjusted.inverseRationale;
          }
        }

        const currentPrice = bestKline.close;
        const isLong = bestSetup.inverseDirection === 'LONG';
        
        // Risk Management (2% Rule)
        const riskPercent = 0.02;
        const rewardRatio = 2.5; // Target 1:2.5 RR

        let entry, stopLoss, takeProfit;

        if (isLong) {
          entry = currentPrice;
          stopLoss = entry * (1 - riskPercent);
          const riskAmount = entry - stopLoss;
          takeProfit = entry + (riskAmount * rewardRatio);
        } else {
          entry = currentPrice;
          stopLoss = entry * (1 + riskPercent);
          const riskAmount = stopLoss - entry;
          takeProfit = entry - (riskAmount * rewardRatio);
        }

        const decimals = currentPrice > 1000 ? 2 : currentPrice > 1 ? 4 : 6;

        const newSetup: TradeSetup = {
          coin: `${bestSymbol.replace('USDT', '/USDT')}`,
          type: isLong ? "LONG" : "SHORT",
          entry: Number(entry.toFixed(decimals)),
          stopLoss: Number(stopLoss.toFixed(decimals)),
          takeProfit: Number(takeProfit.toFixed(decimals)),
          riskReward: rewardRatio,
          confidence: confidence,
          volatility: "MEDIUM",
          trend: isLong ? "BULLISH" : "BEARISH",
          rationale: rationale,
          patternType: bestSetup.type.replace(/_/g, ' '),
          inverseRationale: inverseRationale,
          confluenceScore: bestSetup.confluenceScore || 0,
          confluenceFactors: bestSetup.confluenceFactors || []
        };

        setSetup(newSetup);
      } else {
        toast.error("No high-confidence setups found. Try again shortly.");
      }

    } catch (error) {
      console.error("Analysis failed:", error);
      toast.error("Market analysis failed. Please check connection.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 relative overflow-hidden group hover:border-primary/50 transition-colors h-full flex flex-col">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-purple-600"></div>
      
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-bold tracking-tight text-xl md:text-2xl flex items-center gap-2">
              <Brain className="w-6 h-6 text-primary" />
              AI SETUP FINDER
            </h2>
            <p className=" text-muted-foreground mt-2 text-sm leading-relaxed">
              Generate high-probability setups based on <strong>Inverse IQ</strong> logic.
              <span className="block text-xs text-primary/80 mt-1 font-mono">*Scans live Binance Futures data.</span>
            </p>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" title="Upload Trade History">
                <History className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Personalize AI with Trade History</DialogTitle>
              </DialogHeader>
              <TradeHistoryUpload onUploadComplete={handleHistoryUpload} />
            </DialogContent>
          </Dialog>
        </div>
        
        <Button 
          onClick={generateSetup} 
          disabled={isAnalyzing}
          className="w-full bg-primary hover:bg-primary/80 text-black font-bold h-12 relative overflow-hidden"
        >
          {isAnalyzing ? (
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin" />
              SCANNING MARKET...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 fill-current" />
              FIND NEW SETUP
            </div>
          )}
          
          {/* Scanning Effect */}
          {isAnalyzing && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full h-full animate-[shimmer_1s_infinite]"></div>
          )}
        </Button>
      </div>

      {/* Analysis Visualization Area */}
      <div className="flex-grow min-h-[300px] bg-black/20 rounded-lg border border-border/30 p-4 flex items-center justify-center relative">
        {!setup && !isAnalyzing && (
          <div className="text-center text-muted-foreground p-4">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">AI model ready. Click "FIND NEW SETUP" to analyze live market patterns.</p>
            {userPatterns.length > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-mono border border-green-500/20">
                <Check className="w-3 h-3" />
                <span>PERSONALIZED ENGINE ACTIVE</span>
              </div>
            )}
          </div>
        )}

        {isAnalyzing && (
          <div className="w-full space-y-6 px-2">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-primary">
                <span className="animate-pulse">{statusMessage}</span>
              </div>
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse w-1/3"></div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-white/5 rounded animate-pulse"></div>
              ))}
            </div>
          </div>
        )}

        {setup && !isAnalyzing && (
          <div className="w-full h-full flex flex-col justify-between animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold tracking-tight text-xl">{setup.coin}</h3>
                <span className={`font-mono font-bold text-xs ${
                  setup.type === "LONG" ? "text-green-500" : "text-red-500"
                }`}>{setup.type} SIGNAL</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</p>
                <p className="font-bold tracking-tight text-lg text-primary">{setup.confidence}%</p>
              </div>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-black/40 p-2 rounded border border-border/30 text-center">
                <span className="text-[10px] text-muted-foreground block mb-1">ENTRY</span>
                <span className="font-mono text-sm font-bold text-white">{setup.entry}</span>
              </div>
              <div className="bg-black/40 p-2 rounded border border-border/30 text-center">
                <span className="text-[10px] text-muted-foreground block mb-1">TARGET</span>
                <span className="font-mono text-sm font-bold text-green-400">{setup.takeProfit}</span>
              </div>
              <div className="bg-black/40 p-2 rounded border border-border/30 text-center">
                <span className="text-[10px] text-muted-foreground block mb-1">STOP</span>
                <span className="font-mono text-sm font-bold text-red-400">{setup.stopLoss}</span>
              </div>
            </div>

            {/* Rationale */}
            <div className="space-y-3 mb-4 flex-grow">
              <div className="bg-primary/5 border border-primary/20 p-3 rounded text-xs">
                <p className="text-primary font-bold mb-1 flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  PATTERN DETECTED: {setup.patternType}
                </p>
                <p className="text-muted-foreground leading-relaxed">{setup.rationale}</p>
              </div>

              {setup.inverseRationale && (
                <div className="bg-purple-500/10 border border-purple-500/30 p-3 rounded text-xs">
                  <p className="text-purple-400 font-bold mb-1 flex items-center gap-2">
                    <Brain className="w-3 h-3" />
                    PERSONALIZED INSIGHT
                  </p>
                  <p className="text-muted-foreground leading-relaxed">{setup.inverseRationale}</p>
                </div>
              )}

              {/* Confluence Score */}
              <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded text-xs">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-blue-400 font-bold flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    CONFLUENCE SCORE
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((star) => (
                      <div 
                        key={star} 
                        className={`w-2 h-2 rounded-full ${
                          (setup.confluenceScore || 0) >= star ? 'bg-blue-400' : 'bg-blue-400/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(setup.confluenceFactors || []).map((factor, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] border border-blue-500/30">
                      {factor}
                    </span>
                  ))}
                  {(setup.confluenceFactors || []).length === 0 && (
                    <span className="text-muted-foreground italic text-[10px]">No additional confluence factors</span>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/40 p-2 rounded border border-border/30">
                <span className="text-muted-foreground block text-[10px]">RISK/REWARD</span>
                <span className="font-mono text-primary">1:{setup.riskReward}</span>
              </div>
              <div className="bg-black/40 p-2 rounded border border-border/30">
                <span className="text-muted-foreground block text-[10px]">VOLATILITY</span>
                <span className={`font-mono ${
                  setup.volatility === 'HIGH' ? 'text-red-400' : 
                  setup.volatility === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'
                }`}>{setup.volatility}</span>
              </div>
            </div>

            {/* Backtest Section */}
            <div className="mt-4 pt-4 border-t border-border/30">
              {!backtestResult ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={runBacktest} 
                  disabled={isBacktesting}
                  className="w-full text-xs border-primary/30 hover:bg-primary/10"
                >
                  {isBacktesting ? (
                    <>
                      <Activity className="w-3 h-3 mr-2 animate-spin" />
                      RUNNING SIMULATION...
                    </>
                  ) : (
                    <>
                      <History className="w-3 h-3 mr-2" />
                      VERIFY STRATEGY (30-DAY BACKTEST)
                    </>
                  )}
                </Button>
              ) : (
                <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-muted-foreground">HISTORICAL PERFORMANCE (30D)</span>
                    <span className={`text-xs font-bold ${backtestResult.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {backtestResult.totalPnL >= 0 ? '+' : ''}{backtestResult.totalPnL.toFixed(2)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[9px] text-muted-foreground">WIN RATE</div>
                      <div className="text-xs font-mono font-bold text-primary">{backtestResult.winRate.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground">TRADES</div>
                      <div className="text-xs font-mono">{backtestResult.totalTrades}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground">PROFIT F.</div>
                      <div className="text-xs font-mono">{backtestResult.profitFactor.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button 
                variant="outline" 
                className="w-full font-bold text-xs border-primary/50 hover:bg-primary/10"
                onClick={copyTrade}
              >
                {copied ? <Check className="w-3 h-3 mr-2" /> : <Copy className="w-3 h-3 mr-2" />}
                {copied ? "COPIED" : "COPY TRADE"}
              </Button>
              
              <div className="flex gap-1">
                <Button 
                  className="flex-1 font-bold text-[10px] bg-[#F3BA2F] hover:bg-[#F3BA2F]/80 text-black px-1"
                  onClick={() => openExchange("BINANCE")}
                >
                  BINANCE
                </Button>
                <Button 
                  className="flex-1 font-bold text-[10px] bg-black hover:bg-gray-900 text-white border border-gray-700 px-1"
                  onClick={() => openExchange("BYBIT")}
                >
                  BYBIT
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
