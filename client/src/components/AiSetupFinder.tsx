import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, TrendingDown, Activity, Zap, Copy, Check, ExternalLink, History, Wallet, Key } from "lucide-react";
import { toast } from "sonner";
import { BinanceService } from "@/lib/binance";
import { DexService } from "@/lib/dex";
import { useAccount } from "wagmi";
import { PublicDataAnalyzer, AnalysisResult } from "@/lib/analysis";
import TradeHistoryUpload from "./TradeHistoryUpload";
import { TradeHistoryParser } from "@/lib/csvParser";
import { InverseEngine, InversePattern } from "@/lib/inverseEngine";
import { useTrades } from "@/contexts/TradeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BacktestEngine, BacktestResult } from "@/lib/backtest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { generateBackendSignal, checkBackendHealth } from "@/lib/backendService";
import { SignalCountdown } from "@/components/SignalCountdown";
import { Link } from "wouter";

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
  // New enrichment fields
  vpBias?: "bullish" | "bearish" | "neutral";
  vpScore?: number;
  priceVsPoc?: string;
  sentimentLabel?: string;
  sentimentBias?: "bullish" | "bearish" | "neutral";
  fearGreedValue?: number;
  fearGreedLabel?: string;
  isTrending?: boolean;
  trendingRank?: number | null;
  technicalScore?: number;
  microstructureScore?: number;
  volatilityScore?: number;
  patternDetected?: string;
  longShortRatio?: number;
  cvdBias?: string;
}

const SERVER_STRATEGY_OPTIONS = [
  { value: "ai_best_pick", label: "AI Best Pick (5-Layer Confluence)" },
  { value: "momentum_rsi", label: "Momentum RSI Preference" },
] as const;

type ServerStrategyPreference = (typeof SERVER_STRATEGY_OPTIONS)[number]["value"];

function getStrategyLabel(preference: ServerStrategyPreference) {
  return SERVER_STRATEGY_OPTIONS.find(option => option.value === preference)?.label ?? SERVER_STRATEGY_OPTIONS[0].label;
}

export default function AiSetupFinder() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [setup, setSetup] = useState<TradeSetup | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  // Use persisted patterns from TradeContext (auto-loaded from DB on mount)
  const { patterns: userPatterns, symbolPatterns: userSymbolPatterns, setTrades: persistTrades, isPersisted, lastUploadedAt } = useTrades();
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<ServerStrategyPreference>("ai_best_pick");
  const [leverage, setLeverage] = useState(5);
  const [margin, setMargin] = useState(100);
  const { isConnected } = useAccount();
  const [isExecutingOrder, setIsExecutingOrder] = useState(false);
  // Track which exchanges this signal is valid on
  const [listedOnExchanges, setListedOnExchanges] = useState<string[]>([]);
  
  // tRPC mutation for saving signals
  const saveSignalMutation = trpc.signals.save.useMutation();
  // New: server-side signal engine (VP + sentiment enriched)
  const bestCoinMutation = trpc.scanner.bestCoinNow.useMutation();
  const { data: binanceKeyData } = trpc.binance.hasApiKey.useQuery();
  const { data: bybitKeyData } = trpc.bybit.hasApiKey.useQuery();
  const { data: okxKeyData } = trpc.okx.hasApiKey.useQuery();

  // Bad entry filter preference
  const { data: userSettingsData } = trpc.userSettings.get.useQuery(undefined, { staleTime: 60_000 });
  const badEntryFilter = (userSettingsData as any)?.badEntryFilter as "hide" | "deprioritize" | "show" | undefined;

  // Import trade history from connected exchange for AI learning
  const importBybitHistoryMutation = trpc.bybit.importTradeHistory.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(`Imported ${data.tradesImported} trades from Bybit — AI engine updated!`);
      else toast.error(`Import failed: ${data.error}`);
    },
    onError: (err) => toast.error(`Import error: ${err.message}`),
  });
  const importOkxHistoryMutation = trpc.okx.importTradeHistory.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(`Imported ${data.tradesImported} trades from OKX — AI engine updated!`);
      else toast.error(`Import failed: ${data.error}`);
    },
    onError: (err) => toast.error(`Import error: ${err.message}`),
  });

  const placeOrderMutation = trpc.binance.placeOrder.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Order placed! ${setup?.type} ${setup?.coin} on Binance Futures`);
      } else {
        toast.error(`Order failed: ${data.error}`);
      }
      setIsExecutingOrder(false);
    },
    onError: (err) => {
      toast.error(`Order error: ${err.message}`);
      setIsExecutingOrder(false);
    },
  });
  const bybitPlaceOrderMutation = trpc.bybit.placeOrder.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Order placed! ${setup?.type} ${setup?.coin} on Bybit`);
      } else {
        toast.error(`Order failed: ${data.error}`);
      }
      setIsExecutingOrder(false);
    },
    onError: (err) => {
      toast.error(`Order error: ${err.message}`);
      setIsExecutingOrder(false);
    },
  });
  const okxPlaceOrderMutation = trpc.okx.placeOrder.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Order placed! ${setup?.type} ${setup?.coin} on OKX`);
      } else {
        toast.error(`Order failed: ${data.error}`);
      }
      setIsExecutingOrder(false);
    },
    onError: (err) => {
      toast.error(`Order error: ${err.message}`);
      setIsExecutingOrder(false);
    },
  });

  const executeOrder = (exchange: "binance" | "bybit" | "okx") => {
    if (!setup) return;
    const cleanSymbol = setup.coin.replace("/", "");
    const qty = parseFloat(((margin * leverage) / setup.entry).toFixed(3));
    if (qty <= 0) { toast.error("Invalid position size."); return; }
    setIsExecutingOrder(true);
    if (exchange === "binance") {
      placeOrderMutation.mutate({ symbol: cleanSymbol, side: setup.type === "LONG" ? "BUY" : "SELL", quantity: qty, leverage: leverage });
    } else if (exchange === "bybit") {
      bybitPlaceOrderMutation.mutate({ symbol: cleanSymbol, side: setup.type === "LONG" ? "Buy" : "Sell", qty: String(qty), leverage });
    } else if (exchange === "okx") {
      okxPlaceOrderMutation.mutate({ symbol: cleanSymbol, side: setup.type === "LONG" ? "buy" : "sell", sz: String(qty), leverage });
    }
  };

  const executeBinanceOrder = () => executeOrder("binance");
  const [signalGeneratedAt, setSignalGeneratedAt] = useState<Date | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const handleHistoryUpload = (trades: any[]) => {
    // Persist to DB via TradeContext — toast is handled inside TradeContext
    persistTrades(trades);
  };

  const copyTrade = () => {
    if (!setup) return;
    
    const positionSize = margin * leverage;
    const tradeString = `
