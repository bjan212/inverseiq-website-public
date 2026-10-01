import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Settings, Save, Shield, Bell, Wallet, Zap,
  Mail, MessageSquare, Globe, Loader2, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

const EXCHANGES = [
  { value: "binance", label: "Binance", quote: "USDT" },
  { value: "bybit", label: "Bybit", quote: "USDT" },
  { value: "okx", label: "OKX", quote: "USDT" },
  { value: "hyperliquid", label: "Hyperliquid", quote: "USDC" },
  { value: "asterdex", label: "AsterDEX", quote: "USDT" },
];

export default function UserSettings() {
  const { user, loading: authLoading } = useAuth();

  // Settings state
  const [defaultExchange, setDefaultExchange] = useState("binance");
  const [defaultLeverage, setDefaultLeverage] = useState(10);
  const [defaultPositionSizePct, setDefaultPositionSizePct] = useState(10);
  const [defaultOrderType, setDefaultOrderType] = useState("market");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [enableEmail, setEnableEmail] = useState(true);
  const [enableTelegram, setEnableTelegram] = useState(false);
  const [enableBrowserNotifications, setEnableBrowserNotifications] = useState(true);
  const [futuresAlertThreshold, setFuturesAlertThreshold] = useState(75);
  const [spotAlertThreshold, setSpotAlertThreshold] = useState(80);
  const [autoStopLossPct, setAutoStopLossPct] = useState(0);
  const [badEntryFilter, setBadEntryFilter] = useState<"hide" | "deprioritize" | "show">("deprioritize");
  const [asterBalanceAlertEnabled, setAsterBalanceAlertEnabled] = useState(false);
  const [asterBalanceAlertFloor, setAsterBalanceAlertFloor] = useState(0);

  // Fetch existing settings
  const { data: settings, isLoading } = trpc.userSettings.get.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30_000,
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      setDefaultExchange(settings.defaultExchange || "binance");
      setDefaultLeverage(settings.defaultLeverage || 10);
      setDefaultPositionSizePct(settings.defaultPositionSizePct || 10);
      setDefaultOrderType(settings.defaultOrderType || "market");
      setNotifyEmail(settings.notifyEmail || "");
      setTelegramChatId(settings.telegramChatId || "");
      setEnableEmail(!!settings.enableEmail);
      setEnableTelegram(!!settings.enableTelegram);
      setEnableBrowserNotifications(!!settings.enableBrowserNotifications);
      setFuturesAlertThreshold(settings.futuresAlertThreshold || 75);
      setSpotAlertThreshold(settings.spotAlertThreshold || 80);
      setAutoStopLossPct(settings.autoStopLossPct || 0);
      setBadEntryFilter((settings as any).badEntryFilter || "deprioritize");
      setAsterBalanceAlertEnabled(!!(settings as any).asterBalanceAlertEnabled);
      setAsterBalanceAlertFloor((settings as any).asterBalanceAlertFloor || 0);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = trpc.userSettings.save.useMutation({
    onSuccess: () => toast.success("Settings saved successfully!"),
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const handleSave = () => {
    saveMutation.mutate({
      defaultExchange,
      defaultLeverage,
      defaultPositionSizePct,
      defaultOrderType,
      notifyEmail: notifyEmail || undefined,
      telegramChatId: telegramChatId || undefined,
      enableEmail,
      enableTelegram,
      enableBrowserNotifications,
      futuresAlertThreshold,
      spotAlertThreshold,
      autoStopLossPct,
      badEntryFilter,
      asterBalanceAlertEnabled,
      asterBalanceAlertFloor,
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Navbar />
        <main className="flex-grow flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Navbar />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <Shield className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">Please sign in to access settings.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-grow py-8">
        <div className="container max-w-3xl mx-auto px-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-orbitron text-2xl font-bold">User Settings</h1>
              <p className="text-sm text-zinc-500">Configure your default trading preferences and alert notifications</p>
            </div>
          </div>

          {/* Exchange Preferences Section */}
          <section className="mb-8 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Wallet className="w-5 h-5 text-cyan-400" />
              <h2 className="font-rajdhani text-lg font-bold text-zinc-200">Exchange Preferences</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Default Exchange */}
              <div>
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">Default Exchange</label>
                <select
                  value={defaultExchange}
                  onChange={(e) => setDefaultExchange(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm text-zinc-200 focus:border-primary focus:outline-none"
                >
                  {EXCHANGES.map((ex) => (
                    <option key={ex.value} value={ex.value}>
                      {ex.label} ({ex.quote})
                    </option>
                  ))}
                </select>
              </div>

              {/* Default Leverage */}
              <div>
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                  Default Leverage: <span className="text-primary font-bold">{defaultLeverage}x</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={125}
                    value={defaultLeverage}
                    onChange={(e) => setDefaultLeverage(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <input
                    type="number"
                    min={1}
                    max={125}
                    value={defaultLeverage}
                    onChange={(e) => setDefaultLeverage(Math.min(125, Math.max(1, Number(e.target.value))))}
                    className="w-16 rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-sm text-center text-zinc-200 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Default Position Size % */}
              <div>
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                  Default Position Size: <span className="text-emerald-400 font-bold">{defaultPositionSizePct}%</span> of balance
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={defaultPositionSizePct}
                    onChange={(e) => setDefaultPositionSizePct(Number(e.target.value))}
                    className="flex-1 accent-emerald-400"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={defaultPositionSizePct}
                    onChange={(e) => setDefaultPositionSizePct(Math.min(100, Math.max(1, Number(e.target.value))))}
                    className="w-16 rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-sm text-center text-zinc-200 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Default Order Type */}
              <div>
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">Default Order Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDefaultOrderType("market")}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                      defaultOrderType === "market"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 inline mr-1.5" />
                    Market
                  </button>
                  <button
                    onClick={() => setDefaultOrderType("limit")}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                      defaultOrderType === "limit"
                        ? "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 inline mr-1.5" />
                    Limit
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Alert Configuration Section */}
          <section className="mb-8 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Bell className="w-5 h-5 text-amber-400" />
              <h2 className="font-rajdhani text-lg font-bold text-zinc-200">Alert Configuration</h2>
            </div>

            <div className="space-y-5">
              {/* Email */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                    <Mail className="w-3.5 h-3.5 inline mr-1" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="pt-6">
                  <button
                    onClick={() => setEnableEmail(!enableEmail)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      enableEmail ? "bg-primary" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        enableEmail ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Telegram */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                    <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                    Telegram Chat ID
                  </label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="e.g. 123456789"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Get your chat ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener" className="text-primary hover:underline">@userinfobot</a> on Telegram
                  </p>
                </div>
                <div className="pt-6">
                  <button
                    onClick={() => setEnableTelegram(!enableTelegram)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      enableTelegram ? "bg-violet-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        enableTelegram ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Browser Notifications */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-zinc-300">Browser Notifications</span>
                </div>
                <button
                  onClick={() => setEnableBrowserNotifications(!enableBrowserNotifications)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    enableBrowserNotifications ? "bg-blue-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      enableBrowserNotifications ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Alert Thresholds Section */}
          <section className="mb-8 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Zap className="w-5 h-5 text-emerald-400" />
              <h2 className="font-rajdhani text-lg font-bold text-zinc-200">Alert Thresholds</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Futures Alert Threshold */}
              <div>
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                  Futures Signal Threshold: <span className="text-cyan-400 font-bold">{futuresAlertThreshold}%</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={99}
                  value={futuresAlertThreshold}
                  onChange={(e) => setFuturesAlertThreshold(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Only alert when futures signal confidence exceeds this threshold</p>
              </div>

              {/* Spot Alert Threshold */}
              <div>
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                  Spot Gem Threshold: <span className="text-emerald-400 font-bold">{spotAlertThreshold}%</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={99}
                  value={spotAlertThreshold}
                  onChange={(e) => setSpotAlertThreshold(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Only alert when spot gem confidence exceeds this threshold</p>
              </div>

              {/* Auto Stop Loss */}
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-500 font-medium mb-1.5 block">
                  Auto Stop-Loss: <span className={`font-bold ${autoStopLossPct > 0 ? "text-red-400" : "text-zinc-600"}`}>
                    {autoStopLossPct > 0 ? `${autoStopLossPct}% loss` : "Disabled"}
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={autoStopLossPct}
                  onChange={(e) => setAutoStopLossPct(Number(e.target.value))}
                  className="w-full accent-red-400"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Automatically close positions exceeding this loss % (0 = disabled)</p>
              </div>

              <div className="md:col-span-2 rounded-lg border border-zinc-800/60 bg-zinc-950/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">AsterDEX Balance Floor</p>
                    <p className="text-[11px] text-zinc-600">Create an alert when verified AsterDEX account equity falls below your USD floor. Uses your enabled notification channels.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAsterBalanceAlertEnabled(!asterBalanceAlertEnabled)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${asterBalanceAlertEnabled ? "bg-amber-500" : "bg-zinc-700"}`}
                    aria-pressed={asterBalanceAlertEnabled}
                    aria-label="Toggle AsterDEX balance floor alert"
                  >
                    <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${asterBalanceAlertEnabled ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                <label className="mt-3 block text-xs text-zinc-500">
                  Alert floor (USD)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={asterBalanceAlertFloor || ""}
                    disabled={!asterBalanceAlertEnabled}
                    onChange={(event) => setAsterBalanceAlertFloor(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                    placeholder="e.g. 500"
                    className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 focus:border-amber-400 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Signal Quality Filter Section */}
          <section className="mb-8 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="w-5 h-5 text-amber-400" />
              <h2 className="font-rajdhani text-lg font-bold text-zinc-200">Signal Quality Filter</h2>
            </div>

            <div>
              <label className="text-xs text-zinc-500 font-medium mb-2 block">
                Bad Entry Handling
              </label>
              <p className="text-[11px] text-zinc-600 mb-3">When the AI flags a signal as a "bad entry" (poor price level), choose how to handle it:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setBadEntryFilter("hide")}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    badEntryFilter === "hide"
                      ? "border-red-500/60 bg-red-500/10 text-red-400"
                      : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-bold mb-1">Hide</div>
                  <div className="text-[10px] text-zinc-500">Block bad entries entirely. Suggest runner-up or wait.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setBadEntryFilter("deprioritize")}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    badEntryFilter === "deprioritize"
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                      : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-bold mb-1">Deprioritize</div>
                  <div className="text-[10px] text-zinc-500">Show with warning badge. Reduce confidence score.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setBadEntryFilter("show")}
                  className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    badEntryFilter === "show"
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                      : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-bold mb-1">Show All</div>
                  <div className="text-[10px] text-zinc-500">No filter. Show every signal regardless of entry quality.</div>
                </button>
              </div>
            </div>
          </section>

          {/* Quick Links */}
          <section className="mb-8 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/binance-setup" className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-3 hover:border-primary/30 transition-colors">
                <span className="text-sm text-zinc-300">Exchange API Keys</span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </Link>
              <Link href="/settings/telegram" className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-3 hover:border-violet-500/30 transition-colors">
                <span className="text-sm text-zinc-300">Telegram Bot</span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </Link>
              <Link href="/settings/notifications" className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-3 hover:border-amber-500/30 transition-colors">
                <span className="text-sm text-zinc-300">Notification Rules</span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </Link>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-6 py-2.5 bg-primary hover:bg-primary/80 text-black font-bold rounded-lg"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
