import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SignalCountdown } from "@/components/SignalCountdown";
import {
  Globe,
  Activity,
  Zap,
  ExternalLink,
  Copy,
  TrendingUp,
  Droplets,
  BarChart2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Wallet,
  Key,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  scanAllMarkets,
  formatVolume,
  EXCHANGE_COLORS,
  EXCHANGE_ICONS,
  MultiExchangeSignal,
  ScanFilter,
} from "@/lib/multiExchangeScanner";
import { trpc } from "@/lib/trpc";
import { useAccount } from "wagmi";
// import { SentimentCard } from "@/components/SentimentBadge"; // dormant — re-enable when needed

// ─── Exchange filter tabs ─────────────────────────────────────────────────────
const SCAN_FILTERS: { label: string; value: ScanFilter; icon: string }[] = [
  { label: "All Markets", value: "all", icon: "🌐" },
  { label: "CEX Only", value: "cex", icon: "🏦" },
  { label: "DeFi Only", value: "defi", icon: "⛓️" },
  { label: "Binance", value: "binance", icon: "🟡" },
  { label: "Bybit", value: "bybit", icon: "🟠" },
  { label: "OKX", value: "okx", icon: "🔵" },
  { label: "Hyperliquid", value: "hyperliquid", icon: "🟣" },
  { label: "dYdX", value: "dydx", icon: "🩷" },
  { label: "GMX", value: "gmx", icon: "🩵" },
  { label: "AsterDEX", value: "asterdex", icon: "⭐" },
];

