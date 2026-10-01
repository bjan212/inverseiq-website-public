/**
 * Auto Trades Tab — Automated trading loop UI
 * Scan → Execute → Monitor → Repeat
 */
import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Bot, Play, Square, Settings2, TrendingUp, TrendingDown,
  Clock, DollarSign, Activity, Zap, Shield, AlertTriangle,
  BarChart2, RefreshCw, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AUTO_TRADER_START_CONFIRMATION, AUTO_TRADER_STOP_CONFIRMATION } from "@shared/const";
import { AUTO_TRADER_MARGIN_PERCENT } from "@shared/autoTraderMargin";

export default function AutoTradesTab() {
  // ─── Settings State ─────────────────────────────────────────────────────────
  const [leverage, setLeverage] = useState(0); // 0 = Auto (Max available per asset)
  const [maxConcurrent, setMaxConcurrent] = useState(1);
  const [maxDailyTrades, setMaxDailyTrades] = useState(10);
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [minConfidence, setMinConfidence] = useState(88);
  const [telegramNotify, setTelegramNotify] = useState(true);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(0);
  const [excludeSymbols, setExcludeSymbols] = useState("");
  const [onlySymbols, setOnlySymbols] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // ─── tRPC Queries ───────────────────────────────────────────────────────────
  const statusQuery = trpc.autoTrader.status.useQuery(undefined, {
    refetchInterval: 5000, // Poll every 5s when active
  });
  const historyQuery = trpc.autoTrader.history.useQuery({ limit: 20 });
  const calibrationQuery = trpc.autoTrader.calibration.useQuery({ days: 30 }, {
    refetchInterval: 60_000,
  });

  const startMutation = trpc.autoTrader.start.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        if ("recoveryTaskRecreated" in data && data.recoveryTaskRecreated) {
          toast.success("Auto Trader started and its durable recovery task was recreated.");
        } else {
          toast.success("Auto Trader started! Scanning for eligible signals...");
        }
        statusQuery.refetch();
      } else {
        toast.error(data.error || "Failed to start");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const stopMutation = trpc.autoTrader.stop.useMutation({
    onSuccess: () => {
      toast.success("Auto Trader stopped");
      statusQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Load saved settings from status
  useEffect(() => {
    if (statusQuery.data?.settings) {
      const s = statusQuery.data.settings;
      if (s.leverage !== undefined && s.leverage !== null) setLeverage(s.leverage); // 0 = auto max
      if (s.maxConcurrent) setMaxConcurrent(s.maxConcurrent);
      if (s.maxDailyTrades !== undefined && s.maxDailyTrades !== null) setMaxDailyTrades(s.maxDailyTrades);
      if (s.cooldownSeconds) setCooldownSeconds(s.cooldownSeconds);
      if (s.minConfidence !== undefined && s.minConfidence !== null) setMinConfidence(Math.max(88, s.minConfidence));
      if (s.telegramNotify !== undefined && s.telegramNotify !== null) setTelegramNotify(!!s.telegramNotify);
      if (s.maxDrawdownPct !== undefined && s.maxDrawdownPct !== null) setMaxDrawdownPct(s.maxDrawdownPct);
      if (s.excludeSymbols) setExcludeSymbols(s.excludeSymbols);
      if (s.onlySymbols) setOnlySymbols(s.onlySymbols);
    }
  }, [statusQuery.data?.settings]);

  const isRunning = statusQuery.data?.isRunning ?? false;
  const isRequestedActive = Boolean(statusQuery.data?.settings?.isActive);
  const workerState = statusQuery.data?.workerState ?? "stopped";
  const currentStatus = statusQuery.data?.settings?.currentStatus ?? "idle";
  const currentSymbol = statusQuery.data?.settings?.currentSymbol;
  const currentDirection = statusQuery.data?.settings?.currentDirection;
  const dailyPnl = parseFloat(statusQuery.data?.settings?.dailyPnl ?? "0");
  const totalPnl = parseFloat(statusQuery.data?.settings?.totalPnl ?? "0");
  const tradesToday = statusQuery.data?.tradesToday ?? 0;

  // Scan status fields
  const lastScanAt = statusQuery.data?.settings?.lastScanAt;
  const lastScanSymbol = statusQuery.data?.settings?.lastScanSymbol;
  const lastScanCount = statusQuery.data?.settings?.lastScanCount;
  const lastDeepScanCount = statusQuery.data?.settings?.lastDeepScanCount;
  const lastUnavailableCount = statusQuery.data?.settings?.lastUnavailableCount;
  const lastAvailableBalance = statusQuery.data?.settings?.lastAvailableBalance;
  const lastCalculatedMargin = statusQuery.data?.settings?.lastCalculatedMargin;
  const lastScanBest = statusQuery.data?.settings?.lastScanBest;
  const workerHeartbeatAt = statusQuery.data?.settings?.workerHeartbeatAt;
  const lastWorkerError = statusQuery.data?.settings?.lastWorkerError;
  const lastRecoveryAt = statusQuery.data?.settings?.lastRecoveryAt;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleStart = () => {
    const confirmed = window.confirm(
      "Start the live Hyperliquid Auto Trader? It can open leveraged positions when an 88–100 A/A+ evidence setup passes every protection gate.",
    );
    if (!confirmed) return;
    startMutation.mutate({
      confirmation: AUTO_TRADER_START_CONFIRMATION,
      marginPercent: AUTO_TRADER_MARGIN_PERCENT,
      leverage,
      maxConcurrent,
      maxDailyTrades,
      cooldownSeconds,
      minConfidence,
      exchange: "hyperliquid",
      telegramNotify,
      maxDrawdownPct,
      excludeSymbols,
      onlySymbols,
    });
  };

  const handleStop = () => {
    const confirmed = window.confirm(
      "Stop the live Hyperliquid Auto Trader? Scanning and durable recovery will be disabled until you explicitly start it again.",
    );
    if (!confirmed) return;
    stopMutation.mutate({ confirmation: AUTO_TRADER_STOP_CONFIRMATION });
  };

  // ─── Status Indicator ───────────────────────────────────────────────────────
  const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    idle: { color: "text-zinc-500", label: "Idle", icon: <Clock className="w-3.5 h-3.5" /> },
    scanning: { color: "text-cyan-400", label: "Scanning...", icon: <Activity className="w-3.5 h-3.5 animate-pulse" /> },
    executing: { color: "text-amber-400", label: "Executing...", icon: <Zap className="w-3.5 h-3.5 animate-bounce" /> },
    in_position: { color: "text-emerald-400", label: "In Position", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    cooldown: { color: "text-violet-400", label: "Cooldown", icon: <Clock className="w-3.5 h-3.5" /> },
    error: { color: "text-red-400", label: "Error", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  };
  const activeStatus = statusConfig[currentStatus] ?? statusConfig.idle;

  // ─── History Stats ──────────────────────────────────────────────────────────
  const historyStats = useMemo(() => {
    const trades = historyQuery.data ?? [];
    const closed = trades.filter(t => t.outcome !== "open");
    const wins = closed.filter(t => t.outcome === "tp_hit");
    const losses = closed.filter(t => t.outcome === "sl_hit");
    const totalPnlFromHistory = closed.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
    return {
      total: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : "0",
      totalPnl: totalPnlFromHistory.toFixed(2),
    };
  }, [historyQuery.data]);

  return (
    <div className="space-y-6">
      {/* ── Header + Master Switch ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/40">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isRunning ? "bg-emerald-500/20 border border-emerald-500/40" : isRequestedActive ? "bg-amber-500/20 border border-amber-500/40" : "bg-zinc-800 border border-zinc-700"}`}>
            <Bot className={`w-5 h-5 ${isRunning ? "text-emerald-400" : isRequestedActive ? "text-amber-400" : "text-zinc-500"}`} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Auto Trader <span className="text-[10px] font-mono font-normal text-cyan-400">HL USDC PERPS</span></h2>
            <div className={`flex items-center gap-1.5 text-xs ${activeStatus.color}`}>
              {activeStatus.icon}
              <span className="font-mono">{activeStatus.label}</span>
              {currentSymbol && (
                <span className="ml-2 text-white font-bold">{currentSymbol} {currentDirection}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isRequestedActive ? (
            <Button
              onClick={handleStart}
              disabled={startMutation.isPending}
              className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-5 py-2 rounded-xl"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {startMutation.isPending ? "Starting..." : "Start"}
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              disabled={stopMutation.isPending}
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold px-5 py-2 rounded-xl"
            >
              <Square className="w-4 h-4 mr-1.5" />
              {stopMutation.isPending ? "Stopping..." : "Stop"}
            </Button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-xl border transition-all ${showSettings ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400" : "border-zinc-700 text-zinc-400 hover:text-white"}`}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Live Stats Bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Trades Today</p>
          <p className="text-lg font-bold text-white font-mono">{tradesToday}</p>
        </div>
        <div className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Daily P&L</p>
          <p className={`text-lg font-bold font-mono ${dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}
          </p>
        </div>
        <div className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Total P&L</p>
          <p className={`text-lg font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </p>
        </div>
        <div className="p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Win Rate</p>
          <p className="text-lg font-bold text-white font-mono">{historyStats.winRate}%</p>
        </div>
      </div>

      {/* ── Scan Status Panel ─────────────────────────────────────────────── */}
      {isRequestedActive && (
        <div className="p-4 rounded-2xl border border-cyan-500/20 bg-cyan-950/20 space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">Live Scan Status</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Currently Scanning</p>
              <p className="text-sm font-bold text-white font-mono">
                {currentStatus === "scanning" && lastScanSymbol ? lastScanSymbol : "Idle"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Last Scan</p>
              <p className="text-sm font-bold text-white font-mono">
                {lastScanAt ? formatDistanceToNow(new Date(lastScanAt), { addSuffix: true }) : "Never"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">All Pairs Considered</p>
              <p className="text-sm font-bold text-white font-mono">
                {lastScanCount ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Deep Analyzed</p>
              <p className="text-sm font-bold text-white font-mono">
                {lastDeepScanCount ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Data Unavailable</p>
              <p className={`text-sm font-bold font-mono ${(lastUnavailableCount ?? 0) > 0 ? "text-amber-400" : "text-white"}`}>
                {lastUnavailableCount ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Best Signal</p>
              <p className={`text-sm font-bold font-mono ${lastScanBest?.startsWith("SKIP:") ? "text-amber-400" : "text-emerald-400"}`}>
                {lastScanBest ?? "—"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-cyan-500/10 pt-3">
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Worker</p>
              <p className={`text-xs font-bold font-mono ${isRunning ? "text-emerald-400" : "text-amber-400"}`}>
                {isRunning ? "Healthy / immediate queued rescan + rotating deep scan" : workerState === "recovery_pending" ? "Recovering after restart" : workerState}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Worker Heartbeat</p>
              <p className="text-xs font-bold text-white font-mono">
                {workerHeartbeatAt ? formatDistanceToNow(new Date(workerHeartbeatAt), { addSuffix: true }) : "Awaiting first cycle"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Recovery Check</p>
              <p className="text-xs font-bold text-white font-mono">
                {lastRecoveryAt ? formatDistanceToNow(new Date(lastRecoveryAt), { addSuffix: true }) : "Scheduled after start"}
              </p>
            </div>
          </div>
          {lastWorkerError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 font-mono break-words">
              Worker diagnostic: {lastWorkerError}
            </p>
          )}
        </div>
      )}

      {/* ── Settings Panel ─────────────────────────────────────────────────── */}
      {showSettings && (
        <div className="p-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 space-y-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-cyan-400" />
            Trading Parameters
          </h3>

          <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-violet-300 font-mono">Shadow Calibration · 30 days</p>
                <p className="text-[10px] text-zinc-500 mt-1">Private observations only; never used automatically to raise a live score.</p>
              </div>
              <span className={`text-[10px] font-bold font-mono ${calibrationQuery.data?.sampleSufficientForAdjustment ? "text-amber-300" : "text-zinc-500"}`}>
                {calibrationQuery.data?.sampleSufficientForAdjustment ? "MANUAL REVIEW REQUIRED" : "COLLECTING EVIDENCE"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-zinc-500 font-mono">Observations</p>
                <p className="text-sm font-bold text-white font-mono">{calibrationQuery.data?.observations ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 font-mono">Resolved TP / SL</p>
                <p className="text-sm font-bold text-white font-mono">{calibrationQuery.data?.resolved ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 font-mono">Observed Mean Score</p>
                <p className="text-sm font-bold text-white font-mono">
                  {calibrationQuery.data?.meanEvidenceScore === null || calibrationQuery.data?.meanEvidenceScore === undefined
                    ? "—"
                    : calibrationQuery.data.meanEvidenceScore.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 font-mono">Live Adjustment</p>
                <p className="text-sm font-bold text-emerald-400 font-mono">LOCKED OFF</p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              The evidence score is measured as observed. It is not forced toward an 85 average and is not presented as a guaranteed win probability. The execution floor remains 88.
            </p>
          </div>

          {/* Row 1: Dynamic Margin + Leverage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2">
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Dynamic Margin Rule</label>
              <p className="text-sm font-bold text-cyan-300 font-mono">{AUTO_TRADER_MARGIN_PERCENT}% of available Hyperliquid USDC</p>
              <p className="text-[10px] text-zinc-500 mt-1">
                Recalculated after all signal gates and immediately before each entry. No fixed-dollar fallback.
              </p>
              <p className="text-[10px] text-zinc-400 mt-1 font-mono">
                Last: {lastCalculatedMargin ? `$${Number(lastCalculatedMargin).toFixed(2)}` : "Awaiting eligible entry"}
                {lastAvailableBalance ? ` from $${Number(lastAvailableBalance).toFixed(2)} available` : ""}
              </p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Leverage</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLeverage(0)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                    leverage === 0
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  AUTO MAX
                </button>
                <input
                  type="range"
                  value={leverage === 0 ? 50 : leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  min={1} max={50} step={1}
                  className="flex-1 accent-cyan-500"
                />
                <span className="text-sm font-bold text-white font-mono w-16 text-right">
                  {leverage === 0 ? "MAX" : `${leverage}x`}
                </span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                {leverage === 0 ? "Uses highest available leverage per asset" : `Fixed ${leverage}x for all trades`}
              </p>
            </div>
          </div>

          {/* Row 2: Min Confidence + Max Daily */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Min Evidence Confidence · 88–100 only</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  min={88} max={100} step={1}
                  className="flex-1 accent-cyan-500"
                />
                <span className="text-sm font-bold text-white font-mono w-14 text-right">{minConfidence}/100</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Max Daily Trades</label>
              <input
                type="number"
                value={maxDailyTrades}
                onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
                min={0} max={100}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-600 mt-1">0 = unlimited</p>
            </div>
          </div>

          {/* Row 3: Cooldown + Max Concurrent */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Cooldown Between Trades (s)</label>
              <input
                type="number"
                value={cooldownSeconds}
                onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                min={10} max={3600}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Max Concurrent Positions</label>
              <input
                type="number"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                min={1} max={3}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Row 4: Symbol Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Only Trade (comma-separated)</label>
              <input
                type="text"
                value={onlySymbols}
                onChange={(e) => setOnlySymbols(e.target.value)}
                placeholder="BTC/USDC, ETH/USDC, SOL/USDC"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Leave empty to trade all</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 font-mono mb-1.5">Exclude Symbols</label>
              <input
                type="text"
                value={excludeSymbols}
                onChange={(e) => setExcludeSymbols(e.target.value)}
                placeholder="DOGE, SHIB"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Row 5: Toggles */}
          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-zinc-800/60">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={telegramNotify} onCheckedChange={setTelegramNotify} />
              <span className="text-xs text-zinc-400">Telegram Notifications</span>
            </label>
          </div>

          {/* Risk Warning */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80">
              Auto trading carries significant risk. The Auto Trader scans Hyperliquid USDC perpetuals only and can execute only on 88–100 A/A+ evidence-confluence setups that pass the server execution-quality gate. Strict v5 microstructure measures continuous directional strength from the existing L2 book, labelled 1m candle-volume flow, extreme funding, and material rising open interest that confirms the preselected technical direction. Opposing evidence is discounted; falling, first-snapshot, missing, or immaterial open interest is neutral and cannot create a short signal. No exchange requests are added. A rejected low-score cycle queues the next scan immediately and starts it when Hyperliquid&apos;s one-minute REST-weight window safely clears; API and worker failures back off. The score ranks setup evidence and is not a guaranteed win probability. New positions require verified exchange-side TP/SL; trailing protection never loosens a stop. Always monitor via Telegram.
            </p>
          </div>
        </div>
      )}

      {/* ── Trade History ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-zinc-400" />
            Recent Auto Trades
          </h3>
          <button
            onClick={() => historyQuery.refetch()}
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {(!historyQuery.data || historyQuery.data.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
            <Bot className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No auto trades yet.</p>
            <p className="text-xs text-zinc-600 mt-1">Start the auto trader to begin.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {historyQuery.data.map((trade) => {
              const isLong = trade.direction === "LONG";
              const pnl = parseFloat(trade.pnl ?? "0");
              const isOpen = trade.outcome === "open";
              const isWin = trade.outcome === "tp_hit";
              const duration = trade.durationSeconds
                ? trade.durationSeconds < 60
                  ? `${trade.durationSeconds}s`
                  : `${Math.floor(trade.durationSeconds / 60)}m`
                : "—";

              return (
                <div
                  key={trade.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 rounded-xl border ${
                    isOpen
                      ? "border-cyan-500/20 bg-cyan-500/5"
                      : isWin
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  {/* Symbol + Direction */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    {isLong
                      ? <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                      : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
                    <span className="font-mono font-bold text-sm text-white">{trade.symbol}</span>
                    <span className={`text-xs font-bold ${isLong ? "text-emerald-400" : "text-red-400"}`}>{trade.direction}</span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    {isOpen ? (
                      <span className="flex items-center gap-1 text-xs text-cyan-400 font-mono">
                        <Activity className="w-3 h-3 animate-pulse" /> OPEN
                      </span>
                    ) : isWin ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                        <CheckCircle2 className="w-3 h-3" /> TP HIT
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-400 font-mono">
                        <XCircle className="w-3 h-3" /> SL HIT
                      </span>
                    )}
                  </div>

                  {/* Entry + P&L */}
                  <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 flex-1">
                    <span>Entry <span className="text-white">${parseFloat(trade.entryPrice).toFixed(2)}</span></span>
                    {!isOpen && (
                      <span className={pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Duration + Confidence */}
                  <div className="flex items-center gap-2 text-xs text-zinc-600 shrink-0">
                    <span className="font-mono">{duration}</span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-zinc-400">{trade.signalConfidence}/100</span>
                    <span className="text-zinc-600">{new Date(trade.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
