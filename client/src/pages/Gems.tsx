import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Diamond, RefreshCw, TrendingUp, TrendingDown, Clock, ArrowUpRight, Shield } from "lucide-react";
import { toast } from "sonner";

function formatPrice(price: string): string {
  const n = parseFloat(price);
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function formatVolume(vol: string): string {
  const n = parseFloat(vol);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function riskColor(risk: string): string {
  switch (risk) {
    case "LOW": return "text-green-400";
    case "MEDIUM": return "text-yellow-400";
    case "HIGH": return "text-orange-400";
    case "VERY_HIGH": return "text-red-400";
    default: return "text-muted-foreground";
  }
}

function riskBadgeVariant(risk: string): "default" | "secondary" | "destructive" | "outline" {
  switch (risk) {
    case "LOW": return "default";
    case "MEDIUM": return "secondary";
    case "HIGH": return "destructive";
    case "VERY_HIGH": return "destructive";
    default: return "outline";
  }
}

export default function Gems() {
  const [isManualScanning, setIsManualScanning] = useState(false);

  const { data: latestBatch, isLoading, refetch } = trpc.gems.getLatest.useQuery();
  const triggerScan = trpc.gems.triggerScan.useMutation({
    onSuccess: (result) => {
      toast.success(`Scan complete! Found ${result.gemsFound} gems`);
      refetch();
      setIsManualScanning(false);
    },
    onError: (err) => {
      toast.error(err.message || "Scan failed");
      setIsManualScanning(false);
    },
  });

  const handleManualScan = () => {
    setIsManualScanning(true);
    triggerScan.mutate();
  };

  const gems = latestBatch?.gems || [];
  const scannedAt = latestBatch?.scannedAt;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-grow pt-20">
        {/* Header */}
        <section className="py-12 border-b border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Diamond className="w-8 h-8 text-primary" />
                  <h1 className="font-orbitron font-bold text-3xl md:text-4xl">
                    GEM <span className="text-primary">DISCOVERIES</span>
                  </h1>
                </div>
                <p className="font-rajdhani text-muted-foreground text-lg">
                  Continuously scanned coins with high upside potential — updated automatically via background scanner.
                </p>
                {scannedAt && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Last scan: {new Date(scannedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="font-rajdhani"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  onClick={handleManualScan}
                  disabled={isManualScanning}
                  className="font-rajdhani bg-primary hover:bg-primary/90"
                >
                  {isManualScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Diamond className="w-4 h-4 mr-2" />
                      Scan Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Gems Grid */}
        <section className="py-8">
          <div className="container mx-auto px-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 font-rajdhani text-lg text-muted-foreground">Loading gems...</span>
              </div>
            ) : gems.length === 0 ? (
              <div className="text-center py-20">
                <Diamond className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-orbitron text-xl mb-2">No Gems Yet</h3>
                <p className="font-rajdhani text-muted-foreground mb-6">
                  Click "Scan Now" to discover gems, or wait for the next automatic scan.
                </p>
                <Button onClick={handleManualScan} disabled={isManualScanning}>
                  <Diamond className="w-4 h-4 mr-2" />
                  Run First Scan
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {gems.map((gem) => {
                  const tags: string[] = (() => { try { return JSON.parse(gem.tags); } catch { return []; } })();
                  const change24h = parseFloat(gem.priceChange24h);
                  const potentialGain = parseFloat(gem.potentialGain);

                  return (
                    <div
                      key={gem.id}
                      className="bg-card border border-border/50 rounded-lg p-4 hover:border-primary/40 transition-colors"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-orbitron font-bold text-lg">{gem.symbol}</span>
                          <Badge variant="outline" className="text-xs font-rajdhani">
                            {gem.exchange}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Diamond className="w-4 h-4 text-primary" />
                          <span className="font-mono font-bold text-primary">{gem.gemScore}</span>
                        </div>
                      </div>

                      {/* Price & Change */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono text-lg">{formatPrice(gem.price)}</span>
                        <div className={`flex items-center gap-1 text-sm font-mono ${change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {change24h >= 0 ? "+" : ""}{change24h.toFixed(1)}%
                        </div>
                      </div>

                      {/* Key Metrics */}
                      <div className="grid grid-cols-2 gap-2 mb-3 text-xs font-rajdhani">
                        <div className="bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Volume</span>
                          <div className="font-mono">{formatVolume(gem.volume24h)}</div>
                        </div>
                        <div className="bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Dip</span>
                          <div className="font-mono text-orange-400">-{parseFloat(gem.dipDepth).toFixed(1)}%</div>
                        </div>
                        <div className="bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Upside</span>
                          <div className="font-mono text-green-400 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3" />
                            +{potentialGain.toFixed(1)}%
                          </div>
                        </div>
                        <div className="bg-background/50 rounded px-2 py-1">
                          <span className="text-muted-foreground">Risk</span>
                          <div className={`font-mono flex items-center gap-1 ${riskColor(gem.riskLevel)}`}>
                            <Shield className="w-3 h-3" />
                            {gem.riskLevel}
                          </div>
                        </div>
                      </div>

                      {/* Entry/Target/SL */}
                      <div className="text-xs font-mono space-y-1 mb-3 bg-background/30 rounded p-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Entry:</span>
                          <span>{formatPrice(gem.entryZoneLow)} – {formatPrice(gem.entryZoneHigh)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Target:</span>
                          <span className="text-green-400">{formatPrice(gem.targetPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stop:</span>
                          <span className="text-red-400">{formatPrice(gem.stopLoss)}</span>
                        </div>
                      </div>

                      {/* Reason */}
                      <p className="text-xs text-muted-foreground font-rajdhani mb-3 italic">
                        {gem.reason}
                      </p>

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] font-rajdhani">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Info Section */}
        <section className="py-8 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="bg-card/50 border border-border/30 rounded-lg p-6 max-w-3xl mx-auto">
              <h3 className="font-orbitron font-bold text-lg mb-3 flex items-center gap-2">
                <Diamond className="w-5 h-5 text-primary" />
                How Gem Discovery Works
              </h3>
              <div className="font-rajdhani text-muted-foreground space-y-2 text-sm">
                <p>
                  The scanner runs automatically every hour, analyzing the top 100 coins by volume on Bybit.
                  It identifies coins in significant dips with recovery momentum and volume surges.
                </p>
                <p>
                  <strong className="text-foreground">Scoring:</strong> Each gem is scored 0–100 based on dip depth,
                  recovery momentum, volume spike ratio, and liquidity. Higher scores = stronger opportunity.
                </p>
                <p>
                  <strong className="text-foreground">Telegram Alerts:</strong> Connect your Telegram in Settings
                  to receive instant notifications when new gems are discovered.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
