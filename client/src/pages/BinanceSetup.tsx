import React, { useState } from "react";
import PageWrapper from "@/components/PageWrapper";
import { HyperliquidPanel } from "./HyperliquidPanel";
import { PrivateHistoryLearningCard } from "@/components/PrivateHistoryLearningCard";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Key,
  RefreshCw,
  Shield,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";

type Exchange = "binance" | "bybit" | "okx" | "mexc" | "kucoin" | "gateio" | "bitget" | "asterdex" | "hyperliquid";

const EXCHANGE_META: Record<Exchange, { label: string; color: string; bgColor: string; borderColor: string; icon: string; docsUrl: string; docsSteps: string[] }> = {
  hyperliquid: {
    label: "Hyperliquid",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    icon: "💧",
    docsUrl: "https://app.hyperliquid.xyz/trade/BTC",
    docsSteps: [
      "Go to app.hyperliquid.xyz and connect your MetaMask wallet",
      "In MetaMask: click three-dot menu → Account Details → Export Private Key",
      "Enter your MetaMask password to reveal the 64-character hex key",
      "Recommended: use a dedicated trading wallet — never your main wallet",
      "Paste the key in the setup panel — it is AES-256 encrypted before storage",
    ],
  },
  asterdex: {
    label: "AsterDEX",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    icon: "⭐",
    docsUrl: "https://www.asterdex.com/en/api-wallet",
    docsSteps: [
      "Go to asterdex.com and connect your Web3 wallet (MetaMask etc.)",
      "Navigate to API Wallet page (asterdex.com/en/api-wallet)",
      "Click \"Create API Wallet\" and approve the transaction",
      "Save the 3 credentials shown: User Address, Signer Address, and Private Key",
      "The Private Key is only shown once — save it immediately",
      "Paste all three values in the fields below and click Save",
      "Note: Legacy API Keys (pre-March 2026) are no longer supported for new creation",
    ],
  },
  binance: {
    label: "Binance",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    icon: "🟡",
    docsUrl: "https://www.binance.com",
    docsSteps: [
      "Log in to Binance.com",
      "Go to Profile → API Management",
      "Click Create API and choose System Generated",
      "Enable Enable Futures permission only (no withdrawals)",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key and Secret and paste them above",
    ],
  },
  bybit: {
    label: "Bybit",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    icon: "🟠",
    docsUrl: "https://www.bybit.com",
    docsSteps: [
      "Log in to Bybit.com",
      "Go to Account → API Management",
      "Click Create New Key",
      "Enable Derivatives / USDT Perpetual trading permissions (no withdrawals)",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key and Secret and paste them above",
    ],
  },
  okx: {
    label: "OKX",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    icon: "🔵",
    docsUrl: "https://www.okx.com",
    docsSteps: [
      "Log in to OKX.com",
      "Go to Account → API Management",
      "Click Create V5 API Key",
      "Set Trade permission only (no withdrawals)",
      "Set a passphrase — you will need it here",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key, Secret, and Passphrase and paste them above",
    ],
  },
  mexc: {
    label: "MEXC",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/30",
    icon: "🟢",
    docsUrl: "https://www.mexc.com",
    docsSteps: [
      "Log in to MEXC.com",
      "Go to Account → API Management",
      "Click Create API Key",
      "Enable Futures trading permission only (no withdrawals)",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key and Secret and paste them above",
    ],
  },
  kucoin: {
    label: "KuCoin",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    icon: "🟩",
    docsUrl: "https://www.kucoin.com",
    docsSteps: [
      "Log in to KuCoin.com",
      "Go to Account → API Management",
      "Click Create API Key",
      "Enable Futures trading permission only (no withdrawals)",
      "Set a passphrase — you will need it here",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key, Secret, and Passphrase and paste them above",
    ],
  },
  gateio: {
    label: "Gate.io",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    icon: "🔴",
    docsUrl: "https://www.gate.io",
    docsSteps: [
      "Log in to Gate.io",
      "Go to Account → API Management",
      "Click Create API Key",
      "Enable Futures trading permission only (no withdrawals)",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key and Secret and paste them above",
    ],
  },
  bitget: {
    label: "Bitget",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    icon: "🔷",
    docsUrl: "https://www.bitget.com",
    docsSteps: [
      "Log in to Bitget.com",
      "Go to Account → API Management",
      "Click Create API Key",
      "Enable Futures trading permission only (no withdrawals)",
      "Set a passphrase — you will need it here",
      "Add IP restriction for extra security (optional but recommended)",
      "Copy the API Key, Secret, and Passphrase and paste them above",
    ],
  },
};