=== XRYPT AI SIGNAL ===
PAIR: ${setup.coin}
TYPE: ${setup.type}
ENTRY: ${setup.entry}
TARGET: ${setup.takeProfit}
STOP: ${setup.stopLoss}
LEVERAGE: ${leverage}x
MARGIN: $${margin}
POSITION SIZE: $${positionSize.toLocaleString()}
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

  const openDex = () => {
    if (!setup) return;
    
    // Auto-copy parameters including margin/leverage
    copyTrade();
    
    // Default to Hyperliquid as it's the most popular perp DEX currently
    const url = DexService.getHyperliquidUrl(setup.coin);
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
      // ── Use server-side signal engine (VP + sentiment + microstructure) ──────────────
      setStatusMessage("Scanning top volume markets with AI engine...");
      const serverResult = await bestCoinMutation.mutateAsync({
        primaryTf: "15m",
        badEntryFilter: badEntryFilter ?? "deprioritize",
        strategyPreference: selectedStrategy,
      });

      let bestSignal: any = null;
      let bestSymbol = "";

      if (serverResult && serverResult.success !== false) {
        // Handle filtered bad entries
        if ((serverResult as any).isFiltered) {
          setStatusMessage("");
          setIsAnalyzing(false);
          toast.warning((serverResult as any).filterReason ?? "Bad entry detected — signal filtered. Try again later.");
          return;
        }
        if (selectedStrategy === "momentum_rsi" && !serverResult.strategyPreferenceApplied) {
          toast.info(serverResult.strategySelectionNote ?? "No eligible Momentum RSI candidate was available; AI Best Pick was retained.");
        }
        setStatusMessage("Enriching with volume profile + sentiment data...");
        // Map server result to bestSignal format
        bestSignal = {
          direction: serverResult.direction as "LONG" | "SHORT",
          entryPrice: serverResult.entry ?? serverResult.currentPrice,
          stopLoss: serverResult.sl ?? (serverResult.entry ?? serverResult.currentPrice) * (serverResult.direction === "LONG" ? 0.97 : 1.03),
          takeProfit: serverResult.tp2 ?? serverResult.tp1 ?? (serverResult.entry ?? serverResult.currentPrice) * (serverResult.direction === "LONG" ? 1.06 : 0.94),
          confidence: serverResult.confidence === "HIGH" ? 85 : serverResult.confidence === "MEDIUM" ? 70 : 55,
          reason: serverResult.keyReason ?? serverResult.analysis ?? "",
          confluenceScore: Math.round((serverResult.technicalScore ?? 0) / 33),
          confluenceFactors: [
            serverResult.technicalScore ? `Technical ${serverResult.technicalScore}/100` : null,
            serverResult.microstructureScore ? `Microstructure ${serverResult.microstructureScore}/100` : null,
            serverResult.volatilityScore ? `Volatility ${serverResult.volatilityScore}/100` : null,
            serverResult.patternType && serverResult.patternType !== "none" ? `Pattern: ${serverResult.patternType}` : null,
            serverResult.cvdBias ? `CVD: ${serverResult.cvdBias}` : null,
          ].filter(Boolean) as string[],
          // Enrichment fields
          vpBias: serverResult.vpBias,
          vpScore: serverResult.vpScore,
          priceVsPoc: serverResult.priceVsPoc,
          sentimentLabel: serverResult.sentimentLabel,
          sentimentBias: serverResult.sentimentBias,
          fearGreedValue: serverResult.fearGreedValue,
          fearGreedLabel: serverResult.fearGreedLabel,
          isTrending: serverResult.isTrending,
          trendingRank: serverResult.trendingRank,
          technicalScore: serverResult.technicalScore,
          microstructureScore: serverResult.microstructureScore,
          volatilityScore: serverResult.volatilityScore,
          patternDetected: serverResult.patternType,
          longShortRatio: serverResult.longShortRatio,
          cvdBias: serverResult.cvdBias,
        };
        bestSymbol = serverResult.symbol ?? "BTCUSDT";
        setStatusMessage("Finalizing Setup...");
      }

      if (bestSignal) {
        setStatusMessage("Finalizing Setup...");
        await new Promise(r => setTimeout(r, 600));

        // Apply User History Logic (Only for Inverse IQ or if generic enough)
        let confidence = bestSignal.confidence;
        let rationale = bestSignal.reason;
        let inverseRationale = undefined;

        if (userPatterns.length > 0 || userSymbolPatterns.length > 0) {
          const engine = new InverseEngine([]);
          const adjusted = engine.adjustSignal(
            { type: bestSignal.direction, confidence: bestSignal.confidence },
            userPatterns,
            userSymbolPatterns,
            bestSymbol
          );
          confidence = adjusted.confidence;
          if (adjusted.inverseRationale) inverseRationale = adjusted.inverseRationale;
          // Append symbol-level rationale to the main rationale string
          if (adjusted.symbolRationale) {
            rationale = rationale
              ? `${rationale} | ${adjusted.symbolRationale}`
              : adjusted.symbolRationale;
          }
        }

        const decimals = bestSignal.entryPrice > 1000 ? 2 : bestSignal.entryPrice > 1 ? 4 : 6;
        const riskReward = Math.abs((bestSignal.takeProfit - bestSignal.entryPrice) / (bestSignal.entryPrice - bestSignal.stopLoss));

        const newSetup: TradeSetup = {
          coin: `${bestSymbol.replace('USDT', '/USDT')}`,
          type: bestSignal.direction,
          entry: Number(bestSignal.entryPrice.toFixed(decimals)),
          stopLoss: Number(bestSignal.stopLoss.toFixed(decimals)),
          takeProfit: Number(bestSignal.takeProfit.toFixed(decimals)),
          riskReward: Number(riskReward.toFixed(2)),
          confidence: confidence,
          volatility: "MEDIUM",
          trend: bestSignal.direction === "LONG" ? "BULLISH" : "BEARISH",
          rationale: rationale,
          patternType: serverResult.strategySelectionLabel ?? getStrategyLabel(selectedStrategy),
          inverseRationale: inverseRationale,
          confluenceScore: bestSignal.confluenceScore || 0,
          confluenceFactors: bestSignal.confluenceFactors || []
        };

        setSetup(newSetup);
        setSignalGeneratedAt(new Date());
        setIsExpired(false);
        // Store which exchanges this signal is valid on for routing
        setListedOnExchanges(serverResult?.listedOnExchanges ?? []);
        
        // Save high-confidence signals (≥80%) to database for verification
        if (confidence >= 80) {
          try {
            await saveSignalMutation.mutateAsync({
              // Store canonical symbol (BTCUSDT) not display form (BTC/USDT)
              symbol: newSetup.coin.replace("/", ""),
              direction: newSetup.type,
              strategy: serverResult.strategySelectionLabel ?? getStrategyLabel(selectedStrategy),
              entryPrice: newSetup.entry.toString(),
              stopLoss: newSetup.stopLoss.toString(),
              takeProfit: newSetup.takeProfit.toString(),
              confidence: confidence,
              riskRewardRatio: newSetup.riskReward.toString(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h validity
              metadata: JSON.stringify({
                confluenceScore: newSetup.confluenceScore,
                confluenceFactors: newSetup.confluenceFactors,
                inverseRationale: newSetup.inverseRationale,
                leverage,
                margin
              })
            });
            console.log("High-confidence signal saved to database for verification");
          } catch (error) {
            console.error("Failed to save signal:", error);
            // Don't block the UI if saving fails
          }
        }
      } else {
        // This should rarely happen — MomentumRSI fallback should always produce a signal
        toast.error("Market data unavailable. Check your connection and try again.");
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

        <div className="mb-2">
          <label className="text-xs text-muted-foreground mb-1 block uppercase tracking-wider">Active Strategy</label>
          <Select value={selectedStrategy} onValueChange={(value) => setSelectedStrategy(value as ServerStrategyPreference)}>
            <SelectTrigger className="w-full bg-background/50 border-border/50 font-bold text-sm">
              <SelectValue placeholder="Select Strategy" />
            </SelectTrigger>
            <SelectContent>
              {SERVER_STRATEGY_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="font-bold">{option.label}</span>
                  {option.value === "ai_best_pick" && (
                    <span className="ml-2 bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded border border-primary/30 font-bold uppercase">Recommended</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-2">- {option.value === "ai_best_pick" ? "Highest-ranked eligible candidate from the server's 5-layer analysis." : "Prefers an eligible Momentum RSI candidate from the same server scan."}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              {selectedStrategy === "ai_best_pick" ? "FIND BEST TRADE TO TAKE" : "FIND MOMENTUM RSI SETUP"}
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
              <div className="mt-4 space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-mono border border-green-500/20">
                  <Check className="w-3 h-3" />
                  <span>PERSONALIZED ENGINE ACTIVE — {userPatterns.length} pattern{userPatterns.length > 1 ? 's' : ''} loaded</span>
                </div>
                {isPersisted && lastUploadedAt && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-mono border border-blue-500/20">
                    <span>✦ AUTO-LOADED FROM DB</span>
                    <span className="opacity-60">· {lastUploadedAt.toLocaleDateString()}</span>
                    {userSymbolPatterns.length > 0 && (
                      <span className="opacity-60">· {userSymbolPatterns.length} pairs profiled</span>
                    )}
                  </div>
                )}
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
          <div className={`w-full h-full flex flex-col justify-between animate-in fade-in zoom-in duration-300 ${isExpired ? 'opacity-50 grayscale' : ''}`}>
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

            {/* Countdown Timer */}
            {signalGeneratedAt && (
              <div className="mb-3">
                <SignalCountdown
                  symbol={setup.coin}
                  direction={setup.type}
                  createdAt={signalGeneratedAt}
                  volatility={setup.volatility === 'HIGH' ? 0.8 : setup.volatility === 'MEDIUM' ? 0.5 : 0.2}
                  timeframeMinutes={15}
                  confidence={setup.confidence}
                  onExpire={() => setIsExpired(true)}
                  onRefresh={() => { setSetup(null); setSignalGeneratedAt(null); setIsExpired(false); }}
                />
              </div>
            )}

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

            {/* Volume Profile + Sentiment Row */}
            {(setup.vpBias || setup.sentimentBias) && (
              <div className="flex gap-2 flex-wrap mb-3">
                {setup.vpBias && (
                  <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border bg-black/30 border-border/30">
                    <span className="text-zinc-500">Volume Profile:</span>
                    <span className={setup.vpBias === "bullish" ? "text-emerald-400 font-bold" : setup.vpBias === "bearish" ? "text-red-400 font-bold" : "text-zinc-400"}>
                      {setup.vpBias === "bullish" ? "▲ Bullish" : setup.vpBias === "bearish" ? "▼ Bearish" : "→ Neutral"}
                    </span>
                    {setup.priceVsPoc && <span className="text-zinc-600">· Price {setup.priceVsPoc} POC</span>}
                  </div>
                )}
                {setup.sentimentBias && (
                  <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border bg-black/30 border-border/30">
                    <span className="text-zinc-500">Sentiment:</span>
                    <span className={setup.sentimentBias === "bullish" ? "text-emerald-400 font-bold" : setup.sentimentBias === "bearish" ? "text-red-400 font-bold" : "text-zinc-400"}>
                      {setup.sentimentLabel ?? setup.sentimentBias}
                    </span>
                    {setup.fearGreedValue !== undefined && (
                      <span className="text-zinc-600">· F&amp;G {setup.fearGreedValue} ({setup.fearGreedLabel})</span>
                    )}
                  </div>
                )}
                {setup.isTrending && (
                  <div className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border bg-yellow-500/10 border-yellow-500/30 text-yellow-400">
                    🔥 Trending{setup.trendingRank ? ` #${setup.trendingRank}` : ""}
                  </div>
                )}
              </div>
            )}

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
                  className="flex-1 font-bold text-xs sm:text-[10px] h-10 sm:h-8 bg-[#F3BA2F] hover:bg-[#F3BA2F]/80 text-black px-1"
                  onClick={() => openExchange("BINANCE")}
                >
                  BINANCE
                </Button>
                <Button 
                  className="flex-1 font-bold text-xs sm:text-[10px] h-10 sm:h-8 bg-black hover:bg-gray-900 text-white border border-gray-700 px-1"
                  onClick={() => openExchange("BYBIT")}
                >
                  BYBIT
                </Button>
              </div>
            </div>

            {/* Position Sizing Controls */}
            <div className="bg-background/30 p-3 rounded-lg border border-border/30 mb-3">
              <div className="flex flex-col sm:flex-row gap-4 mb-3">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Margin (USDT)</Label>
                  <Input 
                    type="number" 
                    value={margin} 
                    onChange={(e) => setMargin(Number(e.target.value))}
                    className="h-9 sm:h-7 text-sm sm:text-xs font-mono bg-background/50 border-border/50"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Leverage ({leverage}x)</Label>
                  <Slider 
                    value={[leverage]} 
                    onValueChange={(v) => setLeverage(v[0])} 
                    max={50} 
                    min={1} 
                    step={1}
                    className="py-4 sm:py-2 touch-none"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground border-t border-border/30 pt-2">
                <span>Position Size:</span>
                <span className="text-primary font-bold text-sm sm:text-xs">${(margin * leverage).toLocaleString()}</span>
              </div>
            </div>

            {/* Multi-Exchange Validity + 1-Click Execute */}
            <div className="mt-2 space-y-2">
              {/* Show which exchanges this signal is valid on */}
              {listedOnExchanges.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Valid on:</span>
                  {listedOnExchanges.map(ex => (
                    <span key={ex} className="px-2 py-0.5 rounded text-[10px] font-bold font-mono border
                      bg-emerald-500/10 text-emerald-400 border-emerald-500/30 uppercase">
                      {ex}
                    </span>
                  ))}
                  {listedOnExchanges.length > 1 && (
                    <span className="text-[10px] text-blue-400 font-mono">✦ Cross-exchange setup</span>
                  )}
                </div>
              )}

              {/* 1-click buttons for each exchange the signal is listed on */}
              {listedOnExchanges.includes("binance") && (
                binanceKeyData?.hasKey ? (
                  <Button
                    className={`w-full font-bold text-sm h-10 ${
                      setup?.type === "LONG"
                        ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                        : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
                    }`}
                    onClick={() => executeOrder("binance")}
                    disabled={isExecutingOrder}
                  >
                    {isExecutingOrder ? <Activity className="w-4 h-4 mr-2 animate-pulse" /> : <Zap className="w-4 h-4 mr-2" />}
                    {isExecutingOrder ? "EXECUTING..." : `1-CLICK ${setup?.type} — BINANCE`}
                  </Button>
                ) : (
                  <Link href="/binance-setup">
                    <Button variant="outline" className="w-full font-bold text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 h-9">
                      <Key className="w-3 h-3 mr-2" />SETUP BINANCE API FOR 1-CLICK
                    </Button>
                  </Link>
                )
              )}

              {listedOnExchanges.includes("bybit") && (
                bybitKeyData?.hasKey ? (
                  <Button
                    className={`w-full font-bold text-sm h-10 ${
                      setup?.type === "LONG"
                        ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                        : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
                    }`}
                    onClick={() => executeOrder("bybit")}
                    disabled={isExecutingOrder}
                  >
                    {isExecutingOrder ? <Activity className="w-4 h-4 mr-2 animate-pulse" /> : <Zap className="w-4 h-4 mr-2" />}
                    {isExecutingOrder ? "EXECUTING..." : `1-CLICK ${setup?.type} — BYBIT`}
                  </Button>
                ) : (
                  <Link href="/bybit-setup">
                    <Button variant="outline" className="w-full font-bold text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10 h-9">
                      <Key className="w-3 h-3 mr-2" />SETUP BYBIT API FOR 1-CLICK
                    </Button>
                  </Link>
                )
              )}

              {listedOnExchanges.includes("okx") && (
                okxKeyData?.hasKey ? (
                  <Button
                    className={`w-full font-bold text-sm h-10 ${
                      setup?.type === "LONG"
                        ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                        : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
                    }`}
                    onClick={() => executeOrder("okx")}
                    disabled={isExecutingOrder}
                  >
                    {isExecutingOrder ? <Activity className="w-4 h-4 mr-2 animate-pulse" /> : <Zap className="w-4 h-4 mr-2" />}
                    {isExecutingOrder ? "EXECUTING..." : `1-CLICK ${setup?.type} — OKX`}
                  </Button>
                ) : (
                  <Link href="/okx-setup">
                    <Button variant="outline" className="w-full font-bold text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-9">
                      <Key className="w-3 h-3 mr-2" />SETUP OKX API FOR 1-CLICK
                    </Button>
                  </Link>
                )
              )}

              {/* Fallback: if no exchange info yet, show Bybit as default */}
              {listedOnExchanges.length === 0 && (
                bybitKeyData?.hasKey ? (
                  <Button
                    className={`w-full font-bold text-sm h-10 ${
                      setup?.type === "LONG"
                        ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                        : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
                    }`}
                    onClick={() => executeOrder("bybit")}
                    disabled={isExecutingOrder}
                  >
                    {isExecutingOrder ? <Activity className="w-4 h-4 mr-2 animate-pulse" /> : <Zap className="w-4 h-4 mr-2" />}
                    {isExecutingOrder ? "EXECUTING..." : `1-CLICK ${setup?.type} — BYBIT`}
                  </Button>
                ) : (
                  <Link href="/bybit-setup">
                    <Button variant="outline" className="w-full font-bold text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10 h-9">
                      <Key className="w-3 h-3 mr-2" />SETUP BYBIT API FOR 1-CLICK
                    </Button>
                  </Link>
                )
              )}

              {/* Import trade history from connected exchange */}
              {(bybitKeyData?.hasKey || okxKeyData?.hasKey) && (
                <div className="flex gap-1 pt-1">
                  {bybitKeyData?.hasKey && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-[10px] border-orange-500/20 text-orange-400/70 hover:bg-orange-500/10 h-7"
                      onClick={() => importBybitHistoryMutation.mutate({ limit: 200 })}
                      disabled={importBybitHistoryMutation.isPending}
                    >
                      {importBybitHistoryMutation.isPending ? <Activity className="w-3 h-3 mr-1 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
                      {importBybitHistoryMutation.isPending ? "Importing..." : "Sync Bybit History"}
                    </Button>
                  )}
                  {okxKeyData?.hasKey && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-[10px] border-blue-500/20 text-blue-400/70 hover:bg-blue-500/10 h-7"
                      onClick={() => importOkxHistoryMutation.mutate({ limit: 200 })}
                      disabled={importOkxHistoryMutation.isPending}
                    >
                      {importOkxHistoryMutation.isPending ? <Activity className="w-3 h-3 mr-1 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
                      {importOkxHistoryMutation.isPending ? "Importing..." : "Sync OKX History"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Web3 / DEX Trading Button */}
            <div className="mt-2">
              <Button 
                variant="secondary"
                className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 text-sm sm:text-xs h-12 sm:h-8"
                onClick={openDex}
              >
                <Wallet className="w-4 h-4 sm:w-3 sm:h-3 mr-2" />
                TRADE ON HYPERLIQUID (DEX)
                <ExternalLink className="w-4 h-4 sm:w-3 sm:h-3 ml-2 opacity-50" />
              </Button>
              
              {!isConnected && (
                <p className="text-[9px] text-center text-muted-foreground mt-1 opacity-70">
                  *Connect wallet to trade directly on-chain
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
