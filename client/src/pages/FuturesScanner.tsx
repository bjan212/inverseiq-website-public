import { useState, useEffect, useRef, useCallback } from "react";
import PageWrapper from "@/components/PageWrapper";
import { trpc } from "@/lib/trpc";
import { useTrades } from "@/contexts/TradeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Streamdown } from "streamdown";
import {
  TrendingUp, TrendingDown, Search, X, RefreshCw, AlertTriangle,
  Brain, Activity, ChevronDown, ChevronUp, Clock, Target, ShieldAlert,
  Zap, BarChart2, CheckCircle2, Info,
} from "lucide-react";
import { toast } from "sonner";
import PreExecutionModal, { PreExecutionConfig, OrderSubmitPayload } from "@/components/PreExecutionModal";
// import { SentimentBadge } from "@/components/SentimentBadge"; // dormant — re-enable when needed

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction   = "LONG" | "SHORT";
type Confidence  = "HIGH" | "MEDIUM" | "LOW";

interface ScanResult {
  success: boolean;
  symbol: string;
  currentPrice: number;
  direction: Direction;
  confidence: Confidence;
  isBadEntry: boolean;
  badEntryReason: string | null;
  isFiltered?: boolean;
  filterReason?: string;
  entry: number | null;
  tp1: number | null;
  tp2: number | null;
  sl: number | null;
  rrTp1: string | null;
  rrTp2: string | null;
  validity: string | null;
  validitySeconds?: number;
  keyReason: string;
  analysis: string;
  indicators: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }[];
  fundingRate: string;
  oiChange: string;
  atr: number;
  error?: string;
  // bestCoinNow extras
  runnerUps?: { symbol: string; direction: Direction; score: number; rsi1h: number }[];
  top20Scanned?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PINNED = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","SUIUSDT","PEPEUSDT"];

const confidenceBadge = (c: Confidence) =>
  c === "HIGH"   ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
  c === "MEDIUM" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"   :
                   "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

const rsiColor = (rsi: number) =>
  rsi >= 70 ? "text-red-400" : rsi <= 30 ? "text-emerald-400" : "text-zinc-300";

