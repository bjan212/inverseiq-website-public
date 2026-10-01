import { useState, useCallback, useRef, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Gem, Search, TrendingUp, TrendingDown, Zap, Bell, BellOff, ArrowUpDown,
  RefreshCw, ExternalLink, Star, StarOff, Activity, BarChart2,
  Droplets, Target, DollarSign, Clock, Rocket,
  Mail, MessageSquare, Settings, Save, ChevronDown, ChevronUp,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  scanForGems,
  type GemResult,
  type GemScanFilters,
  RISK_PROFILE_INFO,
} from "@/lib/gemScanner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPrice(price: number) {
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01)   return price.toFixed(6);
  if (price < 1)      return price.toFixed(4);
  return price.toFixed(2);
}

function formatUSD(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000)     return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toFixed(2)}`;
}

/** Estimate time-to-target based on potentialGain and recent momentum */
function estimateTimeToTarget(gem: GemResult): string {
  const gain = gem.potentialGain;
  const momentum = gem.recoveryMomentum;
  const spike = gem.volumeSpike;

  // Base days: higher gain = longer time, but high momentum/spike = faster
  const baseDays = gain / 5; // 5% per day baseline
  const momentumFactor = 1 - (momentum / 200); // 0.5 – 1.0
  const spikeFactor = 1 - Math.min(0.4, (spike - 1) * 0.1);
  const days = Math.max(1, Math.round(baseDays * momentumFactor * spikeFactor));

  if (days <= 1)  return "1–3 days";
  if (days <= 3)  return "2–5 days";
  if (days <= 7)  return "1–2 weeks";
  if (days <= 14) return "2–4 weeks";
  if (days <= 30) return "1–2 months";
  return "2–3 months";
}

// ─── Gem Score Bar ─────────────────────────────────────────────────────────────
function GemScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 55 ? "bg-yellow-500" : "bg-orange-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-bold w-8 text-right">{score.toFixed(0)}</span>
    </div>
  );
}

// ─── Investment Projection Row ─────────────────────────────────────────────────
function InvestmentProjection({ gem, investAmount }: { gem: GemResult; investAmount: number }) {
  if (!investAmount || investAmount <= 0) return null;

  const coinsYouGet = investAmount / gem.price;
  const valueAtTarget = coinsYouGet * gem.targetPrice;
  const profitUSD = valueAtTarget - investAmount;
  const profitPct = gem.potentialGain;
  const timeEst = estimateTimeToTarget(gem);

  return (
    <div className="border border-primary/20 bg-primary/5 rounded-xl p-3 mt-1">
      <p className="text-[9px] text-primary uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
        <DollarSign className="w-3 h-3" /> Your Investment Projection
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] text-muted-foreground uppercase">You Invest</p>
          <p className="text-sm font-mono font-bold text-foreground">{formatUSD(investAmount)}</p>
          <p className="text-[9px] text-muted-foreground">{coinsYouGet.toFixed(2)} coins</p>
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground uppercase">Potential Profit</p>
          <p className="text-sm font-mono font-bold text-green-400">+{formatUSD(profitUSD)}</p>
          <p className="text-[9px] text-green-500">+{profitPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-0.5">
            <Clock className="w-2.5 h-2.5" /> Est. Time
          </p>
          <p className="text-xs font-bold text-cyan-400">{timeEst}</p>
          <p className="text-[9px] text-muted-foreground">to target</p>
        </div>
      </div>
    </div>
  );
}

// ─── Gem Card ─────────────────────────────────────────────────────────────────
function GemCard({
  gem,
  isWatched,
  onWatch,
  onAlert,
  alertEnabled,
  investAmount,
}: {
  gem: GemResult;
  isWatched: boolean;
  onWatch: (symbol: string) => void;
  onAlert: (gem: GemResult) => void;
  alertEnabled: boolean;
  investAmount: number;
}) {
  const riskColor = gem.riskLevel === "VERY_HIGH" ? "border-red-500/40 bg-red-500/5"
    : gem.riskLevel === "HIGH" ? "border-orange-500/40 bg-orange-500/5"
    : gem.riskLevel === "MEDIUM" ? "border-yellow-500/40 bg-yellow-500/5"
    : "border-green-500/40 bg-green-500/5";

  const riskLabel = gem.riskLevel === "VERY_HIGH" ? { text: "Very High Risk", color: "text-red-400" }
    : gem.riskLevel === "HIGH" ? { text: "High Risk", color: "text-orange-400" }
    : gem.riskLevel === "MEDIUM" ? { text: "Medium Risk", color: "text-yellow-400" }
    : { text: "Low Risk", color: "text-green-400" };

  return (
    <div className={`relative rounded-xl border ${riskColor} p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors duration-200`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold tracking-tight text-lg text-foreground">{gem.symbol.replace("/USDT", "")}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riskLabel.color} border-current`}>
              {riskLabel.text}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/50">
              {gem.exchange}
            </Badge>
            {gem.isTrending && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-500/40 bg-yellow-500/10">
                🔥 Trending{gem.trendingRank ? ` #${gem.trendingRank}` : ""}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground mt-0.5">{gem.reason}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onAlert(gem)}
            className={`p-1.5 rounded-lg border transition-colors ${alertEnabled ? "border-primary/50 text-primary bg-primary/10" : "border-border/40 text-muted-foreground hover:text-primary"}`}
            title={alertEnabled ? "Alerts on" : "Enable alert"}
          >
            {alertEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onWatch(gem.symbol)}
            className={`p-1.5 rounded-lg border transition-colors ${isWatched ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : "border-border/40 text-muted-foreground hover:text-yellow-400"}`}
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
          >
            {isWatched ? <Star className="w-3.5 h-3.5 fill-yellow-400" /> : <StarOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Price row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Price</p>
          <p className="font-mono font-bold text-base text-foreground">${formatPrice(gem.price)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">24h</p>
          <p className={`font-mono font-bold text-sm ${gem.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
            {gem.priceChange24h >= 0 ? "+" : ""}{gem.priceChange24h.toFixed(2)}%
          </p>
        </div>
        {gem.priceChange7d !== undefined && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">7d</p>
            <p className={`font-mono font-bold text-sm ${gem.priceChange7d >= 0 ? "text-green-400" : "text-red-400"}`}>
              {gem.priceChange7d >= 0 ? "+" : ""}{gem.priceChange7d.toFixed(1)}%
            </p>
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="text-[10px] text-muted-foreground uppercase">Upside</p>
          <p className="font-mono font-bold text-sm text-primary">+{gem.potentialGain.toFixed(1)}%</p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Dip Depth</span>
            <span className="text-[10px] font-mono text-red-400">{gem.dipDepth.toFixed(1)}%</span>
          </div>
          <GemScoreBar score={Math.min(100, gem.dipDepth * 2)} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Recovery</span>
            <span className="text-[10px] font-mono text-green-400">{gem.recoveryMomentum.toFixed(0)}/100</span>
          </div>
          <GemScoreBar score={gem.recoveryMomentum} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><BarChart2 className="w-3 h-3" /> Vol Spike</span>
            <span className="text-[10px] font-mono text-blue-400">{gem.volumeSpike.toFixed(1)}x</span>
          </div>
          <GemScoreBar score={Math.min(100, gem.volumeSpike * 15)} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Liquidity</span>
            <span className="text-[10px] font-mono text-cyan-400">{gem.liquidityScore.toFixed(0)}/100</span>
          </div>
          <GemScoreBar score={gem.liquidityScore} />
        </div>
      </div>

      {/* Gem score */}
      <div className="border-t border-border/20 pt-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
            <Gem className="w-3 h-3 text-primary" /> Gem Score
          </span>
          <span className={`text-xs font-mono font-bold ${gem.gemScore >= 75 ? "text-green-400" : gem.gemScore >= 55 ? "text-yellow-400" : "text-orange-400"}`}>
            {gem.gemScore.toFixed(0)} / 100
          </span>
        </div>
        <GemScoreBar score={gem.gemScore} />
      </div>

      {/* Entry zone + target + stop */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="bg-background/30 rounded-lg p-2 border border-border/20">
          <p className="text-[9px] text-muted-foreground uppercase">Entry Zone</p>
          <p className="text-[10px] font-mono text-foreground">${formatPrice(gem.entryZone.low)}</p>
          <p className="text-[9px] text-muted-foreground">–</p>
          <p className="text-[10px] font-mono text-foreground">${formatPrice(gem.entryZone.high)}</p>
        </div>
        <div className="bg-green-500/5 rounded-lg p-2 border border-green-500/20">
          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-0.5"><Target className="w-2.5 h-2.5" />Target</p>
          <p className="text-[11px] font-mono font-bold text-green-400">${formatPrice(gem.targetPrice)}</p>
          <p className="text-[9px] text-green-500">+{gem.potentialGain.toFixed(1)}%</p>
        </div>
        <div className="bg-red-500/5 rounded-lg p-2 border border-red-500/20">
          <p className="text-[9px] text-muted-foreground uppercase">Stop Loss</p>
          <p className="text-[11px] font-mono font-bold text-red-400">${formatPrice(gem.stopLoss)}</p>
        </div>
      </div>

      {/* Investment projection */}
      <InvestmentProjection gem={gem} investAmount={investAmount} />

      {/* Tags */}
      {gem.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {gem.tags.map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* VP + Sentiment row */}
      {(gem.vpBias || gem.sentimentBias) && (
        <div className="flex gap-2 flex-wrap">
          {gem.vpBias && (
            <div className="flex items-center gap-1 text-[9px] px-2 py-1 rounded-md border bg-background/30 border-border/30">
              <span className="text-zinc-500">VP:</span>
              <span className={gem.vpBias === "bullish" ? "text-emerald-400" : gem.vpBias === "bearish" ? "text-red-400" : "text-zinc-400"}>
                {gem.vpBias === "bullish" ? "▲ Bullish" : gem.vpBias === "bearish" ? "▼ Bearish" : "→ Neutral"}
              </span>
              {gem.priceVsPoc && <span className="text-zinc-600">· Price {gem.priceVsPoc} POC</span>}
            </div>
          )}
          {gem.sentimentBias && (
            <div className="flex items-center gap-1 text-[9px] px-2 py-1 rounded-md border bg-background/30 border-border/30">
              <span className="text-zinc-500">Sentiment:</span>
              <span className={gem.sentimentBias === "bullish" ? "text-emerald-400" : gem.sentimentBias === "bearish" ? "text-red-400" : "text-zinc-400"}>
                {gem.sentimentLabel ?? gem.sentimentBias}
              </span>
              {gem.fearGreedValue !== undefined && (
                <span className="text-zinc-600">· F&amp;G {gem.fearGreedValue}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Volume + Trade link */}
      <div className="flex justify-between text-[10px] text-muted-foreground border-t border-border/20 pt-2">
        <span>24h Vol: <span className="text-foreground font-mono">{formatUSD(gem.volume24h)}</span></span>
        <a
          href={`https://www.bybit.com/trade/usdt/${gem.symbol.replace("/", "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
        >
          Trade on Bybit <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Embedded Notification Panel ──────────────────────────────────────────────
function GemAlertPanel({ alerts, onClear }: { alerts: string[]; onClear: () => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full space-y-2 pointer-events-none">
      {alerts.slice(-3).map((msg, i) => (
        <div
          key={i}
          className="pointer-events-auto bg-background/95 border border-primary/40 rounded-xl p-3 shadow-[0_0_20px_rgba(0,240,255,0.2)] flex items-start gap-3"
        >
          <Gem className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground flex-1">{msg}</p>
        </div>
      ))}
      {alerts.length > 0 && (
        <button
          onClick={onClear}
          className="pointer-events-auto w-full text-[10px] text-muted-foreground hover:text-foreground text-center py-1"
        >
          Clear alerts
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GemFinder() {
  const [investAmount, setInvestAmount] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [gems, setGems] = useState<GemResult[]>([]);
  const [lastScanned, setLastScanned] = useState<Date | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [gemAlerts, setGemAlerts] = useState<Set<string>>(new Set());
  const [alertMessages, setAlertMessages] = useState<string[]>([]);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"profit" | "time">("profit");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { user } = useAuth();
  const [isEnriching, setIsEnriching] = useState(false);

  // Alert settings panel state
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [alertMinConfidence, setAlertMinConfidence] = useState(80);
  const [alertEnableEmail, setAlertEnableEmail] = useState(false);
  const [alertEnableTelegram, setAlertEnableTelegram] = useState(false);
  const [alertEnableBrowser, setAlertEnableBrowser] = useState(true);
  const [alertTelegramChatId, setAlertTelegramChatId] = useState("");
  const [alertScanInterval, setAlertScanInterval] = useState(60);
  const [isSavingAlertPrefs, setIsSavingAlertPrefs] = useState(false);

  const saveNotificationMutation = trpc.notifications.save.useMutation();
  const enrichGemsMutation = trpc.gemFinder.enrichGems.useMutation();
  const saveAlertPrefsMutation = trpc.gemFinder.saveAlertPreferences.useMutation();
  const sendTestAlertMutation = trpc.gemFinder.sendTestAlert.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Test alert sent! Check your email/Telegram.");
      } else {
        toast.error(data.error || "Failed to send test alert");
      }
    },
    onError: (err) => toast.error(`Test alert failed: ${err.message}`),
  });
  const { data: alertPrefs, isLoading: alertPrefsLoading } = trpc.gemFinder.getAlertPreferences.useQuery(undefined, { enabled: !!user });

  // Hydrate alert settings from DB
  useEffect(() => {
    if (alertPrefs) {
      setAlertMinConfidence(alertPrefs.minConfidence ?? 80);
      setAlertEnableEmail(alertPrefs.enableEmail === 1);
      setAlertEnableTelegram(alertPrefs.enableTelegram === 1);
      setAlertEnableBrowser(alertPrefs.enableBrowser === 1);
      setAlertTelegramChatId(alertPrefs.telegramChatId || "");
      setAlertScanInterval(alertPrefs.scanIntervalMinutes ?? 60);
    }
  }, [alertPrefs]);

  const handleSaveAlertPrefs = async () => {
    setIsSavingAlertPrefs(true);
    try {
      await saveAlertPrefsMutation.mutateAsync({
        minConfidence: alertMinConfidence,
        enableEmail: alertEnableEmail,
        enableTelegram: alertEnableTelegram,
        enableBrowser: alertEnableBrowser,
        telegramChatId: alertEnableTelegram ? alertTelegramChatId : undefined,
        scanIntervalMinutes: alertScanInterval,
      });
      toast.success("Alert preferences saved! You'll be notified when gems exceed your threshold.");
    } catch {
      toast.error("Failed to save alert preferences");
    } finally {
      setIsSavingAlertPrefs(false);
    }
  };

  const { data: savedWatchlist } = trpc.gems.getWatchlist.useQuery(undefined, { enabled: !!user });
  const { data: savedAlerts } = trpc.gems.getAlertSymbols.useQuery(undefined, { enabled: !!user });
  const addToWatchlistMutation = trpc.gems.addToWatchlist.useMutation();
  const removeFromWatchlistMutation = trpc.gems.removeFromWatchlist.useMutation();
  const toggleAlertMutation = trpc.gems.toggleAlert.useMutation();

  useEffect(() => {
    if (savedWatchlist) setWatchlist(new Set(savedWatchlist.map((w: any) => w.symbol)));
  }, [savedWatchlist]);

  useEffect(() => {
    if (savedAlerts) setGemAlerts(new Set(savedAlerts));
  }, [savedAlerts]);

  const runScan = useCallback(async () => {
    setIsScanning(true);
    try {
      // Scan broadly — show the best coins worth considering
      const filters: GemScanFilters = {
        riskAppetite: "HIGH",
        maxResults: 30,
      };
      const results = await scanForGems(filters);
      setGems(results);
      setLastScanned(new Date());

      // Enrich top gems with VP + sentiment in background
      if (results.length > 0) {
        setIsEnriching(true);
        try {
          const symbols = results.slice(0, 20).map(g => g.symbol);
          const enriched = await enrichGemsMutation.mutateAsync({ symbols });
          const enrichMap = new Map(enriched.map((e: any) => [e.symbol, e]));
          setGems(prev => prev.map(g => {
            const e = enrichMap.get(g.symbol);
            if (!e) return g;
            return {
              ...g,
              sentimentScore: e.sentimentScore,
              sentimentLabel: e.sentimentLabel,
              sentimentBias: e.sentimentBias,
              fearGreedValue: e.fearGreedValue,
              fearGreedLabel: e.fearGreedLabel,
              isTrending: e.isTrending,
              trendingRank: e.trendingRank,
              vpBias: e.vpBias,
              vpScore: e.vpScore,
              poc: e.poc,
              vah: e.vah,
              val: e.val,
              priceVsPoc: e.priceVsPoc,
              sentimentBoost: e.sentimentBoost,
              gemScore: Math.min(100, Math.max(0, g.gemScore + (e.sentimentBoost ?? 0))),
            };
          }));
        } catch {
          // Non-critical enrichment
        } finally {
          setIsEnriching(false);
        }
      }

      // Fire alerts for watched gems
      const newAlerts: string[] = [];
      for (const gem of results) {
        if (gemAlerts.has(gem.symbol)) {
          const msg = `💎 ${gem.symbol} — Gem Score ${gem.gemScore.toFixed(0)}/100 · ${gem.reason}`;
          newAlerts.push(msg);
          saveNotificationMutation.mutate({
            type: "system",
            title: `Gem Alert: ${gem.symbol}`,
            message: msg,
            metadata: JSON.stringify({ symbol: gem.symbol, gemScore: gem.gemScore }),
          });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`💎 Gem Alert: ${gem.symbol}`, { body: gem.reason, icon: "/favicon.ico" });
          }
        }
      }
      if (newAlerts.length > 0) {
        setAlertMessages(prev => [...prev, ...newAlerts]);
        toast.success(`${newAlerts.length} gem alert${newAlerts.length > 1 ? "s" : ""} triggered!`);
      }

      if (results.length === 0) {
        toast.info("No gems found right now. Markets may be flat — try again later.");
      } else {
        toast.success(`Found ${results.length} potential gems!`);
      }
    } catch {
      toast.error("Scan failed. Check your connection and try again.");
    } finally {
      setIsScanning(false);
    }
  }, [gemAlerts, saveNotificationMutation, enrichGemsMutation]);

  // Auto-scan on first load so user immediately sees results
  const hasScannedRef = useRef(false);
  useEffect(() => {
    if (!hasScannedRef.current) {
      hasScannedRef.current = true;
      runScan();
    }
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(runScan, 5 * 60 * 1000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, runScan]);

  const toggleWatch = (symbol: string) => {
    const gem = gems.find(g => g.symbol === symbol);
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
        toast.info(`Removed ${symbol} from watchlist`);
        if (user) removeFromWatchlistMutation.mutate({ symbol });
      } else {
        next.add(symbol);
        toast.success(`Added ${symbol} to watchlist`);
        if (user && gem) {
          addToWatchlistMutation.mutate({
            symbol,
            exchange: gem.exchange,
            riskLevel: gem.riskLevel,
            gemScore: Math.round(gem.gemScore),
            priceAtAdd: String(gem.price),
          });
        }
      }
      return next;
    });
  };

  const toggleAlert = (gem: GemResult) => {
    const willEnable = !gemAlerts.has(gem.symbol);
    if (user) toggleAlertMutation.mutate({ symbol: gem.symbol, enabled: willEnable });
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setGemAlerts(prev => {
      const next = new Set(prev);
      if (next.has(gem.symbol)) {
        next.delete(gem.symbol);
        toast.info(`Alert disabled for ${gem.symbol}`);
      } else {
        next.add(gem.symbol);
        toast.success(`Alert enabled for ${gem.symbol}`);
      }
      return next;
    });
  };

  // Derive numeric days for sorting (mirrors estimateTimeToTarget logic)
  function gemEstimatedDays(gem: GemResult): number {
    const baseDays = gem.potentialGain / 5;
    const momentumFactor = 1 - (gem.recoveryMomentum / 200);
    const spikeFactor = 1 - Math.min(0.4, (gem.volumeSpike - 1) * 0.1);
    return Math.max(1, baseDays * momentumFactor * spikeFactor);
  }

  const filteredGems = showWatchlistOnly ? gems.filter(g => watchlist.has(g.symbol)) : gems;
  const displayedGems = [...filteredGems].sort((a, b) =>
    sortBy === "profit"
      ? b.potentialGain - a.potentialGain
      : gemEstimatedDays(a) - gemEstimatedDays(b)
  );
  const parsedInvest = parseFloat(investAmount.replace(/[^0-9.]/g, "")) || 0;

  // Total portfolio projection if user splits investment equally across all gems
  const totalPotentialProfit = parsedInvest > 0 && displayedGems.length > 0
    ? displayedGems.reduce((sum, g) => {
        const perGem = parsedInvest / displayedGems.length;
        return sum + (perGem * g.potentialGain / 100);
      }, 0)
    : 0;

  return (
    <PageWrapper><div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/30 bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Gem className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold tracking-tight text-xl text-foreground">GEM FINDER</h1>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">SPOT ONLY</span>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Spot market gems in dips — <a href="/scanner" className="text-cyan-500 hover:text-cyan-400">Futures Scanner →</a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastScanned && (
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                Last scan: {lastScanned.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={`text-[10px] px-2 py-1 rounded-lg border transition-colors uppercase ${autoRefresh ? "border-primary/50 text-primary bg-primary/10" : "border-border/40 text-muted-foreground hover:text-primary"}`}
            >
              {autoRefresh ? "Auto ON" : "Auto OFF"}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">

        {/* ── Investment + Search Panel ─────────────────────────────────────── */}
        <div className="bg-card/30 border border-border/30 rounded-2xl p-6 space-y-5">
          {/* Investment amount field */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              Investment Amount (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
              <input
                type="number"
                min="0"
                placeholder="e.g. 1000"
                value={investAmount}
                onChange={e => setInvestAmount(e.target.value)}
                className="w-full bg-background/50 border border-border/40 rounded-xl pl-7 pr-4 py-3 text-foreground font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Enter how much you're willing to invest to see projected profit and estimated time to target on each gem.
            </p>
          </div>

          {/* Search button */}
          <Button
            onClick={runScan}
            disabled={isScanning}
            className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/80 text-black shadow-[0_0_24px_rgba(0,240,255,0.35)] rounded-xl"
          >
            {isScanning ? (
              <>
                <Activity className="w-5 h-5 mr-2 animate-pulse" />
                SCANNING ALL MARKETS...
              </>
            ) : (
              <>
                <Search className="w-5 h-5 mr-2" />
                FIND SPOT GEMS NOW
              </>
            )}
          </Button>
        </div>

        {/* ── Background Alert Settings ──────────────────────────────────── */}
        {user && (
          <div className="bg-card/30 border border-border/30 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowAlertSettings(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-card/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-violet-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Background Gem Alerts</p>
                  <p className="text-[10px] text-muted-foreground">Get notified via Email & Telegram when gems exceed your confidence threshold</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {alertPrefs?.isEnabled ? (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/30">ACTIVE</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">OFF</span>
                )}
                {showAlertSettings ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {showAlertSettings && (
              <div className="px-6 pb-6 pt-2 border-t border-border/20 space-y-5">
                {/* Confidence Threshold */}
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Minimum Confidence Threshold
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={alertMinConfidence}
                      onChange={e => setAlertMinConfidence(Number(e.target.value))}
                      className="flex-1 h-2 rounded-full appearance-none bg-zinc-700 accent-violet-500"
                    />
                    <span className="text-lg font-mono font-bold text-violet-400 w-14 text-right">{alertMinConfidence}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Only notify when gem score is at or above this threshold</p>
                </div>

                {/* Scan Interval */}
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Scan Interval
                  </label>
                  <Select value={String(alertScanInterval)} onValueChange={v => setAlertScanInterval(Number(v))}>
                    <SelectTrigger className="w-full bg-background/50 border-border/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Every 30 minutes</SelectItem>
                      <SelectItem value="60">Every 1 hour</SelectItem>
                      <SelectItem value="120">Every 2 hours</SelectItem>
                      <SelectItem value="240">Every 4 hours</SelectItem>
                      <SelectItem value="360">Every 6 hours</SelectItem>
                      <SelectItem value="720">Every 12 hours</SelectItem>
                      <SelectItem value="1440">Once a day</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">How often the scanner runs in the background (even when you leave the site)</p>
                </div>

                {/* Notification Channels */}
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Notification Channels</label>

                  {/* Email */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/30 border border-border/20">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-blue-400" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Email Notifications</p>
                        <p className="text-[10px] text-muted-foreground">Receive gem alerts to your email</p>
                      </div>
                    </div>
                    <Switch checked={alertEnableEmail} onCheckedChange={setAlertEnableEmail} />
                  </div>

                  {/* Telegram */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-background/30 border border-border/20">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-cyan-400" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Telegram Notifications</p>
                          <p className="text-[10px] text-muted-foreground">Receive gem alerts via Telegram bot</p>
                        </div>
                      </div>
                      <Switch checked={alertEnableTelegram} onCheckedChange={setAlertEnableTelegram} />
                    </div>
                    {alertEnableTelegram && (
                      <div className="ml-7">
                        <input
                          type="text"
                          placeholder="Your Telegram Chat ID"
                          value={alertTelegramChatId}
                          onChange={e => setAlertTelegramChatId(e.target.value)}
                          className="w-full bg-background/50 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-500/60"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Start our bot <a href="https://t.me/XryptTrade_Bot" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">@XryptTrade_Bot</a> and send /start — your Chat ID will be linked automatically</p>
                      </div>
                    )}
                  </div>

                  {/* Browser */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/30 border border-border/20">
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 text-amber-400" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Browser Notifications</p>
                        <p className="text-[10px] text-muted-foreground">Push notifications when you're on the site</p>
                      </div>
                    </div>
                    <Switch checked={alertEnableBrowser} onCheckedChange={setAlertEnableBrowser} />
                  </div>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveAlertPrefs}
                  disabled={isSavingAlertPrefs || (!alertEnableEmail && !alertEnableTelegram && !alertEnableBrowser)}
                  className="w-full h-12 font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl"
                >
                  {isSavingAlertPrefs ? (
                    <><Activity className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" /> Save Alert Preferences</>
                  )}
                </Button>

                {/* Send Test Alert Button */}
                <Button
                  variant="outline"
                  onClick={() => sendTestAlertMutation.mutate()}
                  disabled={sendTestAlertMutation.isPending || (!alertEnableEmail && !alertEnableTelegram)}
                  className="w-full h-10 font-bold border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 rounded-xl"
                >
                  {sendTestAlertMutation.isPending ? (
                    <><Activity className="w-4 h-4 mr-2 animate-spin" /> Sending Test...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Send Test Alert</>
                  )}
                </Button>
                {(!alertEnableEmail && !alertEnableTelegram) && (
                  <p className="text-[10px] text-center text-amber-400">Enable at least one notification channel to send a test alert</p>
                )}

                <p className="text-[10px] text-center text-muted-foreground">
                  The scanner runs in the background on our servers. You'll receive alerts even if you close the browser.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Portfolio Projection Banner ───────────────────────────────────── */}
        {parsedInvest > 0 && displayedGems.length > 0 && (
          <div className="bg-gradient-to-r from-primary/10 to-emerald-500/10 border border-primary/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Portfolio Projection</h3>
              <span className="text-[10px] text-muted-foreground">— if you split {formatUSD(parsedInvest)} equally across all {displayedGems.length} gems</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Total Invested</p>
                <p className="text-2xl font-mono font-bold text-foreground">{formatUSD(parsedInvest)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Potential Total Profit</p>
                <p className="text-2xl font-mono font-bold text-green-400">+{formatUSD(totalPotentialProfit)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Per Gem</p>
                <p className="text-2xl font-mono font-bold text-cyan-400">{formatUSD(parsedInvest / displayedGems.length)}</p>
                <p className="text-[10px] text-muted-foreground">each</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty / Scanning States ───────────────────────────────────────── */}
        {!isScanning && gems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
              <Gem className="w-10 h-10 text-primary/50" />
            </div>
            <h3 className="font-bold text-xl text-muted-foreground mb-2">FIND YOUR NEXT GEM</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Click <strong className="text-foreground">Find Spot Gems Now</strong> to scan the market for the best coins worth considering. Optionally enter an investment amount to see projected profits.
            </p>
          </div>
        )}

        {isScanning && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 animate-pulse">
              <Gem className="w-10 h-10 text-primary" />
            </div>
            <h3 className="font-bold text-xl text-foreground mb-2">SCANNING MARKETS</h3>
            <p className="text-sm text-muted-foreground">Analyzing Bybit spot market for the best opportunities...</p>
            <div className="mt-4 w-48">
              <Progress value={undefined} className="h-1 animate-pulse" />
            </div>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────────── */}
        {!isScanning && displayedGems.length > 0 && (
          <>
            {/* Results toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground">
                  {displayedGems.length} Gem{displayedGems.length !== 1 ? "s" : ""} Found
                </span>
                {isEnriching && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Activity className="w-3 h-3 animate-pulse text-primary" /> Enriching with sentiment...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sort dropdown */}
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as "profit" | "time")}>
                    <SelectTrigger className="h-8 text-xs border-border/50 bg-background/50 w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profit">Highest Potential Profit</SelectItem>
                      <SelectItem value="time">Shortest Time to Target</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <button
                  onClick={() => setShowWatchlistOnly(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
                    showWatchlistOnly ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : "border-border/40 text-muted-foreground hover:text-yellow-400"
                  }`}
                >
                  <Star className="w-3.5 h-3.5" />
                  Watchlist ({watchlist.size})
                </button>
                <button onClick={runScan} disabled={isScanning} className="text-muted-foreground hover:text-primary transition-colors p-2">
                  <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Gems grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedGems.map(gem => (
                <GemCard
                  key={`${gem.exchange}-${gem.symbol}`}
                  gem={gem}
                  isWatched={watchlist.has(gem.symbol)}
                  onWatch={toggleWatch}
                  onAlert={toggleAlert}
                  alertEnabled={gemAlerts.has(gem.symbol)}
                  investAmount={parsedInvest}
                />
              ))}
            </div>
          </>
        )}

        {/* Watchlist empty state */}
        {!isScanning && showWatchlistOnly && displayedGems.length === 0 && gems.length > 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Star className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No gems in your watchlist yet. Click the ☆ on any gem to add it.</p>
          </div>
        )}
      </div>

      <GemAlertPanel alerts={alertMessages} onClear={() => setAlertMessages([])} />
    </div></PageWrapper>
  );
}