// ─── Binance Panel ────────────────────────────────────────────────────────────
function BinancePanel() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("My Binance API");
  const [isTestnet, setIsTestnet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: keyInfo, refetch: refetchKeyInfo } = trpc.binance.getApiKeyInfo.useQuery();
  const { data: hasKeyData } = trpc.binance.hasApiKey.useQuery();
  const { data: positionsData, refetch: refetchPositions, isLoading: positionsLoading } = trpc.binance.getPositions.useQuery();

  const saveApiKeyMutation = trpc.binance.saveApiKey.useMutation({
    onSuccess: () => { toast.success("Binance API key saved!"); setApiKey(""); setApiSecret(""); setShowForm(false); refetchKeyInfo(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const verifyApiKeyMutation = trpc.binance.verifyApiKey.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(`Verified! Balance: ${parseFloat(data.totalWalletBalance ?? "0").toFixed(2)} USDT`); refetchKeyInfo(); refetchPositions(); }
      else toast.error(`Verification failed: ${data.error}`);
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });
  const removeApiKeyMutation = trpc.binance.removeApiKey.useMutation({
    onSuccess: () => { toast.success("Binance API key removed."); refetchKeyInfo(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const hasKey = hasKeyData?.hasKey ?? false;
  const positions = positionsData?.positions ?? [];
  const meta = EXCHANGE_META.binance;

  return (
    <ExchangePanel
      exchange="binance"
      meta={meta}
      keyInfo={keyInfo ?? null}
      hasKey={hasKey}
      showForm={showForm}
      setShowForm={setShowForm}
      apiKey={apiKey}
      setApiKey={setApiKey}
      apiSecret={apiSecret}
      setApiSecret={setApiSecret}
      label={label}
      setLabel={setLabel}
      isTestnet={isTestnet}
      setIsTestnet={setIsTestnet}
      showSecret={showSecret}
      setShowSecret={setShowSecret}
      onSave={() => { if (!apiKey.trim() || !apiSecret.trim()) { toast.error("Please enter both API key and secret."); return; } saveApiKeyMutation.mutate({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), label, isTestnet }); }}
      onVerify={() => verifyApiKeyMutation.mutate()}
      onRemove={() => removeApiKeyMutation.mutate()}
      isSaving={saveApiKeyMutation.isPending}
      isVerifying={verifyApiKeyMutation.isPending}
      isRemoving={removeApiKeyMutation.isPending}
      positions={positions}
      positionsError={positionsData?.error}
      positionsLoading={positionsLoading}
      onRefreshPositions={refetchPositions}
    />
  );
}

// ─── Bybit Panel ──────────────────────────────────────────────────────────────
function BybitPanel() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("My Bybit API");
  const [isTestnet, setIsTestnet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: keyInfo, refetch: refetchKeyInfo } = trpc.bybit.getApiKeyInfo.useQuery();
  const { data: hasKeyData } = trpc.bybit.hasApiKey.useQuery();

  const saveApiKeyMutation = trpc.bybit.saveApiKey.useMutation({
    onSuccess: () => { toast.success("Bybit API key saved!"); setApiKey(""); setApiSecret(""); setShowForm(false); refetchKeyInfo(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const verifyApiKeyMutation = trpc.bybit.verifyApiKey.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(`Verified! Balance: ${parseFloat(data.totalWalletBalance ?? "0").toFixed(2)} USDT`); refetchKeyInfo(); }
      else toast.error(`Verification failed: ${data.error}`);
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });
  const removeApiKeyMutation = trpc.bybit.removeApiKey.useMutation({
    onSuccess: () => { toast.success("Bybit API key removed."); refetchKeyInfo(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const hasKey = hasKeyData?.hasKey ?? false;
  const meta = EXCHANGE_META.bybit;

  return (
    <ExchangePanel
      exchange="bybit"
      meta={meta}
      keyInfo={keyInfo ?? null}
      hasKey={hasKey}
      showForm={showForm}
      setShowForm={setShowForm}
      apiKey={apiKey}
      setApiKey={setApiKey}
      apiSecret={apiSecret}
      setApiSecret={setApiSecret}
      label={label}
      setLabel={setLabel}
      isTestnet={isTestnet}
      setIsTestnet={setIsTestnet}
      showSecret={showSecret}
      setShowSecret={setShowSecret}
      onSave={() => { if (!apiKey.trim() || !apiSecret.trim()) { toast.error("Please enter both API key and secret."); return; } saveApiKeyMutation.mutate({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), label, isTestnet }); }}
      onVerify={() => verifyApiKeyMutation.mutate()}
      onRemove={() => removeApiKeyMutation.mutate()}
      isSaving={saveApiKeyMutation.isPending}
      isVerifying={verifyApiKeyMutation.isPending}
      isRemoving={removeApiKeyMutation.isPending}
    />
  );
}

// ─── OKX Panel ────────────────────────────────────────────────────────────────
function OKXPanel() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [label, setLabel] = useState("My OKX API");
  const [isTestnet, setIsTestnet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: keyInfo, refetch: refetchKeyInfo } = trpc.okx.getApiKeyInfo.useQuery();
  const { data: hasKeyData } = trpc.okx.hasApiKey.useQuery();

  const saveApiKeyMutation = trpc.okx.saveApiKey.useMutation({
    onSuccess: () => { toast.success("OKX API key saved!"); setApiKey(""); setApiSecret(""); setPassphrase(""); setShowForm(false); refetchKeyInfo(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const verifyApiKeyMutation = trpc.okx.verifyApiKey.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(`Verified! Balance: ${parseFloat(data.totalWalletBalance ?? "0").toFixed(2)} USDT`); refetchKeyInfo(); }
      else toast.error(`Verification failed: ${data.error}`);
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });
  const removeApiKeyMutation = trpc.okx.removeApiKey.useMutation({
    onSuccess: () => { toast.success("OKX API key removed."); refetchKeyInfo(); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const hasKey = hasKeyData?.hasKey ?? false;
  const meta = EXCHANGE_META.okx;

  return (
    <ExchangePanel
      exchange="okx"
      meta={meta}
      keyInfo={keyInfo ?? null}
      hasKey={hasKey}
      showForm={showForm}
      setShowForm={setShowForm}
      apiKey={apiKey}
      setApiKey={setApiKey}
      apiSecret={apiSecret}
      setApiSecret={setApiSecret}
      passphrase={passphrase}
      setPassphrase={setPassphrase}
      label={label}
      setLabel={setLabel}
      isTestnet={isTestnet}
      setIsTestnet={setIsTestnet}
      showSecret={showSecret}
      setShowSecret={setShowSecret}
      onSave={() => {
        if (!apiKey.trim() || !apiSecret.trim()) { toast.error("Please enter both API key and secret."); return; }
        if (!passphrase.trim()) { toast.error("OKX requires a passphrase."); return; }
        saveApiKeyMutation.mutate({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: passphrase.trim(), label, isTestnet });
      }}
      onVerify={() => verifyApiKeyMutation.mutate()}
      onRemove={() => removeApiKeyMutation.mutate()}
      isSaving={saveApiKeyMutation.isPending}
      isVerifying={verifyApiKeyMutation.isPending}
      isRemoving={removeApiKeyMutation.isPending}
    />
  );
}

// ─── Shared Exchange Panel Component ─────────────────────────────────────────
interface ExchangePanelProps {
  exchange: Exchange;
  meta: typeof EXCHANGE_META[Exchange];
  keyInfo: { maskedApiKey: string; label: string; isTestnet: boolean; lastVerifiedAt: Date | null; hasPassphrase?: boolean } | null;
  hasKey: boolean;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  apiKey: string; setApiKey: (v: string) => void;
  apiSecret: string; setApiSecret: (v: string) => void;
  passphrase?: string; setPassphrase?: (v: string) => void;
  label: string; setLabel: (v: string) => void;
  isTestnet: boolean; setIsTestnet: (v: boolean) => void;
  showSecret: boolean; setShowSecret: (v: boolean) => void;
  onSave: () => void;
  onVerify: () => void;
  onRemove: () => void;
  isSaving: boolean;
  isVerifying: boolean;
  isRemoving: boolean;
  positions?: any[];
  positionsError?: string;
  positionsLoading?: boolean;
  onRefreshPositions?: () => void;
  extraInfo?: React.ReactNode;
}

function ExchangePanel({
  exchange, meta, keyInfo, hasKey, showForm, setShowForm,
  apiKey, setApiKey, apiSecret, setApiSecret,
  passphrase, setPassphrase,
  label, setLabel, isTestnet, setIsTestnet,
  showSecret, setShowSecret,
  onSave, onVerify, onRemove,
  isSaving, isVerifying, isRemoving,
  positions, positionsError, positionsLoading, onRefreshPositions, extraInfo,
}: ExchangePanelProps) {
  return (
    <div>
      {/* Current Key Status */}
      {keyInfo ? (
        <div className={`mb-6 p-5 rounded-xl border border-green-500/30 bg-green-500/5`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className=" font-semibold text-green-300">{keyInfo.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{keyInfo.maskedApiKey}</p>
                {keyInfo.lastVerifiedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last verified: {new Date(keyInfo.lastVerifiedAt).toLocaleString()}
                  </p>
                )}
                {keyInfo.hasPassphrase !== undefined && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Passphrase: {keyInfo.hasPassphrase ? "✓ Set" : "⚠ Not set"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {keyInfo.isTestnet && (
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-orange-500/20 text-orange-300 border border-orange-500/30">TESTNET</span>
              )}
              <Button size="sm" variant="outline" onClick={onVerify} disabled={isVerifying} className="border-green-500/30 text-green-300 hover:bg-green-500/10">
                {isVerifying ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Verify
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="border-border/50 text-muted-foreground hover:bg-secondary/50">
                {showForm ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                Update
              </Button>
              <Button size="sm" variant="outline" onClick={onRemove} disabled={isRemoving} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        {extraInfo && (
          <div className="mt-3 pt-3 border-t border-green-500/20">{extraInfo}</div>
        )}
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-xl border border-border/30 bg-secondary/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-muted-foreground" />
            <p className=" text-muted-foreground">No API key configured yet.</p>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className={`${meta.bgColor} ${meta.color} border ${meta.borderColor} hover:opacity-80`}>
            <Key className="w-3 h-3 mr-1" />
            Add API Key
          </Button>
        </div>
      )}

      <PrivateHistoryLearningCard exchange={exchange} connected={hasKey} />

      {/* API Key Form */}
      {(showForm || !hasKey) && (
        <div className="mb-8 p-6 rounded-xl border border-border/30 bg-secondary/10">
          <h2 className="font-bold tracking-tight text-lg text-foreground mb-5">
            {hasKey ? `Update ${meta.label} Key` : `Connect ${meta.label} Futures`}
          </h2>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`My ${meta.label} API`} className="bg-background/50 border-border/50" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">API Key</Label>
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={`Enter your ${meta.label} Futures API key`} className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">API Secret</Label>
              <div className="relative">
                <Input type={showSecret ? "text" : "password"} value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder={`Enter your ${meta.label} Futures API secret`} className="bg-background/50 border-border/50 font-mono text-sm pr-10" />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {setPassphrase !== undefined && (
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Passphrase <span className="text-red-400">*</span> (OKX only)</Label>
                <Input type="password" value={passphrase ?? ""} onChange={(e) => setPassphrase!(e.target.value)} placeholder="Enter your OKX API passphrase" className="bg-background/50 border-border/50 font-mono text-sm" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={isTestnet} onCheckedChange={setIsTestnet} id="testnet-toggle" />
              <Label htmlFor="testnet-toggle" className="text-sm text-muted-foreground cursor-pointer">
                Use Testnet (recommended for testing)
              </Label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={onSave} disabled={isSaving} className={`${meta.bgColor} ${meta.color} border ${meta.borderColor} hover:opacity-80`}>
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                Save & Connect
              </Button>
              {hasKey && (
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border/50">Cancel</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Positions (Binance only) */}
      {hasKey && positions !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 className="font-bold tracking-tight text-lg text-foreground">LIVE POSITIONS</h2>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
            {onRefreshPositions && (
              <Button size="sm" variant="outline" onClick={onRefreshPositions} disabled={positionsLoading} className="border-border/50 text-muted-foreground hover:bg-secondary/50">
                <RefreshCw className={`w-3 h-3 mr-1 ${positionsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
          {positionsError && (
            <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className=" text-red-300 text-sm">{positionsError}</p>
            </div>
          )}
          {positions.length === 0 && !positionsError ? (
            <div className="p-8 rounded-xl border border-border/30 bg-secondary/10 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className=" text-muted-foreground">No open positions found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((pos: any, idx: number) => {
                const posAmt = parseFloat(pos.positionAmt);
                const entryPrice = parseFloat(pos.entryPrice);
                const markPrice = parseFloat(pos.markPrice);
                const unrealizedPnl = parseFloat(pos.unRealizedProfit);
                const isLong = posAmt > 0;
                const pnlPercent = entryPrice > 0 ? ((markPrice - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1) : 0;
                return (
                  <div key={idx} className={`p-4 rounded-xl border ${unrealizedPnl >= 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        {isLong ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold tracking-tight text-foreground">{pos.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-mono ${isLong ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>{isLong ? "LONG" : "SHORT"}</span>
                            <span className="px-2 py-0.5 rounded text-xs font-mono bg-secondary/50 text-muted-foreground border border-border/30">{pos.leverage}x</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Size: {Math.abs(posAmt).toFixed(4)} | Entry: ${entryPrice.toFixed(4)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold tracking-tight text-lg ${unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{unrealizedPnl >= 0 ? "+" : ""}{unrealizedPnl.toFixed(2)} USDT</p>
                        <p className={`text-sm ${pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>{pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%</p>
                        <p className="text-xs text-muted-foreground">Mark: ${markPrice.toFixed(4)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* How to get API key */}
      <div className="mt-8 p-5 rounded-xl border border-border/20 bg-secondary/5">
        <h3 className="font-bold tracking-tight text-sm text-muted-foreground mb-3">HOW TO GET YOUR {meta.label.toUpperCase()} API KEY</h3>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          {meta.docsSteps.map((step, i) => (
            <li key={i}>{i === 0 ? <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className={`${meta.color} hover:underline`}>{step}</a> : step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── AsterDEX Panel ─────────────────────────────────────────────────────────
function AsterDEXPanel() {
  const [userAddress, setUserAddress] = useState("");
  const [signerAddress, setSignerAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [label, setLabel] = useState("My AsterDEX API Wallet");
  const [showSecret, setShowSecret] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Local verification result state — persists between renders
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean;
    availableBalance?: string;
    totalWalletBalance?: string;
    error?: string;
    checkedAt?: Date;
  } | null>(null);

  const { data: keyInfo, refetch: refetchKeyInfo } = trpc.asterdex.getApiKeyInfo.useQuery();
  const { data: hasKeyData } = trpc.asterdex.hasApiKey.useQuery();
  const { data: positionsData, refetch: refetchPositions, isLoading: positionsLoading } = trpc.asterdex.getPositions.useQuery();
  const { data: persistedVerification, refetch: refetchPersistedVerification } = trpc.asterdex.getVerificationState.useQuery();

  const verifyApiKeyMutation = trpc.asterdex.verifyApiKey.useMutation({
    onSuccess: (data) => {
      setVerifyResult({ ...data, checkedAt: new Date() });
      if (data.success) {
        toast.success(`AsterDEX connected — ${parseFloat(data.totalWalletBalance ?? "0").toFixed(2)} USDT`);
        refetchKeyInfo();
        refetchPositions();
        refetchPersistedVerification();
      } else {
        toast.error(`Connection failed: ${data.error}`);
      }
    },
    onError: (err) => {
      setVerifyResult({ success: false, error: err.message, checkedAt: new Date() });
      toast.error(`Verification error: ${err.message}`);
    },
  });

  const saveApiKeyMutation = trpc.asterdex.saveApiKey.useMutation({
    onSuccess: () => {
      toast.success("AsterDEX API Wallet saved — verifying connection...");
      setUserAddress("");
      setSignerAddress("");
      setPrivateKey("");
      setShowForm(false);
      refetchKeyInfo();
      // Auto-verify immediately after save
      setTimeout(() => verifyApiKeyMutation.mutate(), 300);
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const removeApiKeyMutation = trpc.asterdex.removeApiKey.useMutation({
    onSuccess: () => {
      toast.success("AsterDEX API key removed.");
      setVerifyResult(null);
      refetchKeyInfo();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const hasKey = hasKeyData?.hasKey ?? false;
  const positions = positionsData?.positions ?? [];
  const meta = EXCHANGE_META.asterdex;

  // Derive a human-readable hint from the error message
  const errorHint = (msg?: string): string => {
    if (!msg) return "";
    const m = msg.toLowerCase();
    if (m.includes("invalid") || m.includes("signature") || m.includes("-1022") || m.includes("-2014"))
      return "The API key or secret appears to be incorrect. Double-check both values and re-save.";
    if (m.includes("ip") || m.includes("-1003") || m.includes("restricted"))
      return "Your IP is not whitelisted. In AsterDEX API settings, add 146.190.233.46 or remove the IP restriction.";
    if (m.includes("permission") || m.includes("-2015") || m.includes("futures"))
      return "The API key does not have Futures trading permission. Re-create it with Futures enabled.";
    if (m.includes("timeout") || m.includes("econnrefused") || m.includes("network"))
      return "Could not reach AsterDEX. Check your internet connection and try again.";
    return "Check that the key is active and has Futures trading permission on AsterDEX.";
  };

  return (
    <div>
      <PrivateHistoryLearningCard exchange="asterdex" connected={hasKey} />

      {/* ── Verification Status Card ─────────────────────────────────────── */}
      {verifyApiKeyMutation.isPending && (
        <div className="mb-6 p-5 rounded-xl border border-purple-500/30 bg-purple-500/5 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-purple-400 animate-spin shrink-0" />
          <div>
            <p className="font-semibold text-purple-300">Verifying AsterDEX connection…</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sending a signed test request to AsterDEX Futures API</p>
          </div>
        </div>
      )}

      {!verifyApiKeyMutation.isPending && !verifyResult && persistedVerification?.lastVerifiedAt && (
        <div className="mb-6 p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold tracking-tight text-emerald-300">Last Verified AsterDEX Balance</p>
                <p className="text-xs text-muted-foreground mt-0.5">Successful authenticated check: {new Date(persistedVerification.lastVerifiedAt).toLocaleString()}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => verifyApiKeyMutation.mutate()} className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
              <RefreshCw className="w-3 h-3 mr-1" /> Re-check
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-500/20 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Available Balance</p>
              <p className="font-mono font-bold text-xl text-emerald-300">{parseFloat(persistedVerification.availableBalance ?? "0").toFixed(2)}<span className="text-sm font-normal text-muted-foreground ml-1">USDT</span></p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Wallet Balance</p>
              <p className="font-mono font-bold text-xl text-foreground">{parseFloat(persistedVerification.totalBalance ?? "0").toFixed(2)}<span className="text-sm font-normal text-muted-foreground ml-1">USDT</span></p>
            </div>
          </div>
        </div>
      )}

      {!verifyApiKeyMutation.isPending && verifyResult && (
        <div className={`mb-6 p-5 rounded-xl border ${
          verifyResult.success
            ? "border-green-500/40 bg-green-500/5"
            : "border-red-500/40 bg-red-500/5"
        }`}>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {verifyResult.success
                ? <Wifi className="w-5 h-5 text-green-400 shrink-0" />
                : <WifiOff className="w-5 h-5 text-red-400 shrink-0" />}
              <div>
                <p className={`font-bold tracking-tight ${
                  verifyResult.success ? "text-green-300" : "text-red-300"
                }`}>
                  {verifyResult.success ? "Connected & Authenticated" : "Connection Failed"}
                </p>
                {verifyResult.checkedAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    Last checked: {verifyResult.checkedAt.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => verifyApiKeyMutation.mutate()}
              disabled={verifyApiKeyMutation.isPending}
              className={verifyResult.success
                ? "border-green-500/30 text-green-300 hover:bg-green-500/10"
                : "border-red-500/30 text-red-300 hover:bg-red-500/10"}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Re-check
            </Button>
          </div>

          {/* Success: balance details */}
          {verifyResult.success && (
            <div className="mt-4 pt-4 border-t border-green-500/20 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Available Balance</p>
                <p className="font-mono font-bold text-xl text-green-300">
                  {parseFloat(verifyResult.availableBalance ?? "0").toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">USDT</span>
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Wallet Balance</p>
                <p className="font-mono font-bold text-xl text-foreground">
                  {parseFloat(verifyResult.totalWalletBalance ?? "0").toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">USDT</span>
                </p>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400">AsterDEX Futures API is active and ready for programmatic trading</span>
              </div>
            </div>
          )}

          {/* Failure: error + hint */}
          {!verifyResult.success && verifyResult.error && (
            <div className="mt-4 pt-4 border-t border-red-500/20 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 font-mono">{verifyResult.error}</p>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-300">{errorHint(verifyResult.error)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AsterDEX API Wallet Form ────────────────────────────────────────── */}
      {keyInfo ? (
        <div className="mb-6 p-5 rounded-xl border border-green-500/30 bg-green-500/5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className="font-semibold text-green-300">{keyInfo.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{keyInfo.maskedApiKey}</p>
                {keyInfo.lastVerifiedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last verified: {new Date(keyInfo.lastVerifiedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => verifyApiKeyMutation.mutate()} disabled={verifyApiKeyMutation.isPending} className="border-green-500/30 text-green-300 hover:bg-green-500/10">
                {verifyApiKeyMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Verify
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="border-border/50 text-muted-foreground hover:bg-secondary/50">
                {showForm ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                Update
              </Button>
              <Button size="sm" variant="outline" onClick={() => removeApiKeyMutation.mutate()} disabled={removeApiKeyMutation.isPending} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-xl border border-border/30 bg-secondary/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-muted-foreground" />
            <p className="text-muted-foreground">No API Wallet configured yet.</p>
          </div>
          <Button size="sm" onClick={() => setShowForm(true)} className={`${meta.bgColor} ${meta.color} border ${meta.borderColor} hover:opacity-80`}>
            <Wallet className="w-3 h-3 mr-1" />
            Add API Wallet
          </Button>
        </div>
      )}

      {(showForm || !hasKey) && (
        <div className="mb-8 p-6 rounded-xl border border-border/30 bg-secondary/10">
          <h2 className="font-bold tracking-tight text-lg text-foreground mb-5">
            {hasKey ? "Update AsterDEX API Wallet" : "Connect AsterDEX API Wallet"}
          </h2>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My AsterDEX API Wallet" className="bg-background/50 border-border/50" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">User Address <span className="text-xs text-zinc-500">(your main wallet)</span></Label>
              <Input value={userAddress} onChange={(e) => setUserAddress(e.target.value)} placeholder="0x... (your connected wallet address)" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Signer Address <span className="text-xs text-zinc-500">(API wallet address)</span></Label>
              <Input value={signerAddress} onChange={(e) => setSignerAddress(e.target.value)} placeholder="0x... (API wallet signer address)" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Private Key <span className="text-xs text-zinc-500">(API wallet private key)</span></Label>
              <div className="relative">
                <Input type={showSecret ? "text" : "password"} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="API wallet private key (without 0x prefix)" className="bg-background/50 border-border/50 font-mono text-sm pr-10" />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={async () => {
                  if (!userAddress.trim() || !signerAddress.trim() || !privateKey.trim()) {
                    toast.error("Please enter User Address, Signer Address, and Private Key.");
                    return;
                  }
                  // Validate that private key derives to the signer address
                  try {
                    const { ethers } = await import("ethers");
                    const pk = privateKey.trim().startsWith("0x") ? privateKey.trim() : `0x${privateKey.trim()}`;
                    const wallet = new ethers.Wallet(pk);
                    const derivedAddress = wallet.address.toLowerCase();
                    const expectedSigner = signerAddress.trim().toLowerCase();
                    if (derivedAddress !== expectedSigner) {
                      toast.error(`Private key mismatch! The key derives to ${wallet.address.slice(0, 10)}... but your Signer Address is ${signerAddress.trim().slice(0, 10)}... — make sure you're using the API Wallet's private key, not your main wallet's.`);
                      return;
                    }
                  } catch (e: any) {
                    toast.error(`Invalid private key format: ${e.message || "must be a valid hex string"}`);
                    return;
                  }
                  saveApiKeyMutation.mutate({ apiKey: `${userAddress.trim()}:${signerAddress.trim()}`, apiSecret: privateKey.trim(), label });
                }}
                disabled={saveApiKeyMutation.isPending}
                className={`${meta.bgColor} ${meta.color} border ${meta.borderColor} hover:opacity-80`}
              >
                {saveApiKeyMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                Save & Verify
              </Button>
              {hasKey && (
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-border/50 text-muted-foreground">
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* Setup instructions */}
          <div className="mt-6 pt-5 border-t border-border/20">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Setup Guide
            </p>
            <ol className="space-y-2">
              {meta.docsSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className={`w-5 h-5 rounded-full ${meta.bgColor} ${meta.color} flex items-center justify-center text-[10px] font-bold shrink-0`}>{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className={`mt-4 inline-flex items-center gap-1.5 text-xs ${meta.color} hover:underline`}>
              Open AsterDEX API Wallet Page →
            </a>
          </div>
        </div>
      )}

      {/* Positions */}
      {positions.length > 0 && (
        <div className="mt-4 p-4 rounded-xl border border-border/30 bg-secondary/10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Open Positions
            </p>
            <Button size="sm" variant="ghost" onClick={() => refetchPositions()} disabled={positionsLoading}>
              <RefreshCw className={`w-3 h-3 ${positionsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="space-y-2">
            {positions.map((pos: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background/30">
                <div className="flex items-center gap-2">
                  {parseFloat(pos.positionAmt) > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                  <span className="font-mono text-sm font-bold">{pos.symbol}</span>
                </div>
                <div className="text-right">
                  <span className={`font-mono text-sm ${parseFloat(pos.unrealizedProfit) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {parseFloat(pos.unrealizedProfit) >= 0 ? "+" : ""}{parseFloat(pos.unrealizedProfit).toFixed(2)} USDT
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Generic CEX Panel (MEXC, KuCoin, Gate.io, Bitget) ──────────────────────
function GenericCexPanel({ exchange }: { exchange: "mexc" | "kucoin" | "gateio" | "bitget" }) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [label, setLabel] = useState(`My ${EXCHANGE_META[exchange].label} API`);
  const [isTestnet, setIsTestnet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const needsPassphrase = exchange === "kucoin" || exchange === "bitget";

  const hasKeyQuery = (trpc as any)[exchange].hasApiKey.useQuery();
  const keyInfoQuery = (trpc as any)[exchange].getApiKeyInfo.useQuery();
  const saveKey = (trpc as any)[exchange].saveApiKey.useMutation({
    onSuccess: () => { toast.success(`${EXCHANGE_META[exchange].label} API key saved!`); setApiKey(""); setApiSecret(""); setPassphrase(""); setShowForm(false); keyInfoQuery.refetch(); },
    onError: (err: any) => toast.error(`Failed: ${err.message}`),
  });
  const verifyKey = (trpc as any)[exchange].verifyApiKey.useMutation({
    onSuccess: (data: any) => {
      if (data.success) { toast.success(`Verified! Balance: ${parseFloat(data.totalWalletBalance ?? "0").toFixed(2)} USDT`); keyInfoQuery.refetch(); }
      else toast.error(`Verification failed: ${data.error}`);
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`),
  });
  const removeKey = (trpc as any)[exchange].removeApiKey.useMutation({
    onSuccess: () => { toast.success(`${EXCHANGE_META[exchange].label} API key removed.`); keyInfoQuery.refetch(); },
    onError: (err: any) => toast.error(`Failed: ${err.message}`),
  });

  const hasKey = hasKeyQuery.data?.hasKey ?? false;
  const meta = EXCHANGE_META[exchange];

  return (
    <ExchangePanel
      exchange={exchange}
      meta={meta}
      keyInfo={keyInfoQuery.data ?? null}
      hasKey={hasKey}
      showForm={showForm}
      setShowForm={setShowForm}
      apiKey={apiKey} setApiKey={setApiKey}
      apiSecret={apiSecret} setApiSecret={setApiSecret}
      passphrase={needsPassphrase ? passphrase : undefined}
      setPassphrase={needsPassphrase ? setPassphrase : undefined}
      label={label} setLabel={setLabel}
      isTestnet={isTestnet} setIsTestnet={setIsTestnet}
      showSecret={showSecret} setShowSecret={setShowSecret}
      onSave={() => {
        if (!apiKey.trim() || !apiSecret.trim()) { toast.error("Please enter both API key and secret."); return; }
        if (needsPassphrase && !passphrase.trim()) { toast.error(`${meta.label} requires a passphrase.`); return; }
        saveKey.mutate({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), ...(needsPassphrase ? { passphrase: passphrase.trim() } : {}), label, isTestnet });
      }}
      onVerify={() => verifyKey.mutate()}
      onRemove={() => removeKey.mutate()}
      isSaving={saveKey.isPending}
      isVerifying={verifyKey.isPending}
      isRemoving={removeKey.isPending}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExchangeSetup() {
  const [activeTab, setActiveTab] = useState<Exchange>("binance");
  const meta = EXCHANGE_META[activeTab];

  return (
    <PageWrapper>
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/30 bg-secondary/10">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${meta.bgColor} border ${meta.borderColor}`}>
              <Zap className={`w-6 h-6 ${meta.color}`} />
            </div>
            <h1 className="font-bold tracking-tight text-2xl md:text-3xl text-foreground">
              EXCHANGE <span className={meta.color}>API SETUP</span>
            </h1>
          </div>
          <p className=" text-muted-foreground ml-14">
            Connect Binance, Bybit, or OKX Futures for live position tracking and one-click order execution.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Security Notice */}
        <div className="mb-6 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 flex gap-3">
          <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className=" font-semibold text-blue-300 text-sm">Security Notice</p>
            <p className=" text-muted-foreground text-sm mt-1">
              All API keys are encrypted with AES-256 before storage. We recommend creating a <strong className="text-foreground">read-only + futures trading</strong> key with IP whitelist restrictions. <strong className="text-red-400">Never grant withdrawal permissions.</strong>
            </p>
          </div>
        </div>

        {/* Exchange Tabs */}
        <div className="flex gap-2 mb-8 p-1 rounded-xl bg-secondary/20 border border-border/30 overflow-x-auto scrollbar-hide">
          {(["binance", "bybit", "okx", "mexc", "kucoin", "gateio", "bitget", "asterdex", "hyperliquid"] as Exchange[]).map((ex) => {
            const m = EXCHANGE_META[ex];
            return (
              <button
                key={ex}
                onClick={() => setActiveTab(ex)}
                className={`shrink-0 md:flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all whitespace-nowrap ${
                  activeTab === ex
                    ? `${m.bgColor} ${m.color} border ${m.borderColor}`
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
                {activeTab === ex && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              </button>
            );
          })}
        </div>

        {/* Active Panel */}
        {activeTab === "binance" && <BinancePanel />}
        {activeTab === "bybit" && <BybitPanel />}
        {activeTab === "okx" && <OKXPanel />}
        {activeTab === "mexc" && <GenericCexPanel exchange="mexc" />}
        {activeTab === "kucoin" && <GenericCexPanel exchange="kucoin" />}
        {activeTab === "gateio" && <GenericCexPanel exchange="gateio" />}
        {activeTab === "bitget" && <GenericCexPanel exchange="bitget" />}
        {activeTab === "asterdex" && <AsterDEXPanel />}
        {activeTab === "hyperliquid" && <HyperliquidPanel />}
      </div>
    </div>
    </PageWrapper>
  );
}