// Parse validity string into seconds for countdown
function parseValiditySeconds(validity: string | null): number {
  if (!validity) return 4 * 3600;
  const h = validity.match(/(\d+(?:\.\d+)?)\s*h/i);
  const m = validity.match(/(\d+)\s*min/i);
  let secs = 0;
  if (h) secs += parseFloat(h[1]) * 3600;
  if (m) secs += parseInt(m[1]) * 60;
  // Handle ranges like "2-4 hours" — take midpoint
  const range = validity.match(/(\d+)\s*[-–]\s*(\d+)\s*h/i);
  if (range) secs = ((parseInt(range[1]) + parseInt(range[2])) / 2) * 3600;
  return secs > 0 ? secs : 4 * 3600;
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return "EXPIRED";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2,"0")}m`;
  return `${m.toString().padStart(2,"0")}m ${s.toString().padStart(2,"0")}s`;
}

// ─── Indicator row ────────────────────────────────────────────────────────────
function IndicatorRow({ tf, rsi, macdBias, bbPos, volTrend }: { tf: string; rsi: number; macdBias: string; bbPos: number; volTrend: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-zinc-800/60 last:border-0">
      <span className="w-10 text-xs font-mono font-bold text-zinc-400">{tf}</span>
      <span className={`text-xs font-mono ${rsiColor(rsi)}`}>RSI {rsi}</span>
      <span className={`text-xs font-mono ${macdBias === "bullish" ? "text-emerald-400" : "text-red-400"}`}>MACD {macdBias === "bullish" ? "↑" : "↓"}</span>
      <span className="text-xs font-mono text-zinc-400">BB {bbPos}%</span>
      <span className={`text-xs font-mono ${volTrend === "rising" ? "text-emerald-400" : volTrend === "falling" ? "text-red-400" : "text-zinc-500"}`}>Vol {volTrend}</span>
    </div>
  );
}

// ─── Validity countdown ───────────────────────────────────────────────────────
function ValidityCountdown({ validity, validitySeconds, onExpired }: { validity: string | null; validitySeconds?: number; onExpired: () => void }) {
  // Prefer server-computed precise seconds; fall back to parsing the LLM string
  const total = useRef(validitySeconds ?? parseValiditySeconds(validity));
  const [remaining, setRemaining] = useState(total.current);
  const notified5m = useRef(false);

  useEffect(() => {
    total.current = parseValiditySeconds(validity);
    setRemaining(total.current);
    notified5m.current = false;
  }, [validity]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(r => {
        const next = r - 1;
        if (next === 300 && !notified5m.current) {
          notified5m.current = true;
          toast.warning("⏰ Signal expires in 5 minutes — act now or wait for a new scan");
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("XRYPT Signal Expiring", { body: `${validity} signal expires in 5 minutes` });
          }
        }
        if (next <= 0) {
          onExpired();
          toast.info("Signal expired — click Refresh to get a fresh scan");
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [validity, onExpired]);

  const pct = total.current > 0 ? Math.max(0, (remaining / total.current) * 100) : 0;
  const isExpired = remaining <= 0;
  const isCritical = pct < 20;
  const isWarning  = pct < 50 && !isCritical;

  const barColor = isExpired  ? "bg-zinc-600" :
                   isCritical ? "bg-red-500"   :
                   isWarning  ? "bg-yellow-500" :
                                "bg-emerald-500";
  const textColor = isExpired  ? "text-zinc-500" :
                    isCritical ? "text-red-400"   :
                    isWarning  ? "text-yellow-400" :
                                 "text-emerald-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className={`w-3.5 h-3.5 ${textColor}`} />
          <span className="text-xs text-zinc-500 uppercase tracking-widest">Signal Validity</span>
        </div>
        <span className={`text-xs font-mono font-bold ${textColor}`}>{formatCountdown(remaining)}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-zinc-600">
        {isExpired ? "This signal has expired." : isCritical ? "⚠ Critical — signal expiring soon" : isWarning ? "Signal validity reducing" : "Signal is active"}
      </p>
    </div>
  );
}

// ─── Level row ────────────────────────────────────────────────────────────────
function LevelRow({ label, price, color, rr }: { label: string; price: number | null; color: string; rr?: string | null }) {
  if (!price) return null;
  const bgTint = color.includes("emerald") ? "bg-emerald-500/5 border-l-2 border-emerald-500/40"
    : color.includes("red") ? "bg-red-500/5 border-l-2 border-red-500/40"
    : "bg-cyan-500/5 border-l-2 border-cyan-500/40";
  return (
    <div className={`flex items-center justify-between px-2 py-2 rounded-md mb-1 last:mb-0 ${bgTint}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold uppercase tracking-widest w-10 ${color}`}>{label}</span>
        {rr && <span className="text-xs text-zinc-500 font-mono">R:R {rr}</span>}
      </div>
      <span className={`text-sm font-mono font-bold ${color}`}>${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FuturesScanner() {
  const { symbolPatterns } = useTrades();

  const [query, setQuery]         = useState("");
  const [selected, setSelected]   = useState("BTCUSDT");
  const [showDropdown, setShowDropdown] = useState(false);
  const [result, setResult]       = useState<ScanResult | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Static symbol list — universe is fetched server-side during scan
  const allSymbols = PINNED;

  const filtered = query.trim()
    ? allSymbols.filter((s: string) => s.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : PINNED;

  const scanMutation    = trpc.scanner.scanCoin.useMutation();
  const bestMutation    = trpc.scanner.bestCoinNow.useMutation();
  const saveScanMutation = trpc.scanHistory.save.useMutation();

  // Bad entry filter preference — local state synced from settings, toggleable inline
  const { data: userSettingsData } = trpc.userSettings.get.useQuery(undefined, { staleTime: 60_000 });
  const [badEntryFilter, setBadEntryFilter] = useState<"hide" | "deprioritize" | "show">("deprioritize");
  const saveBadEntryFilterMutation = trpc.userSettings.save.useMutation();
  useEffect(() => {
    if ((userSettingsData as any)?.badEntryFilter) {
      setBadEntryFilter((userSettingsData as any).badEntryFilter);
    }
  }, [userSettingsData]);
  const cycleBadEntryFilter = () => {
    const modes: Array<"hide" | "deprioritize" | "show"> = ["hide", "deprioritize", "show"];
    const next = modes[(modes.indexOf(badEntryFilter) + 1) % 3];
    setBadEntryFilter(next);
    saveBadEntryFilterMutation.mutate({ badEntryFilter: next });
    toast.info(`Bad entry filter: ${next === "hide" ? "Hide" : next === "deprioritize" ? "Deprioritize" : "Show All"}`);
  };

  // Pre-execution modal state
  const [preExecOpen, setPreExecOpen]     = useState(false);
  const [preExecConfig, setPreExecConfig] = useState<PreExecutionConfig | null>(null);
  const [isExecuting, setIsExecuting]     = useState(false);

  // API key availability
  const { data: binanceKeyData }  = trpc.binance.hasApiKey.useQuery();
  const { data: bybitKeyData }    = trpc.bybit.hasApiKey.useQuery();
  const { data: okxKeyData }      = trpc.okx.hasApiKey.useQuery();
  const { data: hlKeyData }       = trpc.hyperliquid.hasKey.useQuery();
  const { data: asterdexKeyData } = trpc.asterdex.hasApiKey.useQuery();
  const hasBinanceKey  = binanceKeyData?.hasKey ?? false;
  const hasBybitKey    = bybitKeyData?.hasKey ?? false;
  const hasOkxKey      = okxKeyData?.hasKey ?? false;
  const hasHlKey       = hlKeyData?.hasKey ?? false;
  const hasAsterdexKey = asterdexKeyData?.hasKey ?? false;

  // Order placement mutations
  const binancePlaceOrder = trpc.binance.placeOrder.useMutation();
  const bybitPlaceOrder   = trpc.bybit.placeOrder.useMutation();
  const okxPlaceOrder     = trpc.okx.placeOrder.useMutation();
  const hlPlaceOrder      = trpc.hyperliquid.placeOrder.useMutation();
  const asterdexPlaceOrder = trpc.asterdex.placeOrder.useMutation();

  const openPreExec = (r: ScanResult) => {
    const winRate = symbolPatterns.find(p => p.symbol === r.symbol)?.winRate;
    setPreExecConfig({
      symbol:     r.symbol,
      direction:  r.direction,
      entryPrice: r.entry ?? r.currentPrice,
      tp1:        r.tp1,
      tp2:        r.tp2,
      sl:         r.sl,
      rrTp1:      r.rrTp1,
      confidence: r.confidence,
      winRate,
    });
    setPreExecOpen(true);
  };

  const handleOrderSubmit = async (payload: OrderSubmitPayload) => {
    setIsExecuting(true);
    try {
      const isLimit = payload.orderType === "limit";
      const orderTypeLabel = isLimit ? "LIMIT" : "MARKET";

      if (payload.exchange === "binance") {
        const res = await binancePlaceOrder.mutateAsync({
          symbol: payload.symbol,
          side: payload.side,
          quantity: payload.quantity,
          leverage: payload.leverage,
          orderType: isLimit ? "LIMIT" : "MARKET",
          price: isLimit ? payload.limitPrice : undefined,
          takeProfit: payload.takeProfit,
          stopLoss: payload.stopLoss,
        });
        if (res.success) {
          if (res.protection?.status === "failed") toast.warning(`⚠️ Binance entry placed, but TP/SL protection failed: ${res.protection.error ?? "verify on exchange"}`);
          else toast.success(`⚡ ${orderTypeLabel} ${payload.side} ${payload.symbol} placed on Binance${res.protection?.status === "active" ? " · TP/SL active" : ""}`);
        }
        else toast.error(`Binance order failed: ${res.error}`);
      } else if (payload.exchange === "bybit") {
        const bybitSide = payload.side === "BUY" ? "Buy" : "Sell" as "Buy" | "Sell";
        const res = await bybitPlaceOrder.mutateAsync({
          symbol: payload.symbol,
          side: bybitSide,
          qty: payload.quantity.toString(),
          leverage: payload.leverage,
          orderType: isLimit ? "Limit" : "Market",
          price: isLimit ? String(payload.limitPrice ?? "") : undefined,
          takeProfit: payload.takeProfit,
          stopLoss: payload.stopLoss,
        });
        if (res.success) {
          if (res.protection?.status === "failed") toast.warning(`⚠️ Bybit entry placed, but TP/SL protection failed: ${res.protection.error ?? "verify on exchange"}`);
          else toast.success(`⚡ ${orderTypeLabel} ${payload.side} ${payload.symbol} placed on Bybit${res.protection?.status === "active" ? " · TP/SL active" : ""}`);
        }
        else toast.error(`Bybit order failed: ${(res as any).error ?? "Unknown error"}`);
      } else if (payload.exchange === "okx") {
        const okxSide = payload.side === "BUY" ? "buy" : "sell" as "buy" | "sell";
        const res = await okxPlaceOrder.mutateAsync({
          symbol: payload.symbol,
          side: okxSide,
          sz: payload.quantity.toString(),
          leverage: payload.leverage,
          ordType: isLimit ? "limit" : "market",
          px: isLimit ? String(payload.limitPrice ?? "") : undefined,
          takeProfit: payload.takeProfit,
          stopLoss: payload.stopLoss,
        });
        if (res.success) {
          if (res.protection?.status === "failed") toast.warning(`⚠️ OKX entry placed, but TP/SL protection failed: ${res.protection.error ?? "verify on exchange"}`);
          else toast.success(`⚡ ${orderTypeLabel} ${payload.side} ${payload.symbol} placed on OKX${res.protection?.status === "active" ? " · TP/SL active" : ""}`);
        }
        else toast.error(`OKX order failed: ${(res as any).error ?? "Unknown error"}`);
      } else if (payload.exchange === "hyperliquid") {
        // Hyperliquid uses bare base symbol (e.g. "BTC", "MU") — strip all quote currencies
        const hlSymbol = payload.symbol.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "");
        const res = await hlPlaceOrder.mutateAsync({
          symbol: hlSymbol,
          isBuy: payload.side === "BUY",
          size: payload.quantity,
          price: isLimit ? (payload.limitPrice ?? payload.entryPrice) : payload.entryPrice,
          orderType: isLimit ? "limit" : "market",
          reduceOnly: false,
          leverage: payload.leverage,
          takeProfit: payload.takeProfit,
          stopLoss: payload.stopLoss,
        });
        const tpSlMsg = (res as any).tpSlResults
          ? ` | TP: ${(res as any).tpSlResults.tp ?? "—"} | SL: ${(res as any).tpSlResults.sl ?? "—"}`
          : "";
        if (res.success) toast.success(`⚡ ${orderTypeLabel} ${payload.side} ${payload.symbol} placed on Hyperliquid${tpSlMsg}`);
        else toast.error(`Hyperliquid order failed: ${(res as any).error ?? "Unknown error"}`);
      } else if (payload.exchange === "asterdex") {
        const res = await asterdexPlaceOrder.mutateAsync({
          symbol: payload.symbol,
          side: payload.side,
          quantity: payload.quantity,
          leverage: payload.leverage,
          orderType: isLimit ? "LIMIT" : "MARKET",
          price: isLimit ? payload.limitPrice : undefined,
        });
        if (res.success) toast.success(`⚡ ${orderTypeLabel} ${payload.side} ${payload.symbol} placed on AsterDEX`);
        else toast.error(`AsterDEX order failed: ${(res as any).error ?? "Unknown error"}`);
      }
      setPreExecOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Order placement failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const [bestResult, setBestResult]       = useState<ScanResult | null>(null);
  const [bestExpired, setBestExpired]     = useState(false);
  const [showBestAnalysis, setShowBestAnalysis] = useState(false);
  const [showBestPanel, setShowBestPanel] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buildPatternContext = (sym: string) => {
    const clean = sym.replace("/","").replace("-PERP","").replace(":USDT","").toUpperCase();
    const pat = symbolPatterns.find(p => p.symbol === clean);
    if (!pat) return undefined;
    return `${pat.tradeCount} trades on ${clean}: ${pat.winRate}% win rate, avg PnL $${pat.avgPnl.toFixed(2)}, dominant side ${pat.dominantSide}, bias ${pat.bias}. Recommendation: ${pat.action} (${pat.summary})`;
  };

  const buildPatternContextMap = () => {
    const map: Record<string, string> = {};
    symbolPatterns.forEach(p => {
      map[p.symbol] = `${p.tradeCount} trades on ${p.symbol}: ${p.winRate}% win rate, avg PnL $${p.avgPnl.toFixed(2)}, dominant side ${p.dominantSide}, bias ${p.bias}. Recommendation: ${p.action} (${p.summary})`;
    });
    return Object.keys(map).length > 0 ? map : undefined;
  };

  const handleBestCoin = useCallback(async () => {
    setBestResult(null);
    setBestExpired(false);
    setShowBestAnalysis(false);
    setShowBestPanel(true);
    try {
      const patternMap = buildPatternContextMap();
      const res = await bestMutation.mutateAsync({
        symbolPatternContextMap: patternMap,
        badEntryFilter: badEntryFilter ?? "deprioritize",
      });
      setBestResult(res as unknown as ScanResult);
      if (!res.success) toast.error((res as any).error ?? "Best coin scan failed");
      else if (res.isBadEntry) toast.warning("⚠ Best coin found but entry timing is poor — see details");
      else toast.success(`✦ Best coin: ${res.symbol} — ${res.direction}`);
      // Persist scan to history
      if (res.success && res.direction) {
        saveScanMutation.mutate({
          scanType: "best",
          symbol: res.symbol,
          direction: res.direction as "LONG" | "SHORT",
          confidence: res.confidence,
          entryPrice: res.entry?.toString(),
          tp1: res.tp1?.toString(),
          tp2: res.tp2?.toString(),
          sl: res.sl?.toString(),
          riskReward: res.rrTp1 ?? undefined,
          isBadEntry: res.isBadEntry,
          currentPrice: res.currentPrice?.toString(),
          analysis: res.analysis,
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Best coin scan failed");
    }
  }, [symbolPatterns, bestMutation, saveScanMutation]);

  const handleScan = useCallback(async (sym?: string) => {
    const target = sym ?? selected;
    if (!target) { toast.error("Select a coin first"); return; }
    setResult(null);
    setIsExpired(false);
    setShowAnalysis(false);
    try {
      const res = await scanMutation.mutateAsync({
        symbol: target,
        symbolPatternContext: buildPatternContext(target),
        badEntryFilter: badEntryFilter ?? "deprioritize",
      });
      setResult(res as unknown as ScanResult);
      if (!res.success) toast.error((res as any).error ?? "Scan failed");
      else if (res.isBadEntry) toast.warning("⚠ Not an ideal entry — see details below");
      // Persist scan to history
      if (res.success && res.direction) {
        saveScanMutation.mutate({
          scanType: "single",
          symbol: res.symbol,
          direction: res.direction as "LONG" | "SHORT",
          confidence: res.confidence,
          entryPrice: res.entry?.toString(),
          tp1: res.tp1?.toString(),
          tp2: res.tp2?.toString(),
          sl: res.sl?.toString(),
          riskReward: res.rrTp1 ?? undefined,
          isBadEntry: res.isBadEntry,
          currentPrice: res.currentPrice?.toString(),
          analysis: res.analysis,
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Scan failed");
    }
  }, [selected, symbolPatterns, scanMutation, saveScanMutation]);

  const handleSelect = (sym: string) => {
    setSelected(sym);
    setQuery("");
    setShowDropdown(false);
    setResult(null);
    setIsExpired(false);
  };

  const isLoading    = scanMutation.isPending;
  const isBestLoading = bestMutation.isPending;
  const dir = result?.direction ?? "LONG";
  const dirColor = dir === "LONG" ? "text-emerald-400" : "text-red-400";
  const dirBg    = dir === "LONG" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30";

  return (
    <PageWrapper><div className="min-h-screen bg-black text-zinc-100 font-mono">

      {/* Header */}
      <div className="border-b border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <Target className="w-6 h-6 text-cyan-400" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">FUTURES SCANNER</h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">PERP ONLY</span>
            </div>
            <p className="text-xs text-zinc-500">Select any perpetual futures coin — AI predicts direction with entry, TP &amp; SL. <span className="text-cyan-600">Spot trades are not available here.</span></p>
          </div>
          {/* Quick-toggle: Bad Entry Filter */}
          <button
            onClick={cycleBadEntryFilter}
            title={`Bad Entry Filter: ${badEntryFilter === "hide" ? "Hide (skip bad entries)" : badEntryFilter === "deprioritize" ? "Deprioritize (show with warning)" : "Show All (no filter)"}. Click to cycle.`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors ${
              badEntryFilter === "hide"
                ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : badEntryFilter === "deprioritize"
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {badEntryFilter === "hide" ? "HIDE" : badEntryFilter === "deprioritize" ? "WARN" : "ALL"}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">

        {/* ── Left: Coin selector ──────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Search + dropdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Select Coin</h2>

            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
                <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                <input
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search any futures pair (e.g. SOLUSDT)..."
                  className="bg-transparent text-white text-sm flex-1 outline-none placeholder:text-zinc-600 font-mono"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setShowDropdown(false); }}>
                    <X className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                  </button>
                )}
              </div>

              {showDropdown && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  {filtered.map((sym: string) => (
                    <button
                      key={sym}
                      onClick={() => handleSelect(sym)}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors flex items-center justify-between ${sym === selected ? "text-cyan-400 bg-cyan-500/5" : "text-zinc-300"}`}
                    >
                      <span className="font-mono">{sym}</span>
                      {sym === selected && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pinned quick-select */}
            <div>
              <p className="text-xs text-zinc-600 mb-2 uppercase tracking-widest">Popular</p>
              <div className="flex flex-wrap gap-1.5">
                {PINNED.map((sym: string) => (
                  <button
                    key={sym}
                    onClick={() => handleSelect(sym)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors font-mono ${selected === sym ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}
                  >
                    {sym.replace("USDT", "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected display */}
            <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-widest">Selected</p>
                <p className="text-lg font-bold text-white font-mono">{selected}</p>
              </div>
              {symbolPatterns.find(p => p.symbol === selected) && (
                <Badge className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20">Personal history</Badge>
              )}
            </div>

            {/* Scan button */}
            <Button
              onClick={() => handleScan()}
              disabled={isLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-12 text-sm tracking-widest"
            >
              {isLoading ? (
                <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> SCANNING MARKET...</span>
              ) : (
                <span className="flex items-center gap-2"><Zap className="w-4 h-4 fill-current" /> SCAN {selected}</span>
              )}
            </Button>
          </div>

          {/* ── Best Coin Right Now ─────────────────────────────────────── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" /> Best Coin Right Now
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">Scans top 20 by volume — picks the highest-conviction setup</p>
              </div>
              {bestResult && (
                <Badge className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                  {bestResult.top20Scanned ?? 20} scanned
                </Badge>
              )}
            </div>
            <Button
              onClick={handleBestCoin}
              disabled={isBestLoading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold h-12 text-sm tracking-widest"
            >
              {isBestLoading ? (
                <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> SCANNING TOP 20...</span>
              ) : (
                <span className="flex items-center gap-2"><Zap className="w-4 h-4 fill-current" /> FIND BEST COIN NOW</span>
              )}
            </Button>

            {/* Runner-ups */}
            {bestResult?.runnerUps && bestResult.runnerUps.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-zinc-600 uppercase tracking-widest">Runner-ups</p>
                {bestResult.runnerUps.map((r, i) => (
                  <div key={r.symbol} className="flex items-center justify-between bg-zinc-800/40 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 font-mono">#{i+2}</span>
                      <button
                        onClick={() => { handleSelect(r.symbol); setShowBestPanel(false); }}
                        className="text-xs font-mono font-bold text-zinc-300 hover:text-cyan-400 transition-colors"
                      >
                        {r.symbol}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold ${r.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{r.direction}</span>
                      <span className="text-xs text-zinc-600">RSI {r.rsi1h}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">How It Works</p>
            <ul className="space-y-1.5 text-xs text-zinc-500">
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Fetches all active Binance Futures USDT perpetual pairs</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Analyses 15m, 1H, 4H, 1D indicators + ATR + funding rate + OI</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> AI picks LONG or SHORT with exact entry, TP1, TP2, and SL</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> If entry timing is poor, you are told to wait and try again</li>
              <li className="flex items-start gap-2"><span className="text-cyan-500 mt-0.5">→</span> Countdown timer shows how long the setup remains valid</li>
            </ul>
          </div>
        </div>

        {/* ── Best Coin Now Result (full-width, shown when best scan runs) ─────── */}
        {showBestPanel && (
          <div className="col-span-1 lg:col-span-2">
            <div className="border-t border-zinc-800 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4 fill-yellow-400" /> Best Coin Right Now
                  {bestResult && <span className="text-zinc-500 font-normal normal-case">— scanned {bestResult.top20Scanned ?? 20} coins by volume</span>}
                </h2>
                <button onClick={() => setShowBestPanel(false)} className="text-zinc-600 hover:text-zinc-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Loading skeleton */}
              {isBestLoading && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 animate-pulse">
                  <div className="h-5 bg-zinc-800 rounded w-1/4" />
                  <div className="h-20 bg-zinc-800 rounded" />
                  <div className="h-4 bg-zinc-800 rounded w-1/2" />
                  <div className="h-4 bg-zinc-800 rounded w-2/3" />
                </div>
              )}

              {/* Result */}
              {!isBestLoading && bestResult && !bestExpired && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Left: verdict + levels */}
                  <div className="space-y-4">

                    {/* Filtered (hidden) bad entry */}
                    {bestResult.isFiltered && (
                      <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-5 space-y-3 opacity-80">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-zinc-400 shrink-0" />
                          <p className="text-sm font-bold text-zinc-300 uppercase tracking-wide">Signal Filtered</p>
                        </div>
                        <p className="text-sm text-zinc-400">{bestResult.filterReason}</p>
                        {bestResult.runnerUps && bestResult.runnerUps.length > 0 && (
                          <div className="text-xs text-zinc-500 mt-2">
                            <span className="font-bold">Runner-ups: </span>
                            {bestResult.runnerUps.slice(0, 3).map(r => r.symbol).join(", ")}
                          </div>
                        )}
                        <Button onClick={handleBestCoin} className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold text-xs h-10">
                          <RefreshCw className="w-3.5 h-3.5 mr-2" /> RESCAN FOR BETTER ENTRY
                        </Button>
                      </div>
                    )}

                    {/* Bad entry (deprioritized — shown with warning) */}
                    {bestResult.isBadEntry && !bestResult.isFiltered && (
                      <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                          <p className="text-sm font-bold text-orange-300 uppercase tracking-wide">Not an Ideal Entry — {bestResult.symbol}</p>
                        </div>
                        {/* LLM bad-entry reason with visual indicator */}
                        {bestResult.badEntryReason && (
                          <div className="bg-orange-900/30 border border-orange-700/40 rounded-lg p-3 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">AI Reason for Flagging</span>
                            </div>
                            <p className="text-xs text-orange-200/90 leading-relaxed">{bestResult.badEntryReason}</p>
                          </div>
                        )}
                        <p className="text-[10px] text-orange-300/60 italic">Signal deprioritized — confidence reduced. Proceed with caution.</p>
                        <Button onClick={handleBestCoin} className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold text-xs h-10">
                          <RefreshCw className="w-3.5 h-3.5 mr-2" /> RESCAN TOP 20
                        </Button>
                      </div>
                    )}

                    {/* Verdict */}
                    {!bestResult.isBadEntry && !bestResult.isFiltered && (() => {
                      const bDir = bestResult.direction;
                      const bColor = bDir === "LONG" ? "text-emerald-400" : "text-red-400";
                      const bBg    = bDir === "LONG" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30";
                      return (
                        <div className={`border rounded-xl p-5 space-y-4 ${bBg}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Best Trade — {bestResult.symbol}</p>
                              <div className="flex items-center gap-3">
                                {bDir === "LONG" ? <TrendingUp className="w-9 h-9 text-emerald-400" /> : <TrendingDown className="w-9 h-9 text-red-400" />}
                                <span className={`text-4xl font-black tracking-tight ${bColor}`}>{bDir}</span>
                              </div>
                            </div>
                            <div className="text-right space-y-1.5">
                              <Badge className={`text-xs border ${confidenceBadge(bestResult.confidence)}`}>{bestResult.confidence} CONFIDENCE</Badge>
                              <p className="text-xs text-zinc-500">Live: ${bestResult.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
                            </div>
                          </div>
                          {bestResult.keyReason && (
                            <div className="bg-black/30 rounded-lg px-4 py-3">
                              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Why This Coin</p>
                              <p className="text-sm text-zinc-200 leading-relaxed">{bestResult.keyReason}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Levels */}
                    {!bestResult.isBadEntry && (bestResult.entry || bestResult.tp1 || bestResult.sl) && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Target className="w-3.5 h-3.5" /> Trade Levels</p>
                        <LevelRow label="Entry" price={bestResult.entry} color="text-cyan-400" />
                        <LevelRow label="TP1"   price={bestResult.tp1}   color="text-emerald-400" rr={bestResult.rrTp1} />
                        <LevelRow label="TP2"   price={bestResult.tp2}   color="text-emerald-300" rr={bestResult.rrTp2} />
                        <LevelRow label="SL"    price={bestResult.sl}    color="text-red-400" />
                      </div>
                    )}

                    {/* Validity */}
                    {!bestResult.isBadEntry && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <ValidityCountdown validity={bestResult.validity} validitySeconds={bestResult.validitySeconds} onExpired={() => setBestExpired(true)} />
                      </div>
                    )}
                  </div>

                  {/* Right: indicators + runner-ups + analysis */}
                  <div className="space-y-4">
                    {bestResult.indicators.length > 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Multi-Timeframe Indicators</p>
                        {bestResult.indicators.map(ind => <IndicatorRow key={ind.tf} {...ind} />)}
                        <div className="flex gap-6 mt-3 pt-3 border-t border-zinc-800">
                          {bestResult.fundingRate && (
                            <div><p className="text-xs text-zinc-500">Funding Rate</p><p className={`text-xs font-mono font-bold ${bestResult.fundingRate.startsWith("+") ? "text-red-400" : "text-emerald-400"}`}>{bestResult.fundingRate}</p></div>
                          )}
                          {bestResult.oiChange && (
                            <div><p className="text-xs text-zinc-500">OI Change (8h)</p><p className={`text-xs font-mono font-bold ${parseFloat(bestResult.oiChange) > 2 ? "text-emerald-400" : parseFloat(bestResult.oiChange) < -2 ? "text-red-400" : "text-zinc-400"}`}>{bestResult.oiChange}</p></div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Full analysis */}
                    {bestResult.analysis && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setShowBestAnalysis(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest hover:bg-zinc-800/50 transition-colors"
                        >
                          <span className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> Full AI Analysis</span>
                          {showBestAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {showBestAnalysis && (
                          <div className="px-4 pb-4 prose prose-invert prose-sm max-w-none text-zinc-300 text-xs leading-relaxed">
                            <Streamdown>{bestResult.analysis}</Streamdown>
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      onClick={handleBestCoin}
                      disabled={isBestLoading}
                      variant="outline"
                      className="w-full border-zinc-700 text-zinc-400 hover:border-yellow-500 hover:text-yellow-400 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-2" /> Re-scan Top 20
                    </Button>
                  </div>
                </div>
              )}

              {/* Expired */}
              {!isBestLoading && bestResult && bestExpired && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4">
                  <Clock className="w-10 h-10 text-zinc-600" />
                  <div><p className="text-zinc-300 font-bold">Best Coin Signal Expired</p><p className="text-zinc-500 text-xs mt-1">Run a fresh scan to find the best coin now.</p></div>
                  <Button onClick={handleBestCoin} className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs px-6">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" /> Re-scan Top 20
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Right: Result ─────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Loading skeleton */}
          {isLoading && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-6 bg-zinc-800 rounded w-1/3" />
              <div className="h-24 bg-zinc-800 rounded" />
              <div className="h-4 bg-zinc-800 rounded w-2/3" />
              <div className="h-4 bg-zinc-800 rounded w-1/2" />
              <div className="h-4 bg-zinc-800 rounded w-3/4" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !result && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[360px]">
              <BarChart2 className="w-12 h-12 text-zinc-700" />
              <div>
                <p className="text-zinc-400 text-sm font-bold">Select a coin and click SCAN</p>
                <p className="text-zinc-600 text-xs mt-1">The AI will give you the best directional trade<br />with entry, TP, SL, and a validity timer</p>
              </div>
            </div>
          )}

          {/* Expired state */}
          {!isLoading && result && isExpired && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4">
              <Clock className="w-10 h-10 text-zinc-600" />
              <div>
                <p className="text-zinc-300 font-bold">Signal Expired</p>
                <p className="text-zinc-500 text-xs mt-1">Market conditions may have changed. Run a fresh scan.</p>
              </div>
              <Button onClick={() => handleScan()} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs px-6">
                <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh Scan
              </Button>
            </div>
          )}

          {/* Result */}
          {!isLoading && result && !isExpired && (

            <>
              {/* ── Bad entry warning ─────────────────────────────────────── */}
              {/* Filtered (hidden) bad entry */}
              {result.isFiltered && (
                <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-5 space-y-3 opacity-80">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-zinc-400 shrink-0" />
                    <p className="text-sm font-bold text-zinc-300 uppercase tracking-wide">Signal Filtered</p>
                  </div>
                  <p className="text-sm text-zinc-400">{result.filterReason}</p>
                  <Button
                    onClick={() => handleScan()}
                    className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold text-xs h-10 tracking-widest"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" /> RESCAN FOR BETTER ENTRY
                  </Button>
                </div>
              )}

              {/* Bad entry (deprioritized — shown with warning) */}
              {result.isBadEntry && !result.isFiltered && (
                <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                    <p className="text-sm font-bold text-orange-300 uppercase tracking-wide">Not an Ideal Entry Point</p>
                  </div>
                  {/* LLM bad-entry reason with visual indicator */}
                  {result.badEntryReason && (
                    <div className="bg-orange-900/30 border border-orange-700/40 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">AI Reason for Flagging</span>
                      </div>
                      <p className="text-xs text-orange-200/90 leading-relaxed">{result.badEntryReason}</p>
                    </div>
                  )}
                  <p className="text-[10px] text-orange-300/60 italic">Signal deprioritized — confidence reduced. Proceed with caution.</p>
                  <p className="text-xs text-orange-400/70">Wait for better market conditions, then refresh to get a new scan.</p>
                  <Button
                    onClick={() => handleScan()}
                    className="w-full bg-orange-500 hover:bg-orange-400 text-black font-bold text-xs h-10 tracking-widest"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" /> REFRESH & TRY AGAIN
                  </Button>
                </div>
              )}

              {/* ── LOW confidence fallback ─────────────────────────────── */}
              {!result.isBadEntry && !result.isFiltered && result.confidence === "LOW" && (
                <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4">
                  <AlertTriangle className="w-10 h-10 text-zinc-500" />
                  <div>
                    <p className="text-zinc-300 font-bold text-sm">Insufficient Data — Try Again Later</p>
                    <p className="text-zinc-500 text-xs mt-1 max-w-xs">
                      The AI could not build a high-conviction setup for <span className="text-white font-semibold">{result.symbol}</span> right now.
                      Market signals are conflicting or volume is too low. Refresh in a few minutes.
                    </p>
                  </div>
                  <Button onClick={() => handleScan()} className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold text-xs px-6">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" /> Try Again
                  </Button>
                </div>
              )}

              {/* ── Main verdict ──────────────────────────────────────────── */}
              {!result.isBadEntry && !result.isFiltered && result.confidence !== "LOW" && (
                <div className={`border rounded-xl p-5 space-y-4 ${dirBg}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Best Trade for {result.symbol}</p>
                      <div className="flex items-center gap-3">
                        {dir === "LONG"
                          ? <TrendingUp className="w-9 h-9 text-emerald-400" />
                          : <TrendingDown className="w-9 h-9 text-red-400" />}
                        <span className={`text-4xl font-black tracking-tight ${dirColor}`}>{dir}</span>
                      </div>
                    </div>
                    <div className="text-right space-y-1.5">
                      <Badge className={`text-xs border ${confidenceBadge(result.confidence)}`}>{result.confidence} CONFIDENCE</Badge>
                      <p className="text-xs text-zinc-500">Live: ${result.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
                      {/* AI Sentiment — dormant, re-enable when needed */}
                    </div>
                  </div>

                  {result.keyReason && (
                    <div className="bg-black/30 rounded-lg px-4 py-3">
                      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Key Reason</p>
                      <p className="text-sm text-zinc-200 leading-relaxed">{result.keyReason}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Entry / TP / SL levels ────────────────────────────────── */}
              {!result.isBadEntry && (result.entry || result.tp1 || result.sl) && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Target className="w-3.5 h-3.5" /> Trade Levels
                  </p>
                  <LevelRow label="Entry"  price={result.entry} color="text-cyan-400" />
                  <LevelRow label="TP1"    price={result.tp1}   color="text-emerald-400" rr={result.rrTp1} />
                  <LevelRow label="TP2"    price={result.tp2}   color="text-emerald-300" rr={result.rrTp2} />
                  <LevelRow label="SL"     price={result.sl}    color="text-red-400" />
                  {result.atr > 0 && (
                    <p className="text-xs text-zinc-600 mt-2 font-mono">ATR (1H): {result.atr.toFixed(4)}</p>
                  )}
                </div>
              )}

              {/* ── Validity countdown ────────────────────────────────────── */}
              {!result.isBadEntry && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <ValidityCountdown validity={result.validity} validitySeconds={result.validitySeconds} onExpired={() => setIsExpired(true)} />
                </div>
              )}

              {/* ── Multi-timeframe indicators ────────────────────────────── */}
              {result.indicators.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Multi-Timeframe Indicators</p>
                  {result.indicators.map(ind => <IndicatorRow key={ind.tf} {...ind} />)}
                  <div className="flex gap-6 mt-3 pt-3 border-t border-zinc-800">
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

              {/* ── Full analysis toggle ──────────────────────────────────── */}
              {result.analysis && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowAnalysis(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> Full AI Analysis</span>
                    {showAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showAnalysis && (
                    <div className="px-4 pb-4 prose prose-invert prose-sm max-w-none text-zinc-300 text-xs leading-relaxed">
                      <Streamdown>{result.analysis}</Streamdown>
                    </div>
                  )}
                </div>
              )}

              {/* ── Execute Trade button ────────────────────────────────── */}
              {!result.isBadEntry && result.confidence !== "LOW" && (
                <Button
                  onClick={() => openPreExec(result)}
                  className={`w-full font-bold text-sm h-12 tracking-widest ${
                    result.direction === "LONG"
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  }`}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  EXECUTE {result.direction} — 1-CLICK TRADE
                </Button>
              )}

              {/* ── Quick Predict shortcut ────────────────────────────────── */}
              {!result.isBadEntry && result.confidence !== "LOW" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const params = new URLSearchParams({
                      symbol: result.symbol,
                      direction: result.direction,
                      entry: String(result.entry || result.currentPrice),
                    });
                    window.location.href = `/predict?${params.toString()}`;
                  }}
                  className="w-full border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:border-violet-400 text-xs font-bold"
                >
                  <Brain className="w-3.5 h-3.5 mr-2" /> Quick Predict — Deep AI Analysis
                </Button>
              )}

              {/* ── Re-scan + disclaimer ──────────────────────────────────── */}
              <Button
                variant="outline"
                onClick={() => handleScan()}
                disabled={isLoading}
                className="w-full border-zinc-700 text-zinc-400 hover:border-zinc-500 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-2" /> Re-scan {result.symbol}
              </Button>

              <div className="flex items-start gap-2 text-xs text-zinc-600 px-1">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>AI signals are probabilistic, not guarantees. Always use a stop loss and never risk more than you can afford to lose.</span>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Pre-execution modal */}
      <PreExecutionModal
        open={preExecOpen}
        onClose={() => setPreExecOpen(false)}
        config={preExecConfig}
        hasBinanceKey={hasBinanceKey}
        hasBybitKey={hasBybitKey}
        hasOkxKey={hasOkxKey}
        hasHyperliquidKey={hasHlKey}
        hasAsterdexKey={hasAsterdexKey}
        onSubmit={handleOrderSubmit}
        isSubmitting={isExecuting}
      />
    </div></PageWrapper>
  );
}
