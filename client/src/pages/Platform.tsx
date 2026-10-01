/**
 * XRYPT.NET — Unified Trading Dashboard (Platform Page)
 * Mobile-first responsive layout
 * Font: Inter (bold, readable) + JetBrains Mono for numbers only
 * Colour: deep black bg, white text, emerald/red for long/short only
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Activity, BarChart2, Bell, Brain, ChevronRight,
  ExternalLink, Gem, Key, Loader2, RefreshCw, Search,
  Shield, TrendingDown, TrendingUp, ArrowUpRight, Zap,
  SlidersHorizontal, X, PanelRight, PanelLeft,
  Wifi, WifiOff, Circle, DollarSign
} from "lucide-react";
import AiSetupFinder from "@/components/AiSetupFinder";
import MultiExchangeScanner from "@/components/MultiExchangeScanner";
import TradeTakenButton from "@/components/TradeTakenButton";
// Sentiment components kept dormant — re-enable when needed
// import { SentimentInline } from "@/components/SentimentBadge";
// import { SentimentOverview } from "@/components/SentimentOverview";
import { scanForGems, type GemResult } from "@/lib/gemScanner";
import Navbar from "@/components/Navbar";

type DashTab = "signals" | "scanner" | "finder" | "gems" | "stats";

interface LiveSignal {
  id: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  strategy: string;
  entryPrice: string;
  takeProfit: string;
  stopLoss: string;
  confidence: number;
  riskRewardRatio: string | null;
  generatedAt: Date;
  expiresAt: Date | null;
  outcome: "pending" | "hit_tp" | "hit_sl" | "expired";
  metadata: string | null;
}

function parseExchange(metadata: string | null): string {
  if (!metadata) return "Multi";
  try { return JSON.parse(metadata).exchange || "Multi"; } catch { return "Multi"; }
}

function exchangeStyle(ex: string): string {
  const m: Record<string, string> = {
    binance:     "text-yellow-500 border-yellow-500/25 bg-yellow-500/5",
    bybit:       "text-orange-400 border-orange-400/25 bg-orange-400/5",
    okx:         "text-sky-400 border-sky-400/25 bg-sky-400/5",
    hyperliquid: "text-violet-400 border-violet-400/25 bg-violet-400/5",
    asterdex:    "text-lime-400 border-lime-400/25 bg-lime-400/5",
  };
  return m[ex.toLowerCase()] ?? "text-zinc-400 border-zinc-600/40 bg-zinc-800/40";
}

function isDex(ex: string): boolean {
  return ["hyperliquid", "asterdex", "dydx", "gmx"].includes(ex.toLowerCase());
}

function formatMarketPrice(value: string | number): string {
  const price = Number(value);
  if (!Number.isFinite(price)) return "—";
  if (price >= 1_000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4).replace(/\.?(0+)$/, "");
  if (price >= 0.01) return price.toFixed(6).replace(/\.?(0+)$/, "");
  return price.toPrecision(5);
}

function formatCountdown(expiresAt: Date | null): { label: string; cls: string } {
  if (!expiresAt) return { label: "—", cls: "text-zinc-500" };
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", cls: "text-zinc-600" };
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const label = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return { label, cls: mins < 15 ? "text-red-400" : mins < 60 ? "text-yellow-400" : "text-emerald-400" };
}

/* ─── Signal Card (mobile) ─── */
function SignalCard({ sig, onExecute, hasHyperliquid }: { sig: LiveSignal; onExecute: (s: LiveSignal) => void; hasHyperliquid?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigWithTaken = sig as any;
  const exchange = parseExchange(sig.metadata);
  const { label: timer, cls: timerCls } = formatCountdown(sig.expiresAt);
  const isExpired = sig.outcome !== "pending" || (sig.expiresAt !== null && sig.expiresAt.getTime() < Date.now());
  const isLong = sig.direction === "LONG";
  return (
    <div className={`relative rounded-xl border bg-zinc-900/60 p-4 overflow-hidden ${isExpired ? "opacity-40" : ""}`}
      style={{ borderColor: isLong ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)" }}>
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: isLong ? "#10b981" : "#ef4444" }} />
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base text-white">{sig.symbol}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border ${
            isLong ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-red-400 border-red-500/30 bg-red-500/5"
          }`}>
            {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {sig.direction}
          </span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${exchangeStyle(exchange)}`}>{exchange}</span>
      </div>
      {/* Price grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {([["Entry", sig.entryPrice, "text-zinc-300"], ["TP", sig.takeProfit, "text-emerald-400"], ["SL", sig.stopLoss, "text-red-400"]] as const).map(([l, v, c]) => (
          <div key={l} className="bg-zinc-800/60 rounded-lg p-2 text-center">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">{l}</div>
            <div className={`font-mono text-xs font-semibold ${c}`}>{formatMarketPrice(v)}</div>
          </div>
        ))}
      </div>
      {/* Confidence + timer */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${sig.confidence >= 85 ? "bg-emerald-500" : sig.confidence >= 70 ? "bg-yellow-500" : "bg-zinc-500"}`}
            style={{ width: `${sig.confidence}%` }} />
        </div>
        <span className="font-mono text-xs text-zinc-400 shrink-0">{sig.confidence}%</span>
        <span className={`font-mono text-xs shrink-0 ${timerCls}`}>{timer}</span>
        {sig.riskRewardRatio && <span className="font-mono text-xs text-zinc-500 shrink-0">R/R {sig.riskRewardRatio}</span>}
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2">
        <TradeTakenButton
          signalId={sig.id}
          symbol={sig.symbol}
          direction={sig.direction}
          entryPrice={parseFloat(sig.entryPrice)}
          alreadyTaken={!!sigWithTaken.tradeTaken}
          alreadyVerified={!!sigWithTaken.tradeVerified}
          takenExchange={sigWithTaken.tradeTakenExchange ?? null}
        />
        {/* Quick Predict shortcut */}
        <a
          href={"/predict?symbol=" + sig.symbol + "&direction=" + sig.direction + "&entry=" + sig.entryPrice}
          target="_blank"
          rel="noopener noreferrer"
          title="Quick Predict — analyse this signal"
          className="p-2 rounded-lg border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/50 transition-colors flex-shrink-0"
        >
          <Brain className="w-3.5 h-3.5" />
        </a>
        {!isExpired && (
          isDex(exchange) ? (
            <button onClick={() => window.open(
          exchange.toLowerCase() === "asterdex"
                ? `https://www.asterdex.com/en/trade/pro/futures/${sig.symbol.replace("/", "")}`
                : `https://app.hyperliquid.xyz/trade/${sig.symbol.replace("USDT","")}`,
              "_blank"
            )} className="flex-1 text-sm py-2 rounded-lg border border-zinc-600/50 bg-zinc-800/50 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> {exchange.toLowerCase() === "hyperliquid" && hasHyperliquid ? "Execute on HL" : "Trade on DEX"}
            </button>
          ) : (
            <button onClick={() => onExecute(sig)}
              className={`flex-1 text-sm py-2 rounded-lg border font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                isLong ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10"
                       : "border-red-500/40 bg-red-500/5 text-red-400 hover:bg-red-500/10"
              }`}>
              <Zap className="w-3.5 h-3.5" /> Execute {isLong ? "Long" : "Short"}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* ─── Signal Row (desktop table) ─── */
function SignalRow({ sig, onExecute, hasHyperliquid }: { sig: LiveSignal; onExecute: (s: LiveSignal) => void; hasHyperliquid?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigWithTaken = sig as any;
  const exchange = parseExchange(sig.metadata);
  const { label: timer, cls: timerCls } = formatCountdown(sig.expiresAt);
  const isExpired = sig.outcome !== "pending" || (sig.expiresAt !== null && sig.expiresAt.getTime() < Date.now());
  const isLong = sig.direction === "LONG";
  return (
    <tr className={`border-b border-zinc-800/60 hover:bg-zinc-800/20 transition-colors ${isExpired ? "opacity-40" : ""}`}>
      <td className="px-4 py-3 font-bold text-sm text-white whitespace-nowrap">{sig.symbol}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded border ${
          isLong ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-red-400 border-red-500/30 bg-red-500/5"
        }`}>
          {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {sig.direction}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-zinc-300 whitespace-nowrap">{formatMarketPrice(sig.entryPrice)}</td>
      <td className="px-4 py-3 font-mono text-sm text-emerald-400 whitespace-nowrap">{formatMarketPrice(sig.takeProfit)}</td>
      <td className="px-4 py-3 font-mono text-sm text-red-400 whitespace-nowrap">{formatMarketPrice(sig.stopLoss)}</td>
      <td className="px-4 py-3 font-mono text-sm text-zinc-400 whitespace-nowrap">{sig.riskRewardRatio ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-14 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${sig.confidence >= 85 ? "bg-emerald-500" : sig.confidence >= 70 ? "bg-yellow-500" : "bg-zinc-500"}`}
              style={{ width: `${sig.confidence}%` }} />
          </div>
          <span className="font-mono text-xs text-zinc-400">{sig.confidence}%</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${exchangeStyle(exchange)}`}>{exchange}</span>
      </td>
      <td className={`px-4 py-3 font-mono text-xs whitespace-nowrap ${timerCls}`}>{timer}</td>
      <td className="px-4 py-3">
        <TradeTakenButton
          signalId={sig.id}
          symbol={sig.symbol}
          direction={sig.direction}
          entryPrice={parseFloat(sig.entryPrice)}
          alreadyTaken={!!sigWithTaken.tradeTaken}
          alreadyVerified={!!sigWithTaken.tradeVerified}
          takenExchange={sigWithTaken.tradeTakenExchange ?? null}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {/* Quick Predict shortcut */}
          <a
            href={"/predict?symbol=" + sig.symbol + "&direction=" + sig.direction + "&entry=" + sig.entryPrice}
            target="_blank"
            rel="noopener noreferrer"
            title="Quick Predict — analyse this signal"
            className="p-1.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/10 transition-colors flex-shrink-0"
          >
            <Brain className="w-3 h-3" />
          </a>
          {!isExpired ? (
            isDex(exchange) ? (
              <button onClick={() => window.open(
                exchange.toLowerCase() === "asterdex"
                  ? "https://www.asterdex.com/en/trade/pro/futures/" + sig.symbol.replace("/", "")
                  : "https://app.hyperliquid.xyz/trade/" + sig.symbol.replace("USDT",""),
                "_blank"
              )} className="text-xs px-3 py-1.5 rounded border border-zinc-600/50 bg-zinc-800/50 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors flex items-center gap-1 whitespace-nowrap">
                <ExternalLink className="w-3 h-3" /> {exchange.toLowerCase() === "hyperliquid" && hasHyperliquid ? "HL Execute" : "DEX"}
              </button>
            ) : (
              <button onClick={() => onExecute(sig)}
                className={"text-xs px-3 py-1.5 rounded border font-medium transition-colors flex items-center gap-1 whitespace-nowrap " + (isLong ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10" : "border-red-500/40 bg-red-500/5 text-red-400 hover:bg-red-500/10")}>
                <Zap className="w-3 h-3" /> {isLong ? "Long" : "Short"}
              </button>
            )
          ) : <span className="text-xs text-zinc-600">Expired</span>}
        </div>
      </td>
    </tr>
  );
}

function PositionCard({ pos }: { pos: Record<string, string | number> }) {
  const isLong = Number(pos.positionAmt) > 0 || pos.side === "Buy" || pos.side === "long";
  const pnl = parseFloat(String(pos.unrealizedProfit ?? pos.unrealisedPnl ?? pos.unrealizedPnl ?? "0"));
  return (
    <div className="relative rounded-lg border bg-zinc-900/60 p-3 mb-2 overflow-hidden"
      style={{ borderColor: isLong ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)" }}>
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: isLong ? "#10b981" : "#ef4444" }} />
      <div className="flex justify-between items-start mb-1.5">
        <div>
          <span className="font-bold text-sm text-white">{String(pos.symbol)}</span>
          <span className="text-xs text-zinc-500 ml-2">{isLong ? "LONG" : "SHORT"} {pos.leverage}×</span>
        </div>
        <span className={`font-mono text-sm font-bold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
        </span>
      </div>
      <div className="flex gap-4 text-xs text-zinc-500 font-mono">
        <span>Entry {parseFloat(String(pos.entryPrice ?? "0")).toFixed(4)}</span>
        <span>{Math.abs(parseFloat(String(pos.positionAmt ?? pos.size ?? "0"))).toFixed(4)}</span>
      </div>
    </div>
  );
}

function AlertItem({ notif }: { notif: Record<string, unknown> }) {
  const barMap: Record<string, string> = {
    signal_verified: "bg-sky-500", signal_hit_tp: "bg-emerald-500",
    signal_hit_sl: "bg-red-500", signal_expired: "bg-yellow-500", system: "bg-zinc-500",
  };
  const bar = barMap[String(notif.type)] ?? "bg-zinc-500";
  const ago = Math.floor((Date.now() - new Date(String(notif.createdAt ?? notif.timestamp ?? Date.now())).getTime()) / 60000);
  return (
    <div className="flex gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className={`w-0.5 rounded-full flex-shrink-0 self-stretch min-h-[28px] ${bar}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug truncate">{String(notif.title)}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{ago < 1 ? "just now" : `${ago}m ago`}</p>
      </div>
    </div>
  );
}

/* ─── Sidebar Content (shared between desktop aside and mobile drawer) ─── */
function SidebarLeft({ topSignal, activeTab, setActiveTab, pendingSignals, hasBinance, hasBybit, hasOkx, hasMexc, hasKucoin, hasGateio, hasBitget, hasAsterdex, isConnected, hasHyperliquid, winRate, avgRR, totalSignals, positions, asterdexBalance, asterdexBalanceLoading, asterdexBalanceError, asterdexPositionCount, asterdexLastUpdated, asterdexUnrealisedPnl, onRefreshAsterdex, hyperliquidBalance, hyperliquidAccountValue, hyperliquidPositionCount, hyperliquidPnl, binanceBalanceData, binancePositionCount, binancePnl, bybitBalanceData, bybitPositionCount, bybitPnl, okxBalanceData, okxPositionCount, okxPnl }: {
  topSignal: LiveSignal | null;
  activeTab: DashTab;
  setActiveTab: (t: DashTab) => void;
  pendingSignals: LiveSignal[];
  hasBinance: { hasKey: boolean } | undefined;
  hasBybit: { hasKey: boolean } | undefined;
  hasOkx: { hasKey: boolean } | undefined;
  hasMexc: boolean | undefined;
  hasKucoin: boolean | undefined;
  hasGateio: boolean | undefined;
  hasBitget: boolean | undefined;
  hasAsterdex: boolean | undefined;
  isConnected: boolean;
  hasHyperliquid: boolean;
  winRate: number;
  avgRR: string | number;
  totalSignals: number;
  positions: Record<string, string | number>[];
  asterdexBalance?: { balance?: string; totalBalance?: string; error?: string } | null;
  asterdexBalanceLoading?: boolean;
  asterdexBalanceError?: boolean;
  asterdexPositionCount?: number;
  asterdexLastUpdated?: number;
  asterdexUnrealisedPnl?: number;
  onRefreshAsterdex?: () => void;
  hyperliquidBalance?: string | null;
  hyperliquidAccountValue?: string | null;
  hyperliquidPositionCount?: number;
  hyperliquidPnl?: number;
  binanceBalanceData?: { success: boolean; availableBalance: string; quoteCurrency?: string } | null;
  binancePositionCount?: number;
  binancePnl?: number;
  bybitBalanceData?: { success: boolean; availableBalance: string; quoteCurrency?: string } | null;
  bybitPositionCount?: number;
  bybitPnl?: number;
  okxBalanceData?: { success: boolean; availableBalance: string; quoteCurrency?: string } | null;
  okxPositionCount?: number;
  okxPnl?: number;
}) {
  return (
    <div className="flex flex-col gap-5 p-3">
      {/* Signal of the Day */}
      {topSignal && (() => {
        const isLong = topSignal.direction === "LONG";
        const { label: timer } = formatCountdown(topSignal.expiresAt);
        const validPct = topSignal.expiresAt
          ? Math.max(0, (topSignal.expiresAt.getTime() - Date.now()) / (topSignal.expiresAt.getTime() - topSignal.generatedAt.getTime()) * 100)
          : 60;
        return (
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/60 p-3 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: isLong ? "#10b981" : "#ef4444" }} />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Signal of the Day</p>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-base text-white">{topSignal.symbol}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                isLong ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-red-400 border-red-500/30 bg-red-500/5"
              }`}>{topSignal.direction}</span>
              <span className="ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">{topSignal.confidence}%</span>
            </div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {([["Entry", topSignal.entryPrice, "text-zinc-300"], ["TP", topSignal.takeProfit, "text-emerald-400"], ["SL", topSignal.stopLoss, "text-red-400"]] as const).map(([l, v, c]) => (
                <div key={l} className="bg-zinc-800/60 rounded p-1.5 text-center">
                  <div className="text-[8px] text-zinc-600 uppercase tracking-wider mb-0.5">{l}</div>
                  <div className={`font-mono text-[11px] font-medium ${c}`}>{formatMarketPrice(v)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${isLong ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${validPct}%` }} />
              </div>
              <span className="font-mono text-[10px] text-zinc-500">{timer}</span>
            </div>
          </div>
        );
      })()}

      {/* Tool Nav */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">Tools</p>
        <nav className="flex flex-col gap-0.5">
          {([
            ["signals", Activity,  "Live Signals",    pendingSignals.length],
            ["finder",  Brain,     "AI Setup Finder", null],
            ["scanner", Search,    "Deep Scanner",    null],
            ["stats",   BarChart2, "AI Stats",        null],
          ] as const).map(([id, Icon, label, count]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm font-medium transition-colors text-left min-h-[44px] ${
                activeTab === id ? "bg-zinc-800 text-white border border-zinc-700/50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {count !== null && count > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${activeTab === id ? "text-sky-400 bg-sky-500/10" : "text-zinc-500 bg-zinc-800"}`}>{count}</span>
              )}
            </button>
          ))}
          {/* Gem Finder is spot-only — external link */}
          <a href="/gem-finder"
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm font-medium transition-colors text-left min-h-[44px] text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800/50">
            <Gem className="w-4 h-4 flex-shrink-0 text-emerald-500/60" />
            <span className="flex-1">Gem Finder</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500/70 border border-emerald-500/20">SPOT</span>
          </a>
        </nav>
      </div>

      {/* Quick Links */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">More</p>
        <nav className="flex flex-col gap-0.5">
          {([
            ["/predict",                Brain,    "Predictor"],
            ["/verification",           Shield,   "Verification"],
            ["/settings/notifications", Bell,     "Notifications"],
            ["/binance-setup",          Key,      "Exchange Setup"],
            ["/trade-analyzer",         Activity, "Trade Analyzer"],
            ["/ai-stats",               BarChart2,"Full AI Stats"],
          ] as const).map(([href, Icon, label]) => (
            <Link key={href} href={href} className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors min-h-[44px]">
              <Icon className="w-4 h-4 flex-shrink-0" /><span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Asset Deck */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">Asset Deck</p>
        <div className="flex flex-col gap-2">
          {/* Hyperliquid */}
          {hasHyperliquid ? (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" /></span>
                  <span className="text-[11px] font-semibold text-violet-400">Hyperliquid</span>
                </div>
                <span className="text-[9px] font-mono text-zinc-500">USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Balance</span>
                <span className="font-mono text-[12px] font-bold text-white">{hyperliquidAccountValue ? parseFloat(hyperliquidAccountValue).toFixed(2) : "—"}</span>
              </div>
              {hyperliquidBalance && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-600">Available</span>
                  <span className="font-mono text-[11px] text-zinc-400">{parseFloat(hyperliquidBalance).toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-violet-500/10">
                <span className="text-[10px] text-zinc-500">Positions</span>
                <span className={`font-mono text-[11px] font-bold ${(hyperliquidPositionCount ?? 0) > 0 ? "text-sky-400" : "text-zinc-500"}`}>{hyperliquidPositionCount ?? 0}</span>
              </div>
              {(hyperliquidPositionCount ?? 0) > 0 && hyperliquidPnl !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">Unrealised P&L</span>
                  <span className={`font-mono text-[11px] font-bold ${hyperliquidPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{hyperliquidPnl >= 0 ? "+" : ""}{hyperliquidPnl.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2.5 flex items-center gap-2.5">
              <WifiOff className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Hyperliquid</p>
                <Link href="/binance-setup" className="text-[10px] text-violet-400 hover:text-violet-300">Connect →</Link>
              </div>
            </div>
          )}

          {/* Binance */}
          {hasBinance?.hasKey ? (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-500" /></span>
                  <span className="text-[11px] font-semibold text-yellow-500">Binance</span>
                </div>
                <span className="text-[9px] font-mono text-zinc-500">USDT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Available</span>
                <span className="font-mono text-[12px] font-bold text-white">{binanceBalanceData?.availableBalance ? parseFloat(binanceBalanceData.availableBalance).toFixed(2) : "—"}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-yellow-500/10">
                <span className="text-[10px] text-zinc-500">Positions</span>
                <span className={`font-mono text-[11px] font-bold ${(binancePositionCount ?? 0) > 0 ? "text-sky-400" : "text-zinc-500"}`}>{binancePositionCount ?? 0}</span>
              </div>
              {(binancePositionCount ?? 0) > 0 && binancePnl !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">Unrealised P&L</span>
                  <span className={`font-mono text-[11px] font-bold ${binancePnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{binancePnl >= 0 ? "+" : ""}{binancePnl.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2.5 flex items-center gap-2.5">
              <WifiOff className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Binance</p>
                <Link href="/binance-setup" className="text-[10px] text-yellow-500 hover:text-yellow-400">Connect →</Link>
              </div>
            </div>
          )}

          {/* Bybit */}
          {hasBybit?.hasKey ? (
            <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" /></span>
                  <span className="text-[11px] font-semibold text-orange-400">Bybit</span>
                </div>
                <span className="text-[9px] font-mono text-zinc-500">USDT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Available</span>
                <span className="font-mono text-[12px] font-bold text-white">{bybitBalanceData?.availableBalance ? parseFloat(bybitBalanceData.availableBalance).toFixed(2) : "—"}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-orange-400/10">
                <span className="text-[10px] text-zinc-500">Positions</span>
                <span className={`font-mono text-[11px] font-bold ${(bybitPositionCount ?? 0) > 0 ? "text-sky-400" : "text-zinc-500"}`}>{bybitPositionCount ?? 0}</span>
              </div>
              {(bybitPositionCount ?? 0) > 0 && bybitPnl !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">Unrealised P&L</span>
                  <span className={`font-mono text-[11px] font-bold ${bybitPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{bybitPnl >= 0 ? "+" : ""}{bybitPnl.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2.5 flex items-center gap-2.5">
              <WifiOff className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Bybit</p>
                <Link href="/binance-setup" className="text-[10px] text-orange-400 hover:text-orange-300">Connect →</Link>
              </div>
            </div>
          )}

          {/* OKX */}
          {hasOkx?.hasKey ? (
            <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" /></span>
                  <span className="text-[11px] font-semibold text-sky-400">OKX</span>
                </div>
                <span className="text-[9px] font-mono text-zinc-500">USDT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Available</span>
                <span className="font-mono text-[12px] font-bold text-white">{okxBalanceData?.availableBalance ? parseFloat(okxBalanceData.availableBalance).toFixed(2) : "—"}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-sky-400/10">
                <span className="text-[10px] text-zinc-500">Positions</span>
                <span className={`font-mono text-[11px] font-bold ${(okxPositionCount ?? 0) > 0 ? "text-sky-400" : "text-zinc-500"}`}>{okxPositionCount ?? 0}</span>
              </div>
              {(okxPositionCount ?? 0) > 0 && okxPnl !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">Unrealised P&L</span>
                  <span className={`font-mono text-[11px] font-bold ${okxPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{okxPnl >= 0 ? "+" : ""}{okxPnl.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2.5 flex items-center gap-2.5">
              <WifiOff className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-zinc-500">OKX</p>
                <Link href="/binance-setup" className="text-[10px] text-sky-400 hover:text-sky-300">Connect →</Link>
              </div>
            </div>
          )}

          {/* AsterDEX */}
          {hasAsterdex ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>
                  <span className="text-[11px] font-semibold text-emerald-400">AsterDEX</span>
                  {onRefreshAsterdex && (
                    <button onClick={onRefreshAsterdex} className="text-zinc-600 hover:text-zinc-400 transition-colors ml-1" title="Refresh">
                      <RefreshCw className={`w-2.5 h-2.5 ${asterdexBalanceLoading ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </div>
                <span className="text-[9px] font-mono text-zinc-500">USDT</span>
              </div>
              {asterdexBalanceError ? (
                <p className="text-[10px] text-red-400">Connection error</p>
              ) : asterdexBalanceLoading && !asterdexBalance ? (
                <p className="text-[10px] text-zinc-600">Connecting…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">Available</span>
                    <span className="font-mono text-[12px] font-bold text-white">{asterdexBalance?.balance ? parseFloat(asterdexBalance.balance).toFixed(2) : "—"}</span>
                  </div>
                  {asterdexBalance?.totalBalance && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-600">Total</span>
                      <span className="font-mono text-[11px] text-zinc-400">{parseFloat(asterdexBalance.totalBalance).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10">
                    <span className="text-[10px] text-zinc-500">Positions</span>
                    <span className={`font-mono text-[11px] font-bold ${(asterdexPositionCount ?? 0) > 0 ? "text-sky-400" : "text-zinc-500"}`}>{asterdexPositionCount ?? 0}</span>
                  </div>
                  {(asterdexPositionCount ?? 0) > 0 && asterdexUnrealisedPnl !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">Unrealised P&L</span>
                      <span className={`font-mono text-[11px] font-bold ${asterdexUnrealisedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{asterdexUnrealisedPnl >= 0 ? "+" : ""}{asterdexUnrealisedPnl.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2.5 flex items-center gap-2.5">
              <WifiOff className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-zinc-500">AsterDEX</p>
                <Link href="/binance-setup" className="text-[10px] text-emerald-400 hover:text-emerald-300">Connect →</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 30-Day Stats */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">30-Day Performance</p>
        <div className="flex flex-col">
          {([
            ["Win Rate",       winRate > 0 ? `${winRate}%` : "—",          winRate > 60 ? "text-emerald-400" : "text-zinc-300"],
            ["Avg R/R",        avgRR !== "—" ? `${avgRR}:1` : "—",         "text-zinc-300"],
            ["Total Signals",  totalSignals > 0 ? String(totalSignals) : "—","text-sky-400"],
            ["Open Positions", String(positions.length),                    "text-zinc-300"],
          ] as const).map(([label, value, cls]) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-zinc-800/40 last:border-0">
              <span className="text-xs text-zinc-500">{label}</span>
              <span className={`font-mono text-xs font-semibold ${cls}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarRight({ positions, notifications, stats, winRate, totalSignals, setActiveTab }: {
  positions: Record<string, string | number>[];
  notifications: Record<string, unknown>[];
  stats: Record<string, number> | undefined;
  winRate: number;
  totalSignals: number;
  setActiveTab: (t: DashTab) => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-3">
      {/* AI Sentiment Overview — dormant, re-enable when needed: <SentimentOverview /> */}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">
          Open Positions <span className="font-mono text-zinc-700">({positions.length})</span>
        </p>
        {positions.length === 0 ? (
          <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-4 text-center">
            <p className="text-xs text-zinc-600">No open positions</p>
            <Link href="/binance-setup" className="text-xs text-zinc-500 hover:text-zinc-300 mt-1 inline-flex items-center gap-1 transition-colors">
              <Key className="w-3 h-3" /> Add API keys
            </Link>
          </div>
        ) : positions.map((p, i) => <PositionCard key={i} pos={p} />)}
        <Link href="/active-trades" className="mt-2 w-full inline-flex items-center justify-center gap-2 text-xs text-cyan-500 hover:text-cyan-300 border border-cyan-500/20 hover:border-cyan-500/40 rounded px-3 py-2 transition-colors">
          <Activity className="w-3.5 h-3.5" /> View Active Trades
        </Link>
      </div>

      <div className="h-px bg-zinc-800/60" />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">Live Alerts</p>
        {notifications.length === 0 ? (
          <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-4 text-center">
            <p className="text-xs text-zinc-600">No alerts yet</p>
          </div>
        ) : notifications.slice(0, 10).map((n, i) => <AlertItem key={i} notif={n} />)}
      </div>

      <div className="h-px bg-zinc-800/60" />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">AI Performance (30d)</p>
        <div className="flex flex-col">
          {([
            ["Total Signals", totalSignals > 0 ? String(totalSignals) : "—", "text-sky-400"],
            ["TP Hit",        (stats?.hitTp ?? 0) > 0 ? `${stats!.hitTp} · ${winRate}%` : "—", "text-emerald-400"],
            ["SL Hit",        (stats?.hitSl ?? 0) > 0 ? String((stats as Record<string, number>).hitSl) : "—", "text-red-400"],
            ["Avg Hold",      "4h 18m", "text-zinc-300"],
          ] as const).map(([label, value, cls]) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-zinc-800/40 last:border-0">
              <span className="text-xs text-zinc-500">{label}</span>
              <span className={`font-mono text-xs font-semibold ${cls}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-zinc-800/60" />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2 px-1">Inverse Learning</p>
        <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/40 p-3 text-center">
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">
            Upload your trade history — the AI learns from your losses to improve future signal accuracy.
          </p>
          <button onClick={() => setActiveTab("finder")}
            className="w-full inline-flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-white border border-dashed border-zinc-700 hover:border-zinc-500 rounded px-3 py-2 transition-colors">
            <Brain className="w-3.5 h-3.5" /> Open AI Setup Finder
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Platform() {
  const { isAuthenticated } = useAuth();
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<DashTab>("signals");
  const [gems, setGems] = useState<GemResult[]>([]);
  const [gemsLoading, setGemsLoading] = useState(false);
  const [positions, setPositions] = useState<Record<string, string | number>[]>([]);
  const [signalFilter, setSignalFilter] = useState<"all" | "long" | "short">("all");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const { data: signalsData, isLoading: signalsLoading, refetch: refetchSignals } =
    trpc.signals.list.useQuery({ minConfidence: 70, limit: 50 }, { refetchInterval: 60_000 });
  const { data: statsData } = trpc.signals.stats.useQuery(undefined, { refetchInterval: 120_000 });
  const { data: notificationsData } = trpc.notifications.list.useQuery({ limit: 20 } as never, { refetchInterval: 30_000 });
  const { data: hasBinance } = trpc.binance.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasBybit }  = trpc.bybit.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasOkx }    = trpc.okx.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasMexc }   = trpc.mexc.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasKucoin } = trpc.kucoin.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasGateio } = trpc.gateio.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasBitget }   = trpc.bitget.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasAsterdex } = trpc.asterdex.hasApiKey.useQuery(undefined, { enabled: isAuthenticated });
  const { data: hasHyperliquid } = trpc.hyperliquid.hasKey.useQuery(undefined, { enabled: isAuthenticated });
  const asterdexBalance = trpc.asterdex.getBalance.useQuery(undefined, {
    enabled: isAuthenticated && !!hasAsterdex?.hasKey,
    refetchInterval: 30_000,
  });
  const asterdexPositions = trpc.asterdex.getPositions.useQuery(undefined, {
    enabled: isAuthenticated && !!hasAsterdex?.hasKey,
    refetchInterval: 30_000,
  });
  const binancePositions    = trpc.binance.getPositions.useQuery(undefined, {
    enabled: isAuthenticated && !!hasBinance?.hasKey, refetchInterval: 30_000,
  });
  const hyperliquidAccount = trpc.hyperliquid.getAccount.useQuery(undefined, {
    enabled: isAuthenticated && !!hasHyperliquid?.hasKey, refetchInterval: 30_000,
  });
  const bybitPositions = trpc.bybit.getPositions.useQuery(undefined, {
    enabled: isAuthenticated && !!hasBybit?.hasKey, refetchInterval: 30_000,
  });
  const okxPositions = trpc.okx.getPositions.useQuery(undefined, {
    enabled: isAuthenticated && !!hasOkx?.hasKey, refetchInterval: 30_000,
  });
  // Exchange balances for Asset Deck
  const binanceBalance = trpc.scanner.getExchangeBalance.useQuery(
    { exchange: "binance" },
    { enabled: isAuthenticated && !!hasBinance?.hasKey, refetchInterval: 30_000 }
  );
  const bybitBalance = trpc.scanner.getExchangeBalance.useQuery(
    { exchange: "bybit" },
    { enabled: isAuthenticated && !!hasBybit?.hasKey, refetchInterval: 30_000 }
  );
  const okxBalance = trpc.scanner.getExchangeBalance.useQuery(
    { exchange: "okx" },
    { enabled: isAuthenticated && !!hasOkx?.hasKey, refetchInterval: 30_000 }
  );

  useEffect(() => {
    const all: Record<string, string | number>[] = [];
    if (binancePositions.data?.positions) {
      for (const p of binancePositions.data.positions as Record<string, string | number>[]) {
        all.push({ ...p, _exchange: "binance" });
      }
    }
    if (asterdexPositions.data?.positions) {
      for (const p of asterdexPositions.data.positions as Record<string, string | number>[]) {
        all.push({ ...p, _exchange: "asterdex" });
      }
    }
    // Bybit positions
    if (bybitPositions.data?.positions) {
      for (const p of bybitPositions.data.positions as Record<string, string | number>[]) {
        all.push({ ...p, _exchange: "bybit" });
      }
    }
    // OKX positions
    if (okxPositions.data?.positions) {
      for (const p of okxPositions.data.positions as Record<string, string | number>[]) {
        all.push({ ...p, _exchange: "okx" });
      }
    }
    // Hyperliquid positions — normalize to common shape
    if (hyperliquidAccount.data?.positions) {
      for (const p of hyperliquidAccount.data.positions) {
        all.push({
          symbol: `${p.symbol}USDT`,
          positionAmt: p.size,
          entryPrice: p.entryPx,
          unrealizedProfit: p.unrealizedPnl,
          positionSide: p.side,
          _exchange: "hyperliquid",
        } as Record<string, string | number>);
      }
    }
    setPositions(all);
  }, [binancePositions.data, asterdexPositions.data, bybitPositions.data, okxPositions.data, hyperliquidAccount.data]);

  const loadGems = useCallback(async () => {
    setGemsLoading(true);
    try { setGems((await scanForGems({ riskAppetite: "HIGH", maxResults: 8 })).slice(0, 8)); }
    catch { /* silent */ }
    finally { setGemsLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === "gems" && gems.length === 0) loadGems(); }, [activeTab, gems.length, loadGems]);

  const binancePlaceOrder   = trpc.binance.placeOrder.useMutation();
  const bybitPlaceOrder     = trpc.bybit.placeOrder.useMutation();
  const okxPlaceOrder       = trpc.okx.placeOrder.useMutation();
  const asterdexPlaceOrder     = trpc.asterdex.placeOrder.useMutation();
  const hyperliquidPlaceOrder  = trpc.hyperliquid.placeOrder.useMutation();

  const handleExecute = useCallback((sig: LiveSignal) => {
    const exchange = parseExchange(sig.metadata).toLowerCase();
    const qty = "0.01";
    const exName = exchange.toUpperCase();
    const dir = sig.direction;
    const sym = sig.symbol;
    const onErr = (e: { message: string }) => toast.error(e.message);
    if (exchange === "hyperliquid" && hasHyperliquid?.hasKey) {
      // Hyperliquid: use coin name only (strip USDT/USDC/USD and separators)
      const hlSym = sym.replace(/[\/\-]/g, "").replace(/USDT$/i, "").replace(/USDC$/i, "").replace(/USD$/i, "").replace(/\.P$/i, "");
      const entryPrice = parseFloat(sig.entryPrice);
      hyperliquidPlaceOrder.mutate(
        { symbol: hlSym, isBuy: dir === "LONG", size: parseFloat(qty), price: entryPrice, leverage: 10 },
        { onSuccess: (data) => {
            toast.success(`Hyperliquid ${dir} order placed — ${hlSym} (avg: ${data.avgPrice ?? entryPrice})`);
          }, onError: onErr }
      );
    } else if (exchange === "asterdex" && hasAsterdex?.hasKey) {
      asterdexPlaceOrder.mutate(
        { symbol: sym, side: dir === "LONG" ? "BUY" : "SELL", quantity: parseFloat(qty), leverage: 10 },
        { onSuccess: (data) => {
            if (data.success) toast.success(`AsterDEX ${dir} order placed — ${sym}`);
            else toast.error(`AsterDEX order failed: ${data.error}`);
          }, onError: onErr }
      );
    } else if (exchange === "bybit" && hasBybit?.hasKey) {
      bybitPlaceOrder.mutate(
        { symbol: sym, side: dir === "LONG" ? "Buy" : "Sell", qty, leverage: 10 },
        { onSuccess: () => toast.success(`${exName} ${dir} order placed — ${sym}`), onError: onErr }
      );
    } else if (exchange === "okx" && hasOkx?.hasKey) {
      okxPlaceOrder.mutate(
        { symbol: sym, side: dir === "LONG" ? "buy" : "sell", sz: qty, leverage: 10 },
        { onSuccess: () => toast.success(`${exName} ${dir} order placed — ${sym}`), onError: onErr }
      );
    } else if (hasBinance?.hasKey) {
      binancePlaceOrder.mutate(
        { symbol: sym, side: dir === "LONG" ? "BUY" : "SELL", quantity: parseFloat(qty), leverage: 10 },
        { onSuccess: () => toast.success(`Binance ${dir} order placed — ${sym}`), onError: onErr }
      );
    } else if (hasAsterdex?.hasKey) {
      // Fallback: use AsterDEX if no CEX key matches the signal exchange
      asterdexPlaceOrder.mutate(
        { symbol: sym, side: dir === "LONG" ? "BUY" : "SELL", quantity: parseFloat(qty), leverage: 10 },
        { onSuccess: (data) => {
            if (data.success) toast.success(`AsterDEX ${dir} order placed — ${sym}`);
            else toast.error(`AsterDEX order failed: ${data.error}`);
          }, onError: onErr }
      );
    } else {
      toast.info("Connect an exchange API key to execute trades", {
        action: { label: "Setup", onClick: () => { window.location.href = "/binance-setup"; } },
      });
    }
  }, [hasBinance, hasBybit, hasOkx, hasAsterdex, hasHyperliquid, binancePlaceOrder, bybitPlaceOrder, okxPlaceOrder, asterdexPlaceOrder, hyperliquidPlaceOrder]);

  const signals: LiveSignal[] = (signalsData ?? []) as LiveSignal[];
  const filteredSignals = signals.filter(s =>
    signalFilter === "long" ? s.direction === "LONG" :
    signalFilter === "short" ? s.direction === "SHORT" : true
  );
  const pendingSignals = signals.filter(s => s.outcome === "pending");
  const notifications = (notificationsData ?? []) as Record<string, unknown>[];
  const stats = statsData as Record<string, number> | undefined;
  const winRate = stats ? Math.round((stats.hitTp / Math.max(stats.total, 1)) * 100) : 0;
  const totalSignals = stats?.total ?? 0;
  const avgRR = stats?.avgRR ?? "—";

  const topSignal = pendingSignals.length > 0
    ? [...pendingSignals].sort((a, b) => b.confidence - a.confidence)[0]
    : null;

  // Compute unrealised PnL from AsterDEX positions
  const asterdexUnrealisedPnl = (() => {
    const posArr = asterdexPositions.data?.positions as { unrealizedProfit?: string; unRealizedProfit?: string }[] | undefined;
    if (!posArr || posArr.length === 0) return 0;
    return posArr.reduce((sum, p) => {
      const pnl = parseFloat(p.unrealizedProfit ?? p.unRealizedProfit ?? "0");
      return sum + (isNaN(pnl) ? 0 : pnl);
    }, 0);
  })();

  const sidebarLeftProps = {
    topSignal, activeTab, setActiveTab, pendingSignals,
    hasBinance, hasBybit, hasOkx, hasMexc: !!hasMexc, hasKucoin: !!hasKucoin,
    hasGateio: !!hasGateio, hasBitget: !!hasBitget, hasAsterdex: !!hasAsterdex, isConnected,
    hasHyperliquid: !!hasHyperliquid?.hasKey,
    winRate, avgRR: String(avgRR), totalSignals, positions,
    asterdexBalance: asterdexBalance.data,
    asterdexBalanceLoading: asterdexBalance.isLoading,
    asterdexBalanceError: !!asterdexBalance.error,
    asterdexPositionCount: (asterdexPositions.data?.positions as unknown[])?.length ?? 0,
    asterdexLastUpdated: asterdexBalance.dataUpdatedAt,
    asterdexUnrealisedPnl,
    onRefreshAsterdex: () => { void asterdexBalance.refetch(); void asterdexPositions.refetch(); },
    // Asset Deck data
    hyperliquidBalance: hyperliquidAccount.data ? String(hyperliquidAccount.data.withdrawable) : null,
    hyperliquidAccountValue: hyperliquidAccount.data ? String(hyperliquidAccount.data.accountValue) : null,
    hyperliquidPositionCount: hyperliquidAccount.data?.positions?.length ?? 0,
    hyperliquidPnl: hyperliquidAccount.data?.positions?.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl), 0) ?? 0,
    binanceBalanceData: binanceBalance.data,
    binancePositionCount: (binancePositions.data?.positions as unknown[])?.length ?? 0,
    binancePnl: (binancePositions.data?.positions as { unrealizedProfit?: string }[] | undefined)?.reduce((sum, p) => sum + parseFloat(p.unrealizedProfit ?? "0"), 0) ?? 0,
    bybitBalanceData: bybitBalance.data,
    bybitPositionCount: (bybitPositions.data?.positions as unknown[])?.length ?? 0,
    bybitPnl: (bybitPositions.data?.positions as { unrealizedPnl?: string }[] | undefined)?.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl ?? "0"), 0) ?? 0,
    okxBalanceData: okxBalance.data,
    okxPositionCount: (okxPositions.data?.positions as unknown[])?.length ?? 0,
    okxPnl: (okxPositions.data?.positions as { unrealizedPnl?: string }[] | undefined)?.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl ?? "0"), 0) ?? 0,
  };
  const sidebarRightProps = { positions, notifications, stats, winRate, totalSignals, setActiveTab };

  return (
    <div className="min-h-screen bg-[#080a0c] text-zinc-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Navbar />

      {/* ── DESKTOP LAYOUT (md+) ── */}
      <div className="hidden md:flex" style={{ height: "calc(100vh - 64px)", marginTop: "64px" }}>
        {/* Left Sidebar */}
        <aside className="w-48 lg:w-56 flex-shrink-0 bg-[#0c0f12] border-r border-zinc-800/60 overflow-y-auto">
          <SidebarLeft {...sidebarLeftProps} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-[#0a0d10]">
          {/* Tab Bar */}
          <div className="sticky top-0 z-10 bg-[#0a0d10] border-b border-zinc-800/60 px-5 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {([
              ["signals","Live Signals"],
              ["scanner","Deep Scanner"],
              ["finder","AI Setup Finder"],
              ["stats","Stats"],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  activeTab === id ? "text-white border-white" : "text-zinc-500 border-transparent hover:text-zinc-300"
                }`}>{label}</button>
            ))}
            {/* Gem Finder is spot-only — link out to dedicated page */}
            <a href="/gem-finder" className="px-4 py-3.5 text-sm font-semibold border-b-2 border-transparent text-zinc-500 hover:text-emerald-400 whitespace-nowrap flex items-center gap-1.5">
              <Gem className="w-3.5 h-3.5" /> Gem Finder <span className="text-[9px] text-emerald-500/70 bg-emerald-500/10 px-1 rounded">SPOT</span>
            </a>
            <div className="ml-auto flex items-center gap-2 py-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> AI Live
              </div>
              <button onClick={() => refetchSignals()} className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <MainContent activeTab={activeTab} filteredSignals={filteredSignals} signalFilter={signalFilter}
            setSignalFilter={setSignalFilter} signalsLoading={signalsLoading} refetchSignals={refetchSignals}
            onExecute={handleExecute} hasHyperliquid={!!hasHyperliquid?.hasKey} gems={gems} gemsLoading={gemsLoading} loadGems={loadGems}
            stats={stats} winRate={winRate} totalSignals={totalSignals} avgRR={String(avgRR)} positions={positions} />
        </main>

        {/* Right Sidebar */}
        <aside className="w-64 lg:w-72 flex-shrink-0 bg-[#0c0f12] border-l border-zinc-800/60 overflow-y-auto">
          <SidebarRight {...sidebarRightProps} />
        </aside>
      </div>

      {/* ── MOBILE LAYOUT ── */}
      <div className="md:hidden" style={{ marginTop: "64px" }}>
        {/* Mobile Tab Bar */}
        <div className="sticky top-16 z-10 bg-[#0a0d10] border-b border-zinc-800/60 flex items-center overflow-x-auto scrollbar-none">
          {([
            ["signals","Signals"],
            ["scanner","Scanner"],
            ["finder","AI Finder"],
            ["stats","Stats"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
                activeTab === id ? "text-white border-white" : "text-zinc-500 border-transparent"
              }`}>{label}</button>
          ))}
          <a href="/gem-finder" className="px-4 py-3 text-sm font-semibold border-b-2 border-transparent text-zinc-500 whitespace-nowrap flex items-center gap-1">
            Gems <span className="text-[9px] text-emerald-500/70">SPOT</span>
          </a>
        </div>

        {/* Mobile Action Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40 bg-[#0c0f12]">
          <button onClick={() => { setLeftOpen(true); setRightOpen(false); }}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors min-h-[40px]">
            <PanelLeft className="w-3.5 h-3.5" /> Tools
            {pendingSignals.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> AI Live
            <button onClick={() => refetchSignals()} className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <button onClick={() => { setRightOpen(true); setLeftOpen(false); }}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors min-h-[40px]">
            Positions <PanelRight className="w-3.5 h-3.5" />
            {positions.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
          </button>
        </div>

        {/* Mobile Main Content */}
        <div className="min-h-screen bg-[#0a0d10]">
          <MainContent activeTab={activeTab} filteredSignals={filteredSignals} signalFilter={signalFilter}
            setSignalFilter={setSignalFilter} signalsLoading={signalsLoading} refetchSignals={refetchSignals}
            onExecute={handleExecute} hasHyperliquid={!!hasHyperliquid?.hasKey} gems={gems} gemsLoading={gemsLoading} loadGems={loadGems}
            stats={stats} winRate={winRate} totalSignals={totalSignals} avgRR={String(avgRR)} positions={positions}
            isMobile />
        </div>

        {/* Mobile Left Drawer */}
        {leftOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="w-72 max-w-[85vw] bg-[#0c0f12] border-r border-zinc-800/60 overflow-y-auto">
              <div className="flex items-center justify-between p-3 border-b border-zinc-800/60">
                <span className="text-sm font-semibold text-white">Tools & Navigation</span>
                <button onClick={() => setLeftOpen(false)} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SidebarLeft {...sidebarLeftProps} setActiveTab={(t) => { setActiveTab(t); setLeftOpen(false); }} />
            </div>
            <div className="flex-1 bg-black/60" onClick={() => setLeftOpen(false)} />
          </div>
        )}

        {/* Mobile Right Drawer */}
        {rightOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="flex-1 bg-black/60" onClick={() => setRightOpen(false)} />
            <div className="w-80 max-w-[90vw] bg-[#0c0f12] border-l border-zinc-800/60 overflow-y-auto">
              <div className="flex items-center justify-between p-3 border-b border-zinc-800/60">
                <span className="text-sm font-semibold text-white">Positions & Alerts</span>
                <button onClick={() => setRightOpen(false)} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SidebarRight {...sidebarRightProps} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Content Panel (shared desktop/mobile) ─── */
function MainContent({
  activeTab, filteredSignals, signalFilter, setSignalFilter, signalsLoading, refetchSignals,
  onExecute, hasHyperliquid, gems, gemsLoading, loadGems, stats, winRate, totalSignals, avgRR, positions, isMobile = false
}: {
  activeTab: DashTab;
  filteredSignals: LiveSignal[];
  signalFilter: "all" | "long" | "short";
  setSignalFilter: (f: "all" | "long" | "short") => void;
  signalsLoading: boolean;
  refetchSignals: () => void;
  onExecute: (s: LiveSignal) => void;
  hasHyperliquid?: boolean;
  gems: GemResult[];
  gemsLoading: boolean;
  loadGems: () => void;
  stats: Record<string, number> | undefined;
  winRate: number;
  totalSignals: number;
  avgRR: string;
  positions: Record<string, string | number>[];
  isMobile?: boolean;
}) {
  // hasHyperliquid is passed as prop
  return (
    <div className="p-4 flex flex-col gap-5">

      {/* LIVE SIGNALS */}
      {activeTab === "signals" && (
        <div>
          {/* Filter row */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-zinc-500 font-medium">Filter:</span>
            {(["all","long","short"] as const).map(f => (
              <button key={f} onClick={() => setSignalFilter(f)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors font-medium min-h-[36px] ${
                  signalFilter === f ? "border-zinc-500 bg-zinc-800 text-white" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}>{f.toUpperCase()}</button>
            ))}
            <span className="ml-auto text-xs text-zinc-600 font-mono">{filteredSignals.length} signals</span>
          </div>

          {signalsLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-600">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading signals…
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
              <Activity className="w-8 h-8" />
              <p className="text-sm text-center">No signals yet — the AI is scanning markets continuously.</p>
              <button onClick={() => refetchSignals()}
                className="text-xs px-4 py-2.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors min-h-[40px]">
                Refresh
              </button>
            </div>
          ) : isMobile ? (
            /* Mobile: card layout */
            <div className="flex flex-col gap-3">
              {filteredSignals.map(sig => <SignalCard key={sig.id} sig={sig} onExecute={onExecute} hasHyperliquid={hasHyperliquid} />)}
            </div>
          ) : (
            /* Desktop: table layout */
            <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
              <div className="bg-zinc-900/40 px-4 py-2.5 border-b border-zinc-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> Live Entry Signals
                </div>
                <span className="text-xs text-zinc-600 font-mono">auto-refresh 60s</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800/60">
                      {["Pair","Dir","Entry","Target","Stop","R/R","Confidence","Exchange","Valid For","Trade Taken","Execute"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSignals.map(sig => <SignalRow key={sig.id} sig={sig} onExecute={onExecute} hasHyperliquid={hasHyperliquid} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {activeTab === "scanner" && (
        <div>
          <p className="text-xs text-zinc-500 mb-4">Real-time scan across Binance, Bybit, OKX, Hyperliquid, AsterDEX, dYdX, and GMX — scored on volume, funding rate, and momentum.</p>
          <MultiExchangeScanner />
        </div>
      )}

      {activeTab === "finder" && (
        <div>
          <p className="text-xs text-zinc-500 mb-4">AI analyses live candle data across multiple strategies and finds the single highest-probability trade available right now.</p>
          <AiSetupFinder />
        </div>
      )}

      {activeTab === "stats" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            ["Total Signals",  totalSignals,                       "text-sky-400"],
            ["Win Rate",       winRate > 0 ? `${winRate}%` : "—", "text-emerald-400"],
            ["TP Hits",        stats?.hitTp ?? "—",                "text-emerald-400"],
            ["SL Hits",        stats?.hitSl ?? "—",                "text-red-400"],
            ["Pending",        stats?.pending ?? "—",              "text-yellow-400"],
            ["Avg R/R",        avgRR !== "—" ? `${avgRR}:1` : "—","text-zinc-300"],
            ["Open Positions", positions.length,                   "text-zinc-300"],
            ["Exchanges",      "7",                                "text-zinc-300"],
          ] as const).map(([label, value, cls]) => (
            <div key={label} className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className={`font-mono text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
          <div className="col-span-2 lg:col-span-4 rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Full AI Stats</p>
            <p className="text-sm text-zinc-400 mb-3">View confidence trend charts, daily outcome breakdown, and 30-day win rate history on the dedicated AI Stats page.</p>
            <Link href="/ai-stats" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 px-4 py-2.5 rounded transition-colors min-h-[44px]">
              Open AI Stats <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
