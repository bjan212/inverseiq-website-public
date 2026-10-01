import { useState, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  MessageSquare, Copy, CheckCircle2, Loader2, RefreshCw, 
  Unlink, Bell, TrendingDown, Target, AlertTriangle, Zap,
  ExternalLink
} from "lucide-react";

/**
 * Telegram Settings Page
 * Allows users to generate a verification code, link their Telegram account,
 * and manage alert preferences.
 */
export default function TelegramSettings() {
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch current Telegram settings
  const { data: settings, isLoading, refetch } = trpc.telegram.get.useQuery();

  // Generate verification code
  const generateCode = trpc.telegram.generateCode.useMutation({
    onSuccess: (data) => {
      setVerificationCode(data.code);
      toast.success("Verification code generated!");
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to generate code: ${err.message}`);
    },
  });

  // Update preferences
  const updatePrefs = trpc.telegram.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("Preferences updated!");
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  // Disconnect Telegram
  const disconnect = trpc.telegram.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Telegram disconnected");
      setVerificationCode(null);
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to disconnect: ${err.message}`);
    },
  });

  // Test alert
  const testAlert = trpc.telegram.testAlert.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Test alert sent! Check your Telegram.");
      } else {
        toast.error(data.error || "Failed to send test alert");
      }
    },
    onError: (err) => {
      toast.error(`Failed to send test: ${err.message}`);
    },
  });

  // Copy code to clipboard
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  };

  // Derive state
  const isVerified = settings?.isVerified === 1;
  const isActive = settings?.isActive === 1;
  const pendingCode = settings?.verificationCode || verificationCode;

  // Alert preferences (from settings or defaults)
  const [alertSL, setAlertSL] = useState(true);
  const [alertTP, setAlertTP] = useState(true);
  const [alertMarket, setAlertMarket] = useState(true);
  const [alertHighConf, setAlertHighConf] = useState(true);

  useEffect(() => {
    if (settings) {
      setAlertSL(settings.alertOnSlApproach === 1);
      setAlertTP(settings.alertOnTpHit === 1);
      setAlertMarket(settings.alertOnMarketWarning === 1);
      setAlertHighConf(settings.alertOnHighConfSignal === 1);
    }
  }, [settings]);

  const handleToggleActive = () => {
    updatePrefs.mutate({ isActive: isActive ? 0 : 1 });
  };

  const handleSavePrefs = () => {
    updatePrefs.mutate({
      alertOnSlApproach: alertSL ? 1 : 0,
      alertOnTpHit: alertTP ? 1 : 0,
      alertOnMarketWarning: alertMarket ? 1 : 0,
      alertOnHighConfSignal: alertHighConf ? 1 : 0,
    });
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-10">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <PageWrapper><div className="container max-w-4xl py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className="w-8 h-8 text-[#0088cc]" />
          <h1 className="text-3xl font-bold font-orbitron">Telegram Alerts</h1>
        </div>
        <p className="text-muted-foreground font-rajdhani text-lg">
          Get real-time trade warnings and market alerts delivered directly to your Telegram.
        </p>
      </div>

      <div className="space-y-6">
        {/* Connection Status Card */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isVerified ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <Unlink className="w-5 h-5 text-muted-foreground" />
                  <span>Not Connected</span>
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isVerified
                ? `Linked to @${settings?.username || "your Telegram account"}`
                : "Link your Telegram to receive trade alerts"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isVerified ? (
              <div className="space-y-4">
                {/* Active toggle */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border/30">
                  <div>
                    <p className="font-medium">Alerts Active</p>
                    <p className="text-sm text-muted-foreground">
                      {isActive ? "You are receiving alerts" : "Alerts are paused"}
                    </p>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={handleToggleActive}
                    disabled={updatePrefs.isPending}
                  />
                </div>

                {/* Test Alert button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testAlert.mutate()}
                  disabled={testAlert.isPending}
                  className="text-[#0088cc] border-[#0088cc]/30 hover:bg-[#0088cc]/10"
                >
                  {testAlert.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4 mr-2" />
                  )}
                  Send Test Alert
                </Button>

                {/* Disconnect button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                  className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                >
                  {disconnect.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4 mr-2" />
                  )}
                  Disconnect Telegram
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Step-by-step instructions */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    How to connect
                  </h3>

                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Generate your verification code</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Click the button below to get a unique 6-character code.
                      </p>
                      {pendingCode ? (
                        <div className="flex items-center gap-3">
                          <div className="px-4 py-3 bg-secondary/50 border border-primary/40 rounded-lg font-mono text-2xl tracking-[0.3em] text-primary font-bold">
                            {pendingCode}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyCode(pendingCode)}
                            className="h-10 w-10"
                          >
                            {copied ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Copy className="w-5 h-5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => generateCode.mutate()}
                            disabled={generateCode.isPending}
                            className="h-10 w-10"
                            title="Generate new code"
                          >
                            <RefreshCw className={`w-5 h-5 ${generateCode.isPending ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => generateCode.mutate()}
                          disabled={generateCode.isPending}
                          className="bg-[#0088cc] hover:bg-[#0088cc]/80 text-white"
                        >
                          {generateCode.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4 mr-2" />
                          )}
                          Generate Verification Code
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Step 2 — One-Click Connect */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Connect with one click</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        {pendingCode
                          ? "Click below to open Telegram — your code is pre-filled. Just tap Start."
                          : "Generate a code first, then click to connect instantly."}
                      </p>
                      {pendingCode && (
                        <a
                          href={`https://t.me/XryptTrade_Bot?start=${pendingCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-[#0088cc] text-white font-semibold hover:bg-[#0088cc]/90 transition-colors shadow-lg shadow-[#0088cc]/20"
                        >
                          <MessageSquare className="w-5 h-5" />
                          Connect via Telegram
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {!pendingCode && (
                        <div className="px-4 py-3 rounded-lg bg-secondary/30 border border-border/30 text-sm text-muted-foreground">
                          Generate your code above to enable one-click connect.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 3 — Confirmation */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Done!</p>
                      <p className="text-sm text-muted-foreground">
                        After tapping Start in Telegram, the bot confirms your link instantly.
                        This page will update automatically.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Refresh status button */}
                {pendingCode && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      className="text-muted-foreground"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Check Connection Status
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alert Preferences Card — only show when connected */}
        {isVerified && (
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Alert Preferences
              </CardTitle>
              <CardDescription>
                Choose which alerts you want to receive on Telegram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stop Loss Approach */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  <div>
                    <Label className="text-base font-medium">Stop Loss Warning</Label>
                    <p className="text-sm text-muted-foreground">
                      Alert when a trade is within 30% of hitting stop loss
                    </p>
                  </div>
                </div>
                <Switch checked={alertSL} onCheckedChange={setAlertSL} />
              </div>

              <Separator />

              {/* TP Hit */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-emerald-400" />
                  <div>
                    <Label className="text-base font-medium">Take Profit Hit</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when a tracked trade reaches its target
                    </p>
                  </div>
                </div>
                <Switch checked={alertTP} onCheckedChange={setAlertTP} />
              </div>

              <Separator />

              {/* Market Warning */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  <div>
                    <Label className="text-base font-medium">Market Warnings</Label>
                    <p className="text-sm text-muted-foreground">
                      Alert on sudden sell-offs, volatility spikes, or funding extremes
                    </p>
                  </div>
                </div>
                <Switch checked={alertMarket} onCheckedChange={setAlertMarket} />
              </div>

              <Separator />

              {/* High Confidence Signal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-primary" />
                  <div>
                    <Label className="text-base font-medium">High Confidence Signals</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when a signal with 85%+ confidence is generated
                    </p>
                  </div>
                </div>
                <Switch checked={alertHighConf} onCheckedChange={setAlertHighConf} />
              </div>

              <Separator />

              {/* Save button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSavePrefs}
                  disabled={updatePrefs.isPending}
                >
                  {updatePrefs.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="border-[#0088cc]/20 bg-[#0088cc]/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <MessageSquare className="w-5 h-5 text-[#0088cc] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong className="text-foreground">How it works:</strong> The XRYPT Trade Monitor checks your active trades every 60 seconds. 
                  When a trade approaches your stop loss or hits a target, you'll get an instant Telegram message.
                </p>
                <p>
                  Market warnings are sent when the system detects sudden sell-offs, extreme funding rates, 
                  or unusual volatility that could affect your open positions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div></PageWrapper>
  );
}