// ─── Liquidity bar ────────────────────────────────────────────────────────────
function LiquidityBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{score}</span>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────
function SignalCard({
  signal,
  rank,
  onCopy,
  onRefresh,
  hasBinanceKey,
  hasBybitKey,
  hasOkxKey,
  hasHyperliquidKey,
}: {
  signal: MultiExchangeSignal;
  rank: number;
  onCopy: (s: MultiExchangeSignal) => void;
  onRefresh: () => void;
  hasBinanceKey: boolean;
  hasBybitKey: boolean;
  hasOkxKey: boolean;
  hasHyperliquidKey: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const { isConnected } = useAccount();

  const colorClass = EXCHANGE_COLORS[signal.exchange] || "text-gray-400 border-gray-400/30 bg-gray-400/10";
  const icon = EXCHANGE_ICONS[signal.exchange] || "⚪";
  const isLong = signal.direction === "LONG";

  // ── tRPC mutations ──────────────────────────────────────────────────────────
  const binancePlaceOrder = trpc.binance.placeOrder.useMutation();
  const bybitPlaceOrder = trpc.bybit.placeOrder.useMutation();
  const okxPlaceOrder = trpc.okx.placeOrder.useMutation();
  const hlPlaceOrder = trpc.hyperliquid.placeOrder.useMutation();

  // ── Execution helpers ───────────────────────────────────────────────────────
  const DEFAULT_QTY = "0.01"; // sensible minimum; user can adjust on exchange

  const executeBinance = useCallback(async () => {
    setIsExecuting(true);
    try {
      const result = await binancePlaceOrder.mutateAsync({
        symbol: signal.symbol,
        side: isLong ? "BUY" : "SELL",
        quantity: parseFloat(DEFAULT_QTY),
        leverage: 5,
      });
      if (result.success) {
        toast.success(`Binance order placed for ${signal.symbol}`);
      } else {
        toast.error(`Binance order failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Binance order failed");
    } finally {
      setIsExecuting(false);
    }
  }, [binancePlaceOrder, signal.symbol, isLong]);

  const executeBybit = useCallback(async () => {
    setIsExecuting(true);
    try {
      const result = await bybitPlaceOrder.mutateAsync({
        symbol: signal.symbol,
        side: isLong ? "Buy" : "Sell",
        qty: DEFAULT_QTY,
        leverage: 5,
      });
      if (result.success) {
        toast.success(`Bybit order placed for ${signal.symbol}`);
      } else {
        toast.error(`Bybit order failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Bybit order failed");
    } finally {
      setIsExecuting(false);
    }
  }, [bybitPlaceOrder, signal.symbol, isLong]);

  const executeOkx = useCallback(async () => {
    setIsExecuting(true);
    try {
      const result = await okxPlaceOrder.mutateAsync({
        symbol: signal.symbol,
        side: isLong ? "buy" : "sell",
        sz: DEFAULT_QTY,
        leverage: 5,
      });
      if (result.success) {
        toast.success(`OKX order placed for ${signal.symbol}`);
      } else {
        toast.error(`OKX order failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "OKX order failed");
    } finally {
      setIsExecuting(false);
    }
  }, [okxPlaceOrder, signal.symbol, isLong]);

  // ── Hyperliquid 1-click execution ─────────────────────────────────────────
  const executeHyperliquid = useCallback(async () => {
    setIsExecuting(true);
    try {
      // Hyperliquid uses bare base symbol — strip all quote currencies (USDT, USDC, USD)
      const cleanSym = signal.symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "");
      const qty = parseFloat(DEFAULT_QTY);
      const result = await hlPlaceOrder.mutateAsync({
        symbol: cleanSym,
        isBuy: isLong,
        size: qty,
        price: signal.entryPrice,
        orderType: "market",
        reduceOnly: false,
        leverage: 5,
      });
      if (result.success) {
        toast.success(`Hyperliquid order placed for ${signal.symbol}`);
      } else {
        toast.error(`Hyperliquid order failed: ${(result as any).error ?? "Unknown error"}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Hyperliquid order failed");
    } finally {
      setIsExecuting(false);
    }
  }, [hlPlaceOrder, signal.symbol, signal.entryPrice, isLong]);

  // ── AsterDEX Web3 execution ─────────────────────────────────────────────────
  const openAsterDex = useCallback(() => {
    const cleanSymbol = signal.symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "");
    const side = isLong ? "long" : "short";
    // AsterDEX trading UI — correct URL pattern confirmed from live site
    const url = `https://www.asterdex.com/en/trade/pro/futures/${cleanSymbol}USDT`;
    window.open(url, "_blank");
  }, [signal.symbol, isLong]);

  // ── Hyperliquid / generic DeFi ──────────────────────────────────────────────
  const openDex = useCallback(() => {
    if (signal.tradeUrl) {
      window.open(signal.tradeUrl, "_blank");
    }
  }, [signal.tradeUrl]);

  // ── Determine which execution buttons to show ───────────────────────────────
  const exchange = signal.exchange;
  const isBinance = exchange === "binance";
  const isBybit = exchange === "bybit";
  const isOkx = exchange === "okx";
  const isAsterDex = exchange === "asterdex";
  const isHyperliquid = exchange === "hyperliquid";
  const isDydx = exchange === "dydx";
  const isGmx = exchange === "gmx";
  const isGenericDeFi = signal.isDeFi && !isAsterDex && !isHyperliquid;

  return (
    <div
      className={`border rounded-lg p-3 transition-all ${
        rank === 1 ? "border-primary/60 bg-primary/5" : "border-border/40 bg-black/20"
      }`}
    >
      {/* Top Row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {rank === 1 && (
            <span className="text-[9px] font-bold font-mono bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded uppercase">
              #1 BEST
            </span>
          )}
          <span className="font-bold tracking-tight text-sm text-white">{signal.symbol}</span>
          <span
            className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
              isLong
                ? "text-green-400 border-green-400/30 bg-green-400/10"
                : "text-red-400 border-red-400/30 bg-red-400/10"
            }`}
          >
            {isLong ? "▲ LONG" : "▼ SHORT"}
          </span>
        </div>
        <div className="text-right">
          <span className="font-bold tracking-tight text-primary text-sm">{signal.confidence}%</span>
          <p className="text-[9px] text-muted-foreground">confidence</p>
        </div>
      </div>

      {/* Exchange Badge + Sentiment */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${colorClass}`}>
            {icon} {signal.exchangeLabel}
          </span>
          {signal.isDeFi && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
              ⛓️ DeFi
            </span>
          )}
        </div>
        {/* AI Sentiment Indicator — dormant, re-enable when needed */}
      </div>

      {/* Price Levels */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[
          { label: "ENTRY", value: signal.entryPrice, color: "text-white" },
          { label: "TARGET", value: signal.takeProfit, color: "text-green-400" },
          { label: "STOP", value: signal.stopLoss, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-black/40 p-1.5 rounded text-center">
            <p className="text-[9px] text-muted-foreground">{label}</p>
            <p className={`font-mono text-xs font-bold ${color}`}>
              {value < 1 ? value.toFixed(6) : value < 100 ? value.toFixed(4) : value.toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-1.5 mb-2 text-[10px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <BarChart2 className="w-3 h-3" />
          <span>Vol: {formatVolume(signal.volume24h)}</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-muted-foreground" />
          <span className={signal.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}>
            {signal.priceChange24h >= 0 ? "+" : ""}{signal.priceChange24h.toFixed(2)}% 24h
          </span>
        </div>
        {signal.fundingRate !== undefined && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Activity className="w-3 h-3" />
            <span className={Math.abs(signal.fundingRate) > 0.05 ? "text-orange-400" : "text-muted-foreground"}>
              FR: {signal.fundingRate.toFixed(4)}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>R/R: {signal.riskReward}</span>
        </div>
      </div>

      {/* Liquidity Bar */}
      <div className="mb-2">
        <div className="flex items-center gap-1 mb-1">
          <Droplets className="w-3 h-3 text-blue-400" />
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Liquidity</span>
        </div>
        <LiquidityBar score={signal.liquidityScore} />
      </div>

      {/* Expandable Reasoning */}
      <button
        className="w-full text-left text-[10px] text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors mb-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide" : "Show"} signal reasoning
      </button>

      {expanded && (
        <div className="bg-primary/5 border border-primary/20 p-2 rounded text-[10px] text-muted-foreground mb-2 leading-relaxed">
          {signal.reasoning}
        </div>
      )}

      {/* Countdown Timer */}
      <div className="mb-2">
        <SignalCountdown
          symbol={signal.symbol}
          direction={signal.direction}
          createdAt={signal.createdAt}
          volatility={signal.volatility}
          volume24h={signal.volume24h}
          confidence={signal.confidence}
          onRefresh={onRefresh}
          compact={false}
        />
      </div>

      {/* ── Action Buttons ──────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {/* Copy button — always shown */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-[10px] border-border/50 hover:bg-white/5"
          onClick={() => onCopy(signal)}
        >
          <Copy className="w-3 h-3 mr-1" />
          COPY SIGNAL
        </Button>

        {/* ── CEX one-click execution ─────────────────────────────────────── */}
        {isBinance && (
          hasBinanceKey ? (
            <Button
              size="sm"
              className={`w-full h-7 text-[10px] ${
                isLong
                  ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                  : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
              }`}
              onClick={executeBinance}
              disabled={isExecuting}
            >
              {isExecuting ? <Activity className="w-3 h-3 mr-1 animate-pulse" /> : <Zap className="w-3 h-3 mr-1" />}
              {isExecuting ? "EXECUTING..." : `1-CLICK ${signal.direction} · BINANCE`}
            </Button>
          ) : (
            <Link href="/binance-setup">
              <Button size="sm" variant="outline" className="w-full h-7 text-[10px] border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10">
                <Key className="w-3 h-3 mr-1" />
                SETUP BINANCE API
              </Button>
            </Link>
          )
        )}

        {isBybit && (
          hasBybitKey ? (
            <Button
              size="sm"
              className={`w-full h-7 text-[10px] ${
                isLong
                  ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                  : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
              }`}
              onClick={executeBybit}
              disabled={isExecuting}
            >
              {isExecuting ? <Activity className="w-3 h-3 mr-1 animate-pulse" /> : <Zap className="w-3 h-3 mr-1" />}
              {isExecuting ? "EXECUTING..." : `1-CLICK ${signal.direction} · BYBIT`}
            </Button>
          ) : (
            <Link href="/binance-setup">
              <Button size="sm" variant="outline" className="w-full h-7 text-[10px] border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
                <Key className="w-3 h-3 mr-1" />
                SETUP BYBIT API
              </Button>
            </Link>
          )
        )}

        {isOkx && (
          hasOkxKey ? (
            <Button
              size="sm"
              className={`w-full h-7 text-[10px] ${
                isLong
                  ? "bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30"
                  : "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
              }`}
              onClick={executeOkx}
              disabled={isExecuting}
            >
              {isExecuting ? <Activity className="w-3 h-3 mr-1 animate-pulse" /> : <Zap className="w-3 h-3 mr-1" />}
              {isExecuting ? "EXECUTING..." : `1-CLICK ${signal.direction} · OKX`}
            </Button>
          ) : (
            <Link href="/binance-setup">
              <Button size="sm" variant="outline" className="w-full h-7 text-[10px] border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                <Key className="w-3 h-3 mr-1" />
                SETUP OKX API
              </Button>
            </Link>
          )
        )}

        {/* ── AsterDEX Web3 execution ─────────────────────────────────────── */}
        {isAsterDex && (
          <Button
            size="sm"
            className={`w-full h-7 text-[10px] ${
              isConnected
                ? "bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300 border border-yellow-500/30"
                : "bg-secondary/30 text-muted-foreground border border-border/40"
            }`}
            onClick={openAsterDex}
          >
            <Wallet className="w-3 h-3 mr-1" />
            {isConnected ? `TRADE ${signal.direction} · ASTERDEX` : "CONNECT WALLET → ASTERDEX"}
            <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
          </Button>
        )}

        {/* ── Hyperliquid execution ──────────────────────────────────────── */}
        {isHyperliquid && (
          hasHyperliquidKey ? (
            <Button
              size="sm"
              className={`w-full h-7 text-[10px] ${
                isLong
                  ? "bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30"
                  : "bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 border border-pink-500/30"
              }`}
              onClick={executeHyperliquid}
              disabled={isExecuting}
            >
              {isExecuting ? <Activity className="w-3 h-3 mr-1 animate-pulse" /> : <Zap className="w-3 h-3 mr-1" />}
              {isExecuting ? "EXECUTING..." : `1-CLICK ${signal.direction} · HYPERLIQUID`}
            </Button>
          ) : (
            <Link href="/binance-setup">
              <Button size="sm" variant="outline" className="w-full h-7 text-[10px] border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                <Key className="w-3 h-3 mr-1" />
                SETUP HYPERLIQUID KEY
              </Button>
            </Link>
          )
        )}

        {/* ── dYdX / GMX / generic DeFi ──────────────────────────────────── */}
        {(isDydx || isGmx || isGenericDeFi) && signal.tradeUrl && (
          <Button
            size="sm"
            className="w-full h-7 text-[10px] bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30"
            onClick={openDex}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            TRADE ON {signal.exchangeLabel.toUpperCase()}
          </Button>
        )}

        {/* ── Quick Predict shortcut ──────────────────────────────── */}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-[10px] border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
          onClick={() => {
            const params = new URLSearchParams({
              symbol: signal.symbol,
              direction: signal.direction,
              entry: String(signal.entryPrice),
            });
            window.location.href = `/predict?${params.toString()}`;
          }}
        >
          <Brain className="w-3 h-3 mr-1" />
          QUICK PREDICT
        </Button>
      </div>
    </div>
  );
}

// ─── Main Scanner Component ───────────────────────────────────────────────────
export default function MultiExchangeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [signals, setSignals] = useState<MultiExchangeSignal[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<ScanFilter>("all");
  const [statusMessage, setStatusMessage] = useState("");
  const [scanComplete, setScanComplete] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const saveSignalMutation = trpc.signals.save.useMutation();

  // Pre-fetch API key status for all exchanges
  const { data: binanceKeyData } = trpc.binance.hasApiKey.useQuery();
  const { data: bybitKeyData } = trpc.bybit.hasApiKey.useQuery();
  const { data: okxKeyData } = trpc.okx.hasApiKey.useQuery();
  const { data: hlKeyData } = trpc.hyperliquid.hasKey.useQuery();

  const hasBinanceKey = binanceKeyData?.hasKey ?? false;
  const hasBybitKey = bybitKeyData?.hasKey ?? false;
  const hasOkxKey = okxKeyData?.hasKey ?? false;
  const hasHyperliquidKey = hlKeyData?.hasKey ?? false;

  const handleCopy = useCallback((signal: MultiExchangeSignal) => {
    const text = `
=== XRYPT MULTI-EXCHANGE SIGNAL ===
EXCHANGE: ${signal.exchangeLabel}
PAIR: ${signal.symbol}
DIRECTION: ${signal.direction}
ENTRY: ${signal.entryPrice}
TARGET: ${signal.takeProfit}
STOP: ${signal.stopLoss}
RISK/REWARD: ${signal.riskReward}
CONFIDENCE: ${signal.confidence}%
LIQUIDITY SCORE: ${signal.liquidityScore}/100
VOLUME 24H: ${formatVolume(signal.volume24h)}
${signal.fundingRate !== undefined ? `FUNDING RATE: ${signal.fundingRate.toFixed(4)}%` : ""}
REASONING: ${signal.reasoning}
TRADE URL: ${signal.tradeUrl ?? "N/A"}
===================================
`.trim();
    navigator.clipboard.writeText(text);
    setCopiedId(`${signal.symbol}-${signal.exchange}`);
    toast.success(`${signal.symbol} trade copied to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    setSignals([]);
    setScanComplete(false);
    setShowAll(false);

    const filterLabel = SCAN_FILTERS.find((f) => f.value === selectedFilter)?.label ?? "All Markets";

    try {
      setStatusMessage(`Connecting to ${filterLabel}...`);
      await new Promise((r) => setTimeout(r, 300));

      setStatusMessage("Fetching live order books & funding rates...");
      const results = await scanAllMarkets(selectedFilter);

      setStatusMessage("Scoring liquidity, momentum & arbitrage opportunities...");
      await new Promise((r) => setTimeout(r, 400));

      setSignals(results);
      setScanComplete(true);

      if (results.length === 0) {
        toast.warning("No signals found for selected markets. Try a broader filter.");
      } else {
        toast.success(`Found ${results.length} opportunities across ${filterLabel}`);

        // Auto-save top signal if confidence ≥ 80
        const top = results[0];
        if (top && top.confidence >= 80) {
          try {
            await saveSignalMutation.mutateAsync({
              symbol: top.symbol,
              direction: top.direction,
              strategy: `Multi-Exchange (${top.exchangeLabel})`,
              entryPrice: top.entryPrice.toString(),
              stopLoss: top.stopLoss.toString(),
              takeProfit: top.takeProfit.toString(),
              confidence: top.confidence,
              riskRewardRatio: top.riskReward,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              metadata: JSON.stringify({
                exchange: top.exchange,
                liquidityScore: top.liquidityScore,
                fundingRate: top.fundingRate,
                volume24h: top.volume24h,
                openInterest: top.openInterest,
                isDeFi: top.isDeFi,
                compositeScore: top.compositeScore,
              }),
            });
          } catch {
            // Non-blocking
          }
        }
      }
    } catch (err) {
      console.error("Multi-exchange scan failed:", err);
      toast.error("Scan failed. Check network connection.");
    } finally {
      setIsScanning(false);
      setStatusMessage("");
    }
  }, [selectedFilter, saveSignalMutation]);

  const displayedSignals = showAll ? signals : signals.slice(0, 3);

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-purple-600" />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div>
            <h2 className="font-bold tracking-tight text-xl flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              MULTI-EXCHANGE FUTURES SCANNER
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">PERP ONLY</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Perpetual futures across Binance · Bybit · OKX · Hyperliquid · dYdX · GMX · AsterDEX
            </p>
          </div>
        </div>
        {scanComplete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={runScan}
            disabled={isScanning}
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {/* API Key Status Bar */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { label: "Binance", has: hasBinanceKey, color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
          { label: "Bybit", has: hasBybitKey, color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
          { label: "OKX", has: hasOkxKey, color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
        ].map(({ label, has, color }) => (
          <span key={label} className={`text-[9px] font-mono px-2 py-0.5 rounded border ${has ? color : "text-muted-foreground/40 border-border/20 bg-transparent"}`}>
            {has ? "✓" : "○"} {label}
          </span>
        ))}
        {!hasBinanceKey && !hasBybitKey && !hasOkxKey && (
          <Link href="/binance-setup">
            <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-primary/30 text-primary/70 bg-primary/5 cursor-pointer hover:bg-primary/10">
              + Setup API keys for 1-click trading
            </span>
          </Link>
        )}
      </div>

      {/* Exchange Filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {SCAN_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setSelectedFilter(f.value)}
            className={`text-[10px] font-mono px-2 py-1 rounded border transition-all ${
              selectedFilter === f.value
                ? "border-primary/60 bg-primary/20 text-primary"
                : "border-border/40 bg-black/20 text-muted-foreground hover:border-primary/30 hover:text-primary/80"
            }`}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Scan Button */}
      <Button
        onClick={runScan}
        disabled={isScanning}
        className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-bold h-11 mb-4 relative overflow-hidden"
      >
        {isScanning ? (
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 animate-spin" />
            {statusMessage || "SCANNING ALL MARKETS..."}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 fill-current" />
            DEEP SCAN ALL MARKETS
          </div>
        )}
      </Button>

      {/* Loading Skeleton */}
      {isScanning && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded-lg animate-pulse border border-border/20" />
          ))}
        </div>
      )}

      {/* Results */}
      {!isScanning && signals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-mono">{signals.length} opportunities found</span>
            <span className="text-[10px] text-primary font-mono">Ranked by composite score</span>
          </div>

          {displayedSignals.map((signal, i) => (
            <SignalCard
              key={`${signal.symbol}-${signal.exchange}`}
              signal={signal}
              rank={i + 1}
              onCopy={handleCopy}
              onRefresh={runScan}
              hasBinanceKey={hasBinanceKey}
              hasBybitKey={hasBybitKey}
              hasOkxKey={hasOkxKey}
              hasHyperliquidKey={hasHyperliquidKey}
            />
          ))}

          {signals.length > 3 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-border/40 hover:bg-white/5 text-muted-foreground"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? (
                <><ChevronUp className="w-3 h-3 mr-2" />SHOW LESS</>
              ) : (
                <><ChevronDown className="w-3 h-3 mr-2" />SHOW ALL {signals.length} SIGNALS</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isScanning && !scanComplete && (
        <div className="text-center py-8 text-muted-foreground">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            Select markets and click Deep Scan to find the best trade across all exchanges.
          </p>
          <p className="text-xs mt-1 opacity-60 font-mono">
            Analyzes liquidity · funding rates · momentum · OI
          </p>
        </div>
      )}
    </div>
  );
}
