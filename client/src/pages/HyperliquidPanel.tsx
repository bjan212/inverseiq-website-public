import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PrivateHistoryLearningCard } from "@/components/PrivateHistoryLearningCard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
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
} from "lucide-react";

type VerifyResult = {
  success: boolean;
  accountValue?: number;
  totalMarginUsed?: number;
  spotUsdcBalance?: number;
  totalAccountValue?: number;
  usesUnifiedAccountBalance?: boolean;
  availableTradingCollateral?: number;
  positions?: Array<{ symbol: string; size: string; entryPx: string; unrealizedPnl: string; side: string }>;
  walletAddress?: string;
  error?: string;
  checkedAt: Date;
};

export function HyperliquidPanel() {
  const [privateKey, setPrivateKey] = useState("");
  const [label, setLabel] = useState("My Hyperliquid Wallet");
  const [showKey, setShowKey] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const { data: keyInfo, refetch: refetchKeyInfo } = trpc.hyperliquid.hasKey.useQuery();

  const verifyMutation = trpc.hyperliquid.verifyKey.useMutation({
    onSuccess: (data) => {
      setVerifyResult({ ...data, checkedAt: new Date() });
      if (data.success) {
        toast.success(`Connected! Total wallet value: $${(data.totalAccountValue ?? data.accountValue ?? 0).toFixed(2)}`);
        refetchKeyInfo();
      } else {
        toast.error(`Verification failed: ${data.error}`);
      }
    },
    onError: (err) => {
      setVerifyResult({ success: false, error: err.message, checkedAt: new Date() });
      toast.error(`Error: ${err.message}`);
    },
  });

  const saveMutation = trpc.hyperliquid.saveKey.useMutation({
    onSuccess: (data) => {
      toast.success(`Key saved — wallet: ${data.walletAddress.slice(0, 10)}…`);
      setPrivateKey("");
      setShowForm(false);
      refetchKeyInfo();
      setTimeout(() => verifyMutation.mutate(), 300);
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const deleteMutation = trpc.hyperliquid.deleteKey.useMutation({
    onSuccess: () => {
      toast.success("Hyperliquid key removed.");
      setVerifyResult(null);
      refetchKeyInfo();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const hasKey = keyInfo?.hasKey ?? false;
  const walletAddress = keyInfo?.walletAddress ?? null;

  const errorHint = (msg?: string): string => {
    if (!msg) return "";
    const m = msg.toLowerCase();
    if (m.includes("invalid") || m.includes("private key"))
      return "The private key appears to be invalid. Make sure it is a 64-character hex string (32 bytes), with or without the 0x prefix.";
    if (m.includes("timeout") || m.includes("network") || m.includes("econnrefused"))
      return "Could not reach Hyperliquid API. Check your internet connection and try again.";
    if (m.includes("not found") || m.includes("symbol"))
      return "The wallet address was derived but the account may not exist on Hyperliquid yet. Fund the wallet first.";
    return "Check that the private key is correct and the wallet has been used on Hyperliquid.";
  };

  return (
    <div>
      {/* ── Verification Status Card ─────────────────────────────────────── */}
      {verifyMutation.isPending && (
        <div className="mb-6 p-5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
          <div>
            <p className="font-semibold text-cyan-300">Verifying Hyperliquid connection…</p>
            <p className="text-xs text-muted-foreground mt-0.5">Fetching account state from Hyperliquid API</p>
          </div>
        </div>
      )}

      {!verifyMutation.isPending && verifyResult && (
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
                <p className={`font-bold tracking-tight ${verifyResult.success ? "text-green-300" : "text-red-300"}`}>
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
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className={verifyResult.success
                ? "border-green-500/30 text-green-300 hover:bg-green-500/10"
                : "border-red-500/30 text-red-300 hover:bg-red-500/10"}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Re-check
            </Button>
          </div>

          {verifyResult.success && (
            <div className="mt-4 pt-4 border-t border-green-500/20 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {verifyResult.usesUnifiedAccountBalance ? "Unified Perps Collateral" : "Perpetual Account Value"}
                </p>
                <p className="font-mono font-bold text-xl text-green-300">
                  ${(verifyResult.usesUnifiedAccountBalance
                    ? (verifyResult.availableTradingCollateral ?? 0)
                    : (verifyResult.accountValue ?? 0)).toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">USD</span>
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Margin Used</p>
                <p className="font-mono font-bold text-xl text-foreground">
                  ${(verifyResult.totalMarginUsed ?? 0).toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">USD</span>
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {verifyResult.usesUnifiedAccountBalance ? "Unified USDC Balance" : "Spot USDC"}
                </p>
                <p className="font-mono font-bold text-xl text-cyan-300">${(verifyResult.spotUsdcBalance ?? 0).toFixed(2)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Wallet Value</p>
                <p className="font-mono font-bold text-xl text-green-300">${(verifyResult.totalAccountValue ?? verifyResult.accountValue ?? 0).toFixed(2)}</p>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-medium">LIVE — Hyperliquid Perpetuals</span>
                {verifyResult.walletAddress && (
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    {verifyResult.walletAddress.slice(0, 6)}…{verifyResult.walletAddress.slice(-4)}
                  </span>
                )}
              </div>
            </div>
          )}

          {verifyResult.success && verifyResult.positions && verifyResult.positions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-green-500/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Activity className="w-3 h-3" /> Open Positions ({verifyResult.positions.length})
              </p>
              <div className="space-y-2">
                {verifyResult.positions.map((pos, i) => {
                  const pnl = parseFloat(pos.unrealizedPnl);
                  return (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg bg-secondary/20">
                      <div className="flex items-center gap-2">
                        {pos.side === "LONG"
                          ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                          : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                        <span className="font-mono font-semibold">{pos.symbol}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                          pos.side === "LONG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>{pos.side}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Size: <span className="text-foreground font-mono">{pos.size}</span></span>
                        <span>Entry: <span className="text-foreground font-mono">${parseFloat(pos.entryPx).toFixed(2)}</span></span>
                        <span className={pnl >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!verifyResult.success && verifyResult.error && (
            <div className="mt-4 pt-4 border-t border-red-500/20">
              <p className="text-xs text-red-400 font-mono mb-2">{verifyResult.error}</p>
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                {errorHint(verifyResult.error)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Key Status Card ───────────────────────────────────────────────── */}
      <div className="mb-6 p-5 rounded-xl border border-border/30 bg-secondary/10">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <Wallet className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Hyperliquid Wallet Key</p>
              {hasKey && walletAddress ? (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">No key stored</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasKey && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                >
                  <Wifi className="w-3 h-3 mr-1" /> Verify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={() => setShowForm(!showForm)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Key className="w-3 h-3 mr-1" />
              {hasKey ? "Replace Key" : "Add Key"}
            </Button>
          </div>
        </div>

        {hasKey && (
          <div className="mt-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Private key stored (AES-256 encrypted)</span>
          </div>
        )}
      </div>

      <PrivateHistoryLearningCard exchange="hyperliquid" connected={hasKey} />

      {/* ── Add/Replace Key Form ──────────────────────────────────────────── */}
      {showForm && (
        <div className="mb-6 p-5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-cyan-400" />
            <p className="text-sm font-semibold text-cyan-300">Add Hyperliquid Private Key</p>
          </div>
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Your private key is encrypted with AES-256 before storage. For maximum security, use a <strong>dedicated trading wallet</strong> with only the funds you intend to trade — never your main wallet.
            </span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Hyperliquid Wallet"
              className="bg-background border-border/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Private Key (64-char hex)</Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="0x... or raw 64-char hex"
                className="bg-background border-border/50 pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Export from MetaMask: Account Details → Export Private Key. The key is the 64-character hex string.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                const raw = privateKey.trim();
                if (!raw) { toast.error("Please enter your private key."); return; }
                const normalized = raw.startsWith("0x") ? raw.slice(2) : raw;
                if (normalized.length !== 64) { toast.error("Private key must be exactly 64 hex characters (32 bytes)."); return; }
                saveMutation.mutate({ privateKey: raw, label });
              }}
              disabled={saveMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {saveMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Key className="w-3 h-3 mr-1" />}
              Save & Verify
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setPrivateKey(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Setup Instructions ────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl border border-border/30 bg-secondary/5">
        <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Key className="w-4 h-4 text-cyan-400" /> How to get your Hyperliquid private key
        </p>
        <ol className="space-y-3">
          {[
            "Go to app.hyperliquid.xyz and connect your MetaMask or wallet",
            "In MetaMask: click the three-dot menu → Account Details → Export Private Key",
            "Enter your MetaMask password to reveal the 64-character hex key",
            "Recommended: create a dedicated trading wallet with only the funds you intend to trade",
            "Paste the key above — it is encrypted with AES-256 before storage and never sent to any third party",
            "After saving, click Verify to confirm the connection and see your live account balance",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-4 pt-4 border-t border-border/20">
          <a
            href="https://app.hyperliquid.xyz/trade/BTC"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 underline"
          >
            Open Hyperliquid App →
          </a>
        </div>
      </div>
    </div>
  );
}
