/**
 * PreExecutionModal — shows before any 1-click order is placed.
 * Displays Kelly-criterion-recommended margin, lets the user override
 * margin/leverage, and shows the computed position size and risk metrics.
 * 
 * KEY FEATURES:
 * - Checkboxes for exchanges that have the valid pair
 * - Explicit position size input (USDT) with auto-compute from margin×leverage
 * - Leverage number input field alongside slider
 * - Market/Limit order type toggle
 * - Kelly criterion position sizing recommendation
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, TrendingUp, TrendingDown, Zap, ExternalLink, ShieldAlert, Calculator, Loader2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";

export interface PreExecutionConfig {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  tp1: number | null;
  tp2: number | null;
  sl: number | null;
  rrTp1: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Win rate 0-100 from user's symbol patterns (optional) */
  winRate?: number;
}

export type SupportedExchange = "binance" | "bybit" | "okx" | "hyperliquid" | "asterdex";

export interface OrderSubmitPayload {
  exchange: SupportedExchange;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  leverage: number;
  margin: number;
  entryPrice: number;
  orderType: "market" | "limit";
  limitPrice?: number;
  reduceOnly?: boolean;
  takeProfit?: number;
  stopLoss?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  config: PreExecutionConfig | null;
  hasBinanceKey: boolean;
  hasBybitKey: boolean;
  hasOkxKey: boolean;
  hasHyperliquidKey: boolean;
  hasAsterdexKey?: boolean;
  onSubmit: (payload: OrderSubmitPayload) => void;
  isSubmitting: boolean;
}

/** Kelly fraction = W - (1-W)/R  where W=win rate, R=risk:reward */
function kellyFraction(winRate: number, rr: number): number {
  const w = winRate / 100;
  const k = w - (1 - w) / rr;
  return Math.max(0, Math.min(k, 0.25)); // cap at 25% of bankroll
}

/** Compute suggested margin from Kelly given account size */
function kellySuggestedMargin(winRate: number, rr: number, accountSize: number): number {
  const f = kellyFraction(winRate, rr);
  return Math.round(f * accountSize);
}

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  MEDIUM: "bg-yellow-500/20  text-yellow-300  border-yellow-500/30",
  LOW:    "bg-zinc-500/20    text-zinc-400    border-zinc-500/30",
};

const EXCHANGE_LABELS: Record<SupportedExchange, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  hyperliquid: "Hyperliquid",
  asterdex: "AsterDEX",
};

const EXCHANGE_COLORS: Record<SupportedExchange, string> = {
  binance: "text-yellow-400",
  bybit: "text-orange-400",
  okx: "text-sky-400",
  hyperliquid: "text-violet-400",
  asterdex: "text-lime-400",
};

