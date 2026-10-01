import { useState, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import { trpc } from "@/lib/trpc";
import { useTrades } from "@/contexts/TradeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Streamdown } from "streamdown";
import {
  TrendingUp, TrendingDown, Minus, Brain, Activity,
  ChevronDown, ChevronUp, AlertTriangle, Zap, BarChart2,
  RefreshCw, Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Verdict = "UP" | "DOWN" | "UNKNOWN";
type Confidence = "HIGH" | "MEDIUM" | "LOW";
type Action = "HOLD" | "ADD" | "REDUCE" | "EXIT";

interface PredictionResult {
  success: boolean;
  verdict: Verdict;
  probability: number;
  confidence: Confidence;
  keyReason: string;
  keyLevel: number | null;
  suggestedAction: Action;
  analysis: string;
  currentPrice: number;
  pnlPct: number;
  indicators: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }[];
  fundingRate: string;
  oiChange: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const POPULAR_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT"];
const EXCHANGES = [
  { id: "binance", label: "Binance", emoji: "🟡", color: "yellow" },
  { id: "bybit", label: "Bybit", emoji: "🟠", color: "orange" },
  { id: "okx", label: "OKX", emoji: "🔵", color: "sky" },
  { id: "hyperliquid", label: "Hyperliquid", emoji: "🟣", color: "violet", quote: "USDC" },
  { id: "asterdex", label: "AsterDEX", emoji: "⭐", color: "lime" },
] as const;

const verdictColor = (v: Verdict) =>
  v === "UP" ? "text-emerald-400" : v === "DOWN" ? "text-red-400" : "text-zinc-400";
const verdictBg = (v: Verdict) =>
  v === "UP" ? "bg-emerald-500/10 border-emerald-500/30" : v === "DOWN" ? "bg-red-500/10 border-red-500/30" : "bg-zinc-500/10 border-zinc-500/30";
const confidenceBadge = (c: Confidence) =>
  c === "HIGH" ? "bg-emerald-500/20 text-emerald-300" : c === "MEDIUM" ? "bg-yellow-500/20 text-yellow-300" : "bg-zinc-500/20 text-zinc-400";
const actionColor = (a: Action) =>
  a === "ADD" ? "text-emerald-400" : a === "EXIT" ? "text-red-400" : a === "REDUCE" ? "text-orange-400" : "text-sky-400";
const rsiColor = (rsi: number) =>
  rsi >= 70 ? "text-red-400" : rsi <= 30 ? "text-emerald-400" : "text-zinc-300";

// ─── Indicator pill ───────────────────────────────────────────────────────────
function IndicatorRow({ tf, rsi, macdBias, bbPos, volTrend }: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-0">
      <span className="w-10 text-xs font-mono font-bold text-zinc-400">{tf}</span>
      <span className={`text-xs font-mono ${rsiColor(rsi)}`}>RSI {rsi}</span>
      <span className={`text-xs font-mono ${macdBias === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
        MACD {macdBias === "bullish" ? "↑" : "↓"}
      </span>
      <span className="text-xs font-mono text-zinc-400">BB {bbPos}%</span>
      <span className={`text-xs font-mono ${volTrend === "rising" ? "text-emerald-400" : volTrend === "falling" ? "text-red-400" : "text-zinc-500"}`}>
        Vol {volTrend}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TradePredictor() {
  const { symbolPatterns } = useTrades();

  const [symbol, setSymbol]           = useState("BTCUSDT");
  const [exchange, setExchange]       = useState("binance");
  const [side, setSide]               = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice]   = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [leverage, setLeverage]       = useState("10");
  const [result, setResult]           = useState<PredictionResult | null>(null);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  const predictMutation = trpc.predict.direction.useMutation();
  const savePrediction = trpc.predictionHistory.save.useMutation();
  const { data: predictionHistoryData, refetch: refetchHistory } = trpc.predictionHistory.list.useQuery(
    { limit: 10 },
    { refetchOnWindowFocus: false }
  );
  const clearHistory = trpc.predictionHistory.clear.useMutation({
    onSuccess: () => refetchHistory(),
  });

  // Pre-fill from URL query params (Quick Predict shortcut)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qSymbol = params.get("symbol");
    const qDirection = params.get("direction");
    const qEntry = params.get("entry");
    if (qSymbol) setSymbol(qSymbol.toUpperCase());
    if (qDirection) {
      const dir = qDirection.toUpperCase();
      if (dir === "LONG") setSide("long");
      else if (dir === "SHORT") setSide("short");
    }
    if (qEntry) setEntryPrice(qEntry);
  }, []);

  // Build symbol pattern context from persisted user history
  const buildPatternContext = () => {
    const clean = symbol.replace("/", "").replace("-PERP", "").replace(":USDT", "").toUpperCase();
    const pat = symbolPatterns.find(p => p.symbol === clean);
    if (!pat) return undefined;
    return `${pat.tradeCount} trades on ${clean}: ${pat.winRate}% win rate, avg PnL $${pat.avgPnl.toFixed(2)}, dominant side ${pat.dominantSide}, bias ${pat.bias}. Recommendation: ${pat.action} (${pat.summary})`;
  };

  const handlePredict = async () => {
    const entry = parseFloat(entryPrice);
    const lev   = parseFloat(leverage);
    if (!symbol.trim()) { toast.error("Enter a symbol"); return; }
    if (isNaN(entry) || entry <= 0) { toast.error("Enter a valid entry price"); return; }
    if (isNaN(lev) || lev < 1)     { toast.error("Enter valid leverage (min 1x)"); return; }

    setResult(null);
    setShowFullAnalysis(false);

    try {
      const res = await predictMutation.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        side,
        entryPrice: entry,
        currentPrice: currentPrice ? parseFloat(currentPrice) : undefined,
        leverage: lev,
        symbolPatternContext: buildPatternContext(),
      });
      setResult(res as PredictionResult);
      if (res.success) {
        // Auto-save prediction to history
        savePrediction.mutate({
          symbol: symbol.trim().toUpperCase(),
          side,
          entryPrice: entryPrice.trim(),
          leverage: Math.round(parseFloat(leverage)),
          verdict: res.verdict ?? "UNKNOWN",
          probability: Math.round(res.probability ?? 0),
          confidence: res.confidence ?? "LOW",
          keyReason: res.keyReason ?? "",
          suggestedAction: res.suggestedAction ?? "HOLD",
          currentPrice: String(res.currentPrice ?? 0),
          pnlPct: String(res.pnlPct ?? 0),
        }, {
          onSuccess: () => refetchHistory(),
        });
      }
      if (!res.success) toast.error(res.error ?? "Prediction failed");
    } catch (err: any) {
      toast.error(err?.message ?? "Prediction failed");
    }
  };

  const pnlColor = result
    ? result.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"
    : "text-zinc-400";

  return (
    <PageWrapper><div className="min-h-screen bg-black text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Brain className="w-6 h-6 text-cyan-400" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">FUTURES DIRECTION PREDICTOR</h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">PERP ONLY</span>
            </div>
            <p className="text-xs text-zinc-500">Enter your open <span className="text-cyan-600">perpetual futures</span> position — AI analyses 4 timeframes + funding rate + OI and predicts UP or DOWN</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Left: Input form ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Position Details</h2>

            {/* Exchange */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Exchange</Label>
              <div className="flex flex-wrap gap-1.5">
                {EXCHANGES.map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => setExchange(ex.id)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      exchange === ex.id
                        ? `border-${ex.color}-500 text-${ex.color}-400 bg-${ex.color}-500/10`
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                  >
                    <span>{ex.emoji}</span>
                    <span>{ex.label}</span>
                    {"quote" in ex && (ex as any).quote && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">USDC</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Symbol */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Symbol</Label>
              <Input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder={exchange === "hyperliquid" ? "e.g. BTCUSDC" : "e.g. BTCUSDT"}
                className="bg-zinc-800 border-zinc-700 text-white font-mono"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {POPULAR_PAIRS.map(p => {
                  const displayPair = exchange === "hyperliquid" ? p.replace("USDT", "USDC") : p;
                  return (
                    <button
                      key={p}
                      onClick={() => setSymbol(displayPair)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${symbol === displayPair ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}
                    >
                      {p.replace("USDT", "")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Side */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Position Side</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSide("long")}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-bold transition-colors ${side === "long" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}
                >
                  <TrendingUp className="w-4 h-4" /> LONG
                </button>
                <button
                  onClick={() => setSide("short")}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-bold transition-colors ${side === "short" ? "border-red-500 bg-red-500/10 text-red-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}
                >
                  <TrendingDown className="w-4 h-4" /> SHORT
                </button>
              </div>
            </div>

            {/* Entry + Current price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Entry Price ($)</Label>
                <Input
                  type="number"
                  value={entryPrice}
                  onChange={e => setEntryPrice(e.target.value)}
                  placeholder="e.g. 67500"
                  className="bg-zinc-800 border-zinc-700 text-white font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Current Price ($) <span className="text-zinc-600">(optional)</span></Label>
                <Input
                  type="number"
                  value={currentPrice}
                  onChange={e => setCurrentPrice(e.target.value)}
                  placeholder="auto-fetched"
                  className="bg-zinc-800 border-zinc-700 text-white font-mono"
                />
              </div>
            </div>

            {/* Leverage */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Leverage</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={leverage}
                  onChange={e => setLeverage(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white font-mono w-24"
                  min={1} max={200}
                />
                <span className="text-zinc-400 text-sm">{leverage}x</span>
                <div className="flex gap-1">
                  {[5, 10, 20, 50].map(l => (
                    <button
                      key={l}
                      onClick={() => setLeverage(String(l))}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${leverage === String(l) ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}
                    >
                      {l}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Personal history badge */}
            {symbolPatterns.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 shrink-0" />
                {symbolPatterns.find(p => p.symbol === symbol.replace("USDT", "").concat("USDT"))
                  ? `Personal history for ${symbol} will be included in the analysis`
                  : `${symbolPatterns.length} symbol patterns loaded — enter a pair from your history for personalised analysis`}
              </div>
            )}

            <Button
              onClick={handlePredict}
              disabled={predictMutation.isPending}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-12 text-sm tracking-widest"
            >
              {predictMutation.isPending ? (
                <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> ANALYSING MARKET...</span>
              ) : (
                <span className="flex items-center gap-2"><Zap className="w-4 h-4 fill-current" /> PREDICT DIRECTION</span>
              )}
            </Button>
          </div>

          {/* How it works */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">How It Works</p>
            <ul className="space-y-1.5 text-xs text-zinc-500">
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Fetches live 15m, 1H, 4H, and 1D candles from Binance Futures</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Calculates RSI, MACD, Bollinger Bands, and volume trend per timeframe</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Pulls live funding rate and 8-hour open interest change</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Injects your personal trade history for this pair (if available)</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> AI produces a focused UP/DOWN verdict with probability and key price levels</li>
            </ul>
          </div>
        </div>

        {/* ── Right: Result ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Loading skeleton */}
          {predictMutation.isPending && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-6 bg-zinc-800 rounded w-1/3" />
              <div className="h-20 bg-zinc-800 rounded" />
              <div className="h-4 bg-zinc-800 rounded w-2/3" />
              <div className="h-4 bg-zinc-800 rounded w-1/2" />
            </div>
          )}

          {/* Empty state */}
          {!predictMutation.isPending && !result && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
              <BarChart2 className="w-12 h-12 text-zinc-700" />
              <p className="text-zinc-500 text-sm">Fill in your position details and click<br /><strong className="text-zinc-400">PREDICT DIRECTION</strong> to get the AI verdict</p>
            </div>
          )}

          {/* Result card */}
          {result && !predictMutation.isPending && (
            <>
              {/* Main verdict */}
              <div className={`border rounded-xl p-6 space-y-4 ${verdictBg(result.verdict)}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">AI Verdict for {symbol}</p>
                    <div className="flex items-center gap-3">
                      {result.verdict === "UP" ? (
                        <TrendingUp className="w-10 h-10 text-emerald-400" />
                      ) : result.verdict === "DOWN" ? (
                        <TrendingDown className="w-10 h-10 text-red-400" />
                      ) : (
                        <Minus className="w-10 h-10 text-zinc-400" />
                      )}
                      <div>
                        <span className={`text-4xl font-black tracking-tight ${verdictColor(result.verdict)}`}>
                          {result.verdict}
                        </span>
                        <span className="text-zinc-400 text-lg ml-2">{result.probability}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge className={`text-xs ${confidenceBadge(result.confidence)}`}>{result.confidence} CONFIDENCE</Badge>
                    {result.currentPrice > 0 && (
                      <p className="text-xs text-zinc-500">Live: ${result.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
                    )}
                    {result.pnlPct !== 0 && (
                      <p className={`text-xs font-mono ${pnlColor}`}>PnL: {result.pnlPct >= 0 ? "+" : ""}{result.pnlPct.toFixed(2)}%</p>
                    )}
                  </div>
                </div>

                {/* Key reason */}
                {result.keyReason && (
                  <div className="bg-black/30 rounded-lg px-4 py-3">
                    <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">Key Reason</p>
                    <p className="text-sm text-zinc-200 leading-relaxed">{result.keyReason}</p>
                  </div>
                )}

                {/* Suggested action */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Suggested Action</p>
                    <p className={`text-xl font-black tracking-tight ${actionColor(result.suggestedAction)}`}>{result.suggestedAction}</p>
                  </div>
                  {result.keyLevel && (
                    <div className="text-right">
                      <p className="text-xs text-zinc-500 uppercase tracking-widest">Key Level</p>
                      <p className="text-lg font-bold text-yellow-400">${result.keyLevel.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Indicators */}
              {result.indicators.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Multi-Timeframe Indicators</p>
                  {result.indicators.map(ind => (
                    <IndicatorRow key={ind.tf} {...ind} />
                  ))}
                  <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-800">
                    {result.fundingRate && (
                      <div>
                        <p className="text-xs text-zinc-500">Funding Rate</p>
                        <p className={`text-xs font-mono font-bold ${result.fundingRate.startsWith("+") ? "text-red-400" : result.fundingRate.startsWith("-") ? "text-emerald-400" : "text-zinc-400"}`}>{result.fundingRate}</p>
                      </div>
                    )}
                    {result.oiChange && (
                      <div>
                        <p className="text-xs text-zinc-500">OI Change (8h)</p>
                        <p className={`text-xs font-mono font-bold ${parseFloat(result.oiChange) > 2 ? "text-emerald-400" : parseFloat(result.oiChange) < -2 ? "text-red-400" : "text-zinc-400"}`}>{result.oiChange}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Full analysis toggle */}
              {result.analysis && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowFullAnalysis(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> Full AI Analysis</span>
                    {showFullAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showFullAnalysis && (
                    <div className="px-4 pb-4 prose prose-invert prose-sm max-w-none text-zinc-300 text-xs leading-relaxed">
                      <Streamdown>{result.analysis}</Streamdown>
                    </div>
                  )}
                </div>
              )}

              {/* Disclaimer */}
              <div className="flex items-start gap-2 text-xs text-zinc-600 px-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>AI predictions are probabilistic, not guarantees. Always use proper risk management and never trade more than you can afford to lose.</span>
              </div>

              {/* Re-run */}
              <Button
                variant="outline"
                onClick={handlePredict}
                disabled={predictMutation.isPending}
                className="w-full border-zinc-700 text-zinc-400 hover:border-zinc-500 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-2" /> Re-run Analysis
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Prediction History ──────────────────────────────────────────── */}
      {predictionHistoryData && predictionHistoryData.length > 0 && (
        <div className="border-t border-zinc-800 px-6 py-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Prediction History
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearHistory.mutate()}
                className="h-6 text-[10px] border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/30"
              >
                Clear All
              </Button>
            </div>
            <div className="space-y-2">
              {predictionHistoryData.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5">
                  <div className={`w-2 h-2 rounded-full ${
                    item.verdict === "UP" ? "bg-emerald-500" : item.verdict === "DOWN" ? "bg-red-500" : "bg-zinc-500"
                  }`} />
                  <span className="text-xs font-bold text-white w-24 truncate">{item.symbol}</span>
                  <Badge className={`text-[9px] ${item.verdict === "UP" ? "bg-emerald-500/20 text-emerald-300" : item.verdict === "DOWN" ? "bg-red-500/20 text-red-300" : "bg-zinc-500/20 text-zinc-400"}`}>
                    {item.verdict}
                  </Badge>
                  <span className="text-[10px] text-zinc-500">{item.side?.toUpperCase()}</span>
                  <span className="text-[10px] text-zinc-500">{item.leverage}x</span>
                  <span className="text-[10px] text-zinc-400 font-mono">{item.probability}%</span>
                  <span className={`text-[10px] font-mono ml-auto ${
                    parseFloat(item.pnlPct || "0") >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {parseFloat(item.pnlPct || "0") >= 0 ? "+" : ""}{parseFloat(item.pnlPct || "0").toFixed(2)}%
                  </span>
                  <span className="text-[9px] text-zinc-600">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div></PageWrapper>
  );
}