export default function PreExecutionModal({
  open, onClose, config, hasBinanceKey, hasBybitKey, hasOkxKey, hasHyperliquidKey, hasAsterdexKey,
  onSubmit, isSubmitting,
}: Props) {
  const [leverage, setLeverage]           = useState(5);
  const [margin, setMargin]               = useState(100);
  const [positionSize, setPositionSize]   = useState(500);
  const [accountSize, setAccountSize]     = useState(1000);
  const [orderType, setOrderType]         = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice]       = useState<number>(0);
  const [selectedExchanges, setSelectedExchanges] = useState<Set<SupportedExchange>>(new Set());
  const [submittedExchanges, setSubmittedExchanges] = useState<Set<SupportedExchange>>(new Set());
  // Track which field was last edited to avoid circular updates
  const [lastEdited, setLastEdited]       = useState<"margin" | "position" | "leverage">("margin");
  // Editable TP/SL fields (pre-filled from signal)
  const [tpSlEnabled, setTpSlEnabled]     = useState(true);
  const [tpValue, setTpValue]             = useState<number | null>(null);
  const [slValue, setSlValue]             = useState<number | null>(null);

  // Fetch which exchanges have this pair
  const { data: pairData, isLoading: pairLoading } = trpc.scanner.getExchangesForSymbol.useQuery(
    { symbol: config?.symbol ?? "" },
    { enabled: open && !!config?.symbol }
  );

  // Map of which exchanges have API keys
  const hasKeyMap: Record<SupportedExchange, boolean> = {
    binance: hasBinanceKey,
    bybit: hasBybitKey,
    okx: hasOkxKey,
    hyperliquid: hasHyperliquidKey,
    asterdex: hasAsterdexKey ?? false,
  };

  // Exchanges that have the pair available
  const availableExchanges: SupportedExchange[] = pairData?.exchanges ?? [];

  // Exchanges that are both available AND have API key configured
  const executableExchanges = availableExchanges.filter(ex => hasKeyMap[ex]);

  // Derive R:R from config
  const rrNum = config?.rrTp1 ? parseFloat(config.rrTp1) : 1.5;
  const winRate = config?.winRate ?? 55; // default 55% if no user data

  // Kelly suggestion
  const kellySuggested = kellySuggestedMargin(winRate, rrNum, accountSize);
  const kellyPct = Math.round(kellyFraction(winRate, rrNum) * 100);

  // Reset defaults when config changes
  useEffect(() => {
    if (!config) return;
    const defaultLeverage = config.confidence === "HIGH" ? 10 : config.confidence === "MEDIUM" ? 5 : 3;
    setLeverage(defaultLeverage);
    const defaultMargin = Math.max(10, kellySuggestedMargin(winRate, rrNum, accountSize));
    setMargin(defaultMargin);
    setPositionSize(defaultMargin * defaultLeverage);
    setOrderType("market");
    setLimitPrice(config.entryPrice);
    setSelectedExchanges(new Set());
    setSubmittedExchanges(new Set());
    setLastEdited("margin");
    // Pre-fill TP/SL from signal
    setTpSlEnabled(true);
    setTpValue(config.tp1 ?? null);
    setSlValue(config.sl ?? null);
  }, [config?.symbol, config?.direction]);

  // Auto-select executable exchanges when pair data loads
  useEffect(() => {
    if (executableExchanges.length > 0 && selectedExchanges.size === 0) {
      setSelectedExchanges(new Set([executableExchanges[0]]));
    }
  }, [executableExchanges.length]);

  // Determine the primary selected exchange for balance fetching
  const primaryExchange: SupportedExchange | null = selectedExchanges.size > 0
    ? Array.from(selectedExchanges)[0]
    : null;

  // Fetch available balance from the selected exchange
  // staleTime: 10s so switching exchanges triggers a fresh fetch quickly
  const { data: balanceData, isLoading: balanceLoading, isFetching: balanceFetching } = trpc.scanner.getExchangeBalance.useQuery(
    { exchange: primaryExchange! },
    { enabled: open && !!primaryExchange, refetchOnWindowFocus: false, staleTime: 10000, refetchOnMount: "always" }
  );

  // Auto-populate account size when balance loads
  useEffect(() => {
    if (balanceData?.success && balanceData.availableBalance) {
      const bal = parseFloat(balanceData.availableBalance);
      if (bal > 0) {
        setAccountSize(Math.round(bal * 100) / 100);
      }
    }
  }, [balanceData?.availableBalance, primaryExchange]);

  // Sync position size when margin or leverage changes
  useEffect(() => {
    if (lastEdited === "margin" || lastEdited === "leverage") {
      setPositionSize(Math.round(margin * leverage * 100) / 100);
    }
  }, [margin, leverage, lastEdited]);

  // Sync margin when position size changes
  useEffect(() => {
    if (lastEdited === "position" && leverage > 0) {
      setMargin(Math.round((positionSize / leverage) * 100) / 100);
    }
  }, [positionSize, lastEdited]);

  if (!config) return null;

  const qty = config.entryPrice > 0 ? parseFloat((positionSize / config.entryPrice).toFixed(4)) : 0;

  // Risk in USDT (distance from entry to SL × qty)
  const riskUsdt = config.sl && config.entryPrice
    ? Math.abs(config.entryPrice - config.sl) * qty
    : null;

  const toggleExchange = (ex: SupportedExchange) => {
    setSelectedExchanges(prev => {
      const next = new Set(prev);
      if (next.has(ex)) next.delete(ex);
      else next.add(ex);
      return next;
    });
  };

  const handleSubmit = () => {
    Array.from(selectedExchanges).forEach(ex => {
      onSubmit({
        exchange: ex,
        symbol: config.symbol,
        side: config.direction === "LONG" ? "BUY" : "SELL",
        quantity: qty,
        leverage,
        margin,
        entryPrice: config.entryPrice,
        orderType,
        limitPrice: orderType === "limit" ? (limitPrice || config.entryPrice) : undefined,
        reduceOnly: false,
        takeProfit: tpSlEnabled ? (tpValue ?? undefined) : undefined,
        stopLoss: tpSlEnabled ? (slValue ?? undefined) : undefined,
      });
      setSubmittedExchanges(prev => new Set([...Array.from(prev), ex]));
    });
  };

  // Extract base symbol from various formats (BTCUSDT, BTC/USDC, BTC/USDT, BTC)
  const getBaseSymbol = (sym: string) =>
    sym.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "");

  const openExternal = (ex: SupportedExchange) => {
    const sym = config.symbol;
    const base = getBaseSymbol(sym);
    const urls: Record<string, string> = {
      binance:     `https://www.binance.com/en/futures/${base}USDT`,
      bybit:       `https://www.bybit.com/trade/usdt/${base}USDT`,
      okx:         `https://www.okx.com/trade-futures/${base}-USDT-SWAP`,
      hyperliquid: `https://app.hyperliquid.xyz/trade/${base}`,
      asterdex:    `https://www.asterdex.com/en/futures/${base}USDT`,
    };
    window.open(urls[ex], "_blank");
  };

  // Quote currency label per exchange
  const getQuoteLabel = (ex: SupportedExchange) => ex === "hyperliquid" ? "USDC" : "USDT";

  // Active quote currency based on selected exchange(s)
  const activeQuote = primaryExchange ? getQuoteLabel(primaryExchange) : "USDT";
  // If balance data has quoteCurrency, prefer that
  const displayQuote = balanceData?.quoteCurrency ?? activeQuote;

  const dir = config.direction;
  const dirColor = dir === "LONG" ? "text-emerald-400" : "text-red-400";
  const dirBg    = dir === "LONG" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-md w-full font-mono max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
            <Zap className="w-4 h-4 text-cyan-400" />
            Pre-Execution Review
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-xs">
            Review position sizing and select exchanges before placing the order.
          </DialogDescription>
        </DialogHeader>

        {/* Signal summary */}
        <div className={`flex items-center justify-between rounded-lg border p-3 ${dirBg}`}>
          <div className="flex items-center gap-2">
            {dir === "LONG"
              ? <TrendingUp className="w-5 h-5 text-emerald-400" />
              : <TrendingDown className="w-5 h-5 text-red-400" />}
            <span className={`text-lg font-black ${dirColor}`}>{dir}</span>
            <span className="text-zinc-300 font-bold text-sm">{config.symbol}</span>
          </div>
          <Badge className={`text-xs border ${CONFIDENCE_COLOR[config.confidence]}`}>
            {config.confidence}
          </Badge>
        </div>

        {/* Exchange & Normalized Symbol Badge */}
        {primaryExchange && (
          <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Executing on:</span>
            <Badge className={`text-xs font-bold border border-zinc-600 bg-zinc-800 ${EXCHANGE_COLORS[primaryExchange]}`}>
              {EXCHANGE_LABELS[primaryExchange]}
            </Badge>
            <span className="text-zinc-600">·</span>
            <span className="text-xs font-mono font-bold text-white">
              {getBaseSymbol(config.symbol)}{primaryExchange === "hyperliquid" ? "-USDC" : "-USDT"}
            </span>
            {selectedExchanges.size > 1 && (
              <span className="text-[9px] text-zinc-500">+{selectedExchanges.size - 1} more</span>
            )}
          </div>
        )}

        {/* Levels summary */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-zinc-900 rounded-lg p-2 text-center">
            <p className="text-zinc-500 uppercase tracking-widest text-[10px] mb-0.5">Entry</p>
            <p className="font-mono font-bold text-white">{config.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-[9px] text-zinc-500">{displayQuote}</span></p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-2 text-center">
            <p className="text-zinc-500 uppercase tracking-widest text-[10px] mb-0.5">TP1</p>
            <p className="font-mono font-bold text-emerald-400">{config.tp1 ? `$${config.tp1.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—"}</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-2 text-center">
            <p className="text-zinc-500 uppercase tracking-widest text-[10px] mb-0.5">SL</p>
            <p className="font-mono font-bold text-red-400">{config.sl ? `$${config.sl.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—"}</p>
          </div>
        </div>

        {/* Kelly criterion section */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Kelly Criterion</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-[10px] text-zinc-500 uppercase flex items-center gap-1.5">
                Account Balance ({displayQuote})
                {balanceFetching && <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-400" />}
                {balanceData?.success && !balanceFetching && (
                  <span className="text-emerald-500 text-[9px]">● Live</span>
                )}
              </Label>
              <Input
                type="number"
                value={accountSize}
                onChange={e => setAccountSize(Number(e.target.value))}
                className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700 mt-1"
                placeholder={balanceLoading ? "Loading..." : "Enter account size"}
              />
              {balanceData && !balanceData.success && balanceData.error && (
                <p className="text-[9px] text-yellow-600 mt-0.5">{balanceData.error}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase">Suggested Margin</p>
              <p className="text-lg font-black text-cyan-400">{kellySuggested} {displayQuote}</p>
              <p className="text-[10px] text-zinc-600">{kellyPct}% of account</p>
            </div>
          </div>
          <button
            onClick={() => { setMargin(Math.max(10, kellySuggested)); setLastEdited("margin"); }}
            className="text-[10px] text-cyan-500 hover:text-cyan-300 underline underline-offset-2 transition-colors"
          >
            Apply Kelly suggestion
          </button>
        </div>

        {/* Position sizing controls */}
        <div className="space-y-3">
          {/* Row 1: Margin + Leverage number input */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-[10px] text-zinc-500 uppercase mb-1 block">Margin ({displayQuote})</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={margin}
                  onChange={e => { setMargin(Number(e.target.value)); setLastEdited("margin"); }}
                  className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700 flex-1"
                />
              </div>
              {/* Percentage buttons for quick position sizing */}
              <div className="flex gap-1 mt-1.5">
                {[25, 50, 75, 100].map(pct => {
                  const bal = balanceData?.success ? parseFloat(balanceData.availableBalance) : accountSize;
                  const pctMargin = Math.round(bal * (pct / 100) * 100) / 100;
                  return (
                    <button
                      key={pct}
                      onClick={() => { setMargin(pctMargin); setLastEdited("margin"); }}
                      className={`flex-1 h-6 text-[10px] font-bold rounded border transition-colors ${
                        Math.abs(margin - pctMargin) < 0.5
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="w-24">
              <Label className="text-[10px] text-zinc-500 uppercase mb-1 block">Leverage</Label>
              <Input
                type="number"
                min={1}
                max={125}
                value={leverage}
                onChange={e => { setLeverage(Math.min(125, Math.max(1, Number(e.target.value)))); setLastEdited("leverage"); }}
                className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700"
              />
            </div>
          </div>

          {/* Leverage slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-600">1x</span>
              <span className="text-[10px] text-zinc-400 font-bold">{leverage}x</span>
              <span className="text-[10px] text-zinc-600">125x</span>
            </div>
            <Slider
              value={[leverage]}
              onValueChange={v => { setLeverage(v[0]); setLastEdited("leverage"); }}
              min={1} max={125} step={1}
              className="touch-none"
            />
          </div>

          {/* Row 2: Position size (explicit) */}
          <div>
            <Label className="text-[10px] text-zinc-500 uppercase mb-1 block">Position Size ({displayQuote})</Label>
            <Input
              type="number"
              value={positionSize}
              onChange={e => { setPositionSize(Number(e.target.value)); setLastEdited("position"); }}
              className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700"
            />
            <p className="text-[9px] text-zinc-600 mt-0.5">= margin × leverage</p>
          </div>

          {/* Computed metrics */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-zinc-900 rounded-lg p-2 text-center">
              <p className="text-zinc-500 uppercase tracking-widest text-[10px] mb-0.5">Position</p>
              <p className="font-mono font-bold text-white">{positionSize.toLocaleString()} {displayQuote}</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-2 text-center">
              <p className="text-zinc-500 uppercase tracking-widest text-[10px] mb-0.5">Qty</p>
              <p className="font-mono font-bold text-white">{qty}</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-2 text-center">
              <p className="text-zinc-500 uppercase tracking-widest text-[10px] mb-0.5">Risk</p>
              <p className="font-mono font-bold text-red-400">{riskUsdt ? `${riskUsdt.toFixed(2)} ${displayQuote}` : "—"}</p>
            </div>
          </div>
        </div>

        {/* Order type toggle — Market / Limit */}
        <div>
          <Label className="text-[10px] text-zinc-500 uppercase mb-2 block">Order Type</Label>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            <button
              onClick={() => setOrderType("market")}
              className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${
                orderType === "market"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              MARKET
            </button>
            <button
              onClick={() => setOrderType("limit")}
              className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${
                orderType === "limit"
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              LIMIT
            </button>
          </div>
          {orderType === "limit" && (
            <div className="mt-2">
              <Label className="text-[10px] text-zinc-500 uppercase mb-1 block">Limit Price ({displayQuote})</Label>
              <Input
                type="number"
                value={limitPrice || config.entryPrice}
                onChange={e => setLimitPrice(Number(e.target.value))}
                className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700"
                step="any"
              />
            </div>
          )}
        </div>

        {/* Take Profit & Stop Loss */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tp-sl-toggle"
              checked={tpSlEnabled}
              onCheckedChange={(v) => setTpSlEnabled(!!v)}
              className="data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
            />
            <Label htmlFor="tp-sl-toggle" className="text-[10px] text-zinc-400 uppercase tracking-widest cursor-pointer">
              Set Take Profit & Stop Loss
            </Label>
            {tpSlEnabled && (
              <span className="text-[9px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">Active</span>
            )}
          </div>
        </div>
        {tpSlEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-zinc-500 uppercase mb-1 block">Take Profit ({displayQuote})</Label>
            <Input
              type="number"
              value={tpValue ?? ""}
              onChange={e => setTpValue(e.target.value ? Number(e.target.value) : null)}
              placeholder={config.tp1 ? config.tp1.toFixed(4) : "Optional"}
              className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700 text-emerald-400"
              step="any"
            />
            {tpValue && config.entryPrice > 0 && (
              <p className="text-[9px] text-emerald-500/70 mt-0.5 font-mono">
                {dir === "LONG"
                  ? `+${((tpValue - config.entryPrice) / config.entryPrice * 100).toFixed(2)}%`
                  : `+${((config.entryPrice - tpValue) / config.entryPrice * 100).toFixed(2)}%`
                } from entry
              </p>
            )}
          </div>
          <div>
            <Label className="text-[10px] text-zinc-500 uppercase mb-1 block">Stop Loss ({displayQuote})</Label>
            <Input
              type="number"
              value={slValue ?? ""}
              onChange={e => setSlValue(e.target.value ? Number(e.target.value) : null)}
              placeholder={config.sl ? config.sl.toFixed(4) : "Optional"}
              className="h-8 text-xs font-mono bg-zinc-900 border-zinc-700 text-red-400"
              step="any"
            />
            {slValue && config.entryPrice > 0 && (
              <p className="text-[9px] text-red-500/70 mt-0.5 font-mono">
                {dir === "LONG"
                  ? `-${((config.entryPrice - slValue) / config.entryPrice * 100).toFixed(2)}%`
                  : `-${((slValue - config.entryPrice) / config.entryPrice * 100).toFixed(2)}%`
                } from entry
              </p>
            )}
          </div>
        </div>
        )}

        {/* Dynamic Risk/Reward Ratio */}
        {tpSlEnabled && (() => {
          const entry = config.entryPrice;
          const tp = tpValue;
          const sl = slValue;
          if (!tp || !sl || entry <= 0) return null;
          const reward = dir === "LONG" ? tp - entry : entry - tp;
          const risk = dir === "LONG" ? entry - sl : sl - entry;
          if (risk <= 0) return null;
          const rr = reward / risk;
          const rrColor = rr >= 3 ? "text-emerald-400" : rr >= 2 ? "text-cyan-400" : rr >= 1 ? "text-yellow-400" : "text-red-400";
          const rrBg = rr >= 3 ? "bg-emerald-500/10 border-emerald-500/30" : rr >= 2 ? "bg-cyan-500/10 border-cyan-500/30" : rr >= 1 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30";
          const rewardUsdt = reward * qty;
          const riskUsdt2 = risk * qty;
          const rrBarWidth = Math.min(rr / 5 * 100, 100);
          return (
            <div className={`rounded-lg border p-3 ${rrBg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Risk / Reward</span>
                <span className={`text-lg font-black font-mono ${rrColor}`}>1 : {rr.toFixed(2)}</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    rr >= 3 ? "bg-emerald-500" : rr >= 2 ? "bg-cyan-500" : rr >= 1 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${rrBarWidth}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-red-400">Risk: {riskUsdt2.toFixed(2)} {displayQuote}</span>
                <span className="text-emerald-400">Reward: {rewardUsdt.toFixed(2)} {displayQuote}</span>
              </div>
              {rr < 1 && (
                <p className="text-[9px] text-red-400/80 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Risk exceeds reward — consider adjusting TP/SL
                </p>
              )}
            </div>
          );
        })()}

        {/* Exchange selector — CHECKBOXES with pair availability */}
        <div>
          <Label className="text-[10px] text-zinc-500 uppercase mb-2 block">Execute On (select exchanges)</Label>
          
          {pairLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking pair availability...
            </div>
          ) : (
            <div className="space-y-1.5">
              {(["binance", "bybit", "okx", "hyperliquid", "asterdex"] as SupportedExchange[]).map(ex => {
                const hasPair = availableExchanges.includes(ex);
                const hasKey = hasKeyMap[ex];
                const isExecutable = hasPair && hasKey;
                const isSelected = selectedExchanges.has(ex);
                const wasSubmitted = submittedExchanges.has(ex);

                return (
                  <div
                    key={ex}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      !hasPair
                        ? "border-zinc-800/40 bg-zinc-900/30 opacity-40 cursor-not-allowed"
                        : isSelected
                          ? "border-cyan-500/50 bg-cyan-500/5"
                          : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-600"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => isExecutable && toggleExchange(ex)}
                      disabled={!isExecutable}
                      className="data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                    />
                    <div className="flex-1 flex items-center gap-2">
                      <span className={`text-xs font-bold ${EXCHANGE_COLORS[ex]}`}>
                        {EXCHANGE_LABELS[ex]}
                      </span>
                      {hasPair && ex === "hyperliquid" && (
                        <span className="text-[9px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded font-mono">
                          USDC
                        </span>
                      )}
                      {!hasPair && (
                        <span className="text-[9px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                          Pair not available
                        </span>
                      )}
                      {hasPair && !hasKey && (
                        <span className="text-[9px] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                          No API key
                        </span>
                      )}
                      {wasSubmitted && (
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> Sent
                        </span>
                      )}
                    </div>
                    {hasPair && !hasKey && (
                      <button
                        onClick={() => openExternal(ex)}
                        className="text-[9px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> Open
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {selectedExchanges.size > 0 ? (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || qty <= 0}
              className={`w-full font-bold text-sm h-11 tracking-widest ${
                dir === "LONG"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2"><Zap className="w-4 h-4 animate-pulse" /> EXECUTING...</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  {orderType === "limit" ? "LIMIT " : ""}{dir} {config.symbol} — {leverage}x
                  {selectedExchanges.size > 1 ? ` (${selectedExchanges.size} exchanges)` : ""}
                </span>
              )}
            </Button>
          ) : (
            <div className="text-center py-2 text-xs text-zinc-500">
              Select at least one exchange to execute
            </div>
          )}

          <Button
            variant="outline"
            onClick={onClose}
            className="w-full border-zinc-700 text-zinc-400 hover:border-zinc-600 text-xs h-9"
          >
            Cancel
          </Button>
        </div>

        <div className="flex items-start gap-2 text-[10px] text-zinc-600">
          <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            {orderType === "market"
              ? "Market orders execute at the best available price."
              : "Limit orders will only fill at your specified price or better."}
            {" "}Kelly sizing is a guide only — never risk more than you can afford to lose.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
