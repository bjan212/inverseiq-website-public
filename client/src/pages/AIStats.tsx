import { useState, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AIStatsOverview } from "@/components/AIStatsOverview";
import { Brain, RefreshCw, AlertCircle, BarChart3, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { AI_STATS_MOBILE_AXIS, AI_STATS_MOBILE_CHART_LAYOUT, AI_STATS_MOBILE_CHART_MARGIN } from "@/lib/aiStatsChartLayout";
import { type DetailedAIStats, selectAiStatsForDisplay } from "@/lib/aiStatsDisplay";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = {
  confidence: "#7c3aed",
  winRate: "#10b981",
  signals: "#3b82f6",
  hitTP: "#10b981",
  hitSL: "#ef4444",
  expired: "#6b7280",
};

export default function AIStats() {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [chartDays, setChartDays] = useState(30);

  // Fetch AI backend stats via server-side tRPC proxy (avoids CORS)
  const { data: backendData, isLoading: backendLoading, refetch: refetchBackend } =
    trpc.aiBackend.stats.useQuery(undefined, {
      refetchInterval: 5 * 60 * 1000,
      retry: 2,
    });

  // Fetch confidence history from our own database
  const { data: confidenceHistory, isLoading: historyLoading, refetch: refetchHistory } = trpc.confidenceHistory.list.useQuery(
    { days: chartDays },
    { refetchInterval: 5 * 60 * 1000 }
  );

  const normalizedStats = backendData?.stats as DetailedAIStats | null | undefined;

  // Keep the visible refresh timestamp aligned to the latest normalized response.
  useEffect(() => {
    if (normalizedStats) setLastRefresh(new Date());
  }, [normalizedStats]);

  const loading = backendLoading;

  const handleRefresh = () => {
    refetchBackend();
    refetchHistory();
    toast.success("Refreshing AI statistics...");
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();
  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return "text-green-500";
    if (confidence >= 70) return "text-yellow-500";
    return "text-red-500";
  };

  // Prepare chart data (reverse so oldest is first for time-series)
  const chartData = confidenceHistory
    ? [...confidenceHistory]
        .reverse()
        .map((h) => ({
          date: formatShortDate(h.date),
          fullDate: h.date,
          confidence: h.avgConfidence,
          winRate: h.winRate,
          signals: h.totalSignals,
          hitTP: h.hitTP,
          hitSL: h.hitSL,
          expired: h.expired,
          patterns: h.backendPatterns,
        }))
    : [];

  const hasChartData = chartData.length > 0;

  if (!normalizedStats && !hasChartData && !historyLoading) {
    return (
      <PageWrapper><div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Unable to Load Statistics
            </CardTitle>
            <CardDescription>
              The AI backend may be unavailable. Please try again later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleRefresh} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div></PageWrapper>
    );
  }

  // Use fallback values when backend stats are unavailable
  const effectiveStats = selectAiStatsForDisplay(normalizedStats);
  const totalPatterns = effectiveStats.totalPatterns;
  const publicPercentage = totalPatterns > 0 ? (effectiveStats.patternSources.publicOnly / totalPatterns) * 100 : 0;
  const traderPercentage = totalPatterns > 0 ? (effectiveStats.patternSources.traderOnly / totalPatterns) * 100 : 0;
  const combinedPercentage = totalPatterns > 0 ? (effectiveStats.patternSources.combined / totalPatterns) * 100 : 0;

  return (
    <PageWrapper>
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Brain className="h-10 w-10 text-primary" />
              AI Engine Statistics
            </h1>
            <p className="text-muted-foreground">
              Real-time insights into the continuous learning AI engine
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={loading}
            variant="outline"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Last Updated */}
        <div className="mb-6 text-sm text-muted-foreground">
          Last updated: {formatDate(effectiveStats.lastUpdated)} • Refreshed: {lastRefresh.toLocaleTimeString()}
        </div>

        <AIStatsOverview stats={effectiveStats} />

        {/* ── Confidence Trend Chart ─────────────────────────────────── */}
        <Card className="mb-8">
          <CardHeader className={AI_STATS_MOBILE_CHART_LAYOUT.header}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Confidence & Win Rate Trend
                </CardTitle>
                <CardDescription>
                  How AI confidence and win rate have evolved over time
                </CardDescription>
              </div>
              <div className={AI_STATS_MOBILE_CHART_LAYOUT.controlRow}>
                {[7, 14, 30, 60].map((d) => (
                  <Button
                    key={d}
                    variant={chartDays === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => setChartDays(d)}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">No historical data yet.</p>
                <p className="text-xs mt-1">Confidence snapshots are recorded daily as signals are generated and verified.</p>
              </div>
            ) : (
              <div className={AI_STATS_MOBILE_CHART_LAYOUT.confidenceContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={AI_STATS_MOBILE_CHART_MARGIN}>
                    <defs>
                      <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.confidence} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.confidence} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorWinRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.winRate} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.winRate} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={AI_STATS_MOBILE_AXIS.tick} minTickGap={AI_STATS_MOBILE_AXIS.minTickGap} />
                    <YAxis domain={[0, 100]} tick={AI_STATS_MOBILE_AXIS.tick} unit="%" width={AI_STATS_MOBILE_AXIS.confidenceYAxisWidth} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(value: number, name: string) => [`${value}%`, name]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="confidence"
                      name="Avg Confidence"
                      stroke={CHART_COLORS.confidence}
                      fill="url(#colorConfidence)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="winRate"
                      name="Win Rate"
                      stroke={CHART_COLORS.winRate}
                      fill="url(#colorWinRate)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Signal Outcomes Chart ──────────────────────────────────── */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Daily Signal Outcomes
            </CardTitle>
            <CardDescription>
              Breakdown of TP hits, SL hits, and expired signals per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Target className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">No outcome data yet.</p>
                <p className="text-xs mt-1">Data will appear as signals are verified.</p>
              </div>
            ) : (
              <div className={AI_STATS_MOBILE_CHART_LAYOUT.outcomesContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={AI_STATS_MOBILE_CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={AI_STATS_MOBILE_AXIS.tick} minTickGap={AI_STATS_MOBILE_AXIS.minTickGap} />
                    <YAxis tick={AI_STATS_MOBILE_AXIS.tick} width={AI_STATS_MOBILE_AXIS.outcomesYAxisWidth} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend />
                    <Bar dataKey="hitTP" name="Hit TP ✅" fill={CHART_COLORS.hitTP} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="hitSL" name="Hit SL ❌" fill={CHART_COLORS.hitSL} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expired" name="Expired ⏰" fill={CHART_COLORS.expired} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Pattern Sources ────────────────────────────────────────── */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Pattern Sources</CardTitle>
            <CardDescription>Distribution of patterns by data source</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Public Data Only</span>
                <span className="text-sm text-muted-foreground">
                  {effectiveStats.patternSources.publicOnly} patterns ({publicPercentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={publicPercentage} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Trader Data Only</span>
                <span className="text-sm text-muted-foreground">
                  {effectiveStats.patternSources.traderOnly} patterns ({traderPercentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={traderPercentage} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Combined (Public + Trader) 🎯</span>
                <span className="text-sm text-muted-foreground">
                  {effectiveStats.patternSources.combined} patterns ({combinedPercentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={combinedPercentage} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* ── Confidence by Source ───────────────────────────────────── */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Confidence by Source</CardTitle>
            <CardDescription>Average confidence levels for different pattern sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 border rounded-lg">
                <div className={`text-4xl font-bold mb-2 ${getConfidenceColor(effectiveStats.confidenceBySource.publicPatterns)}`}>
                  {effectiveStats.confidenceBySource.publicPatterns.toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Public Patterns</div>
              </div>
              <div className="text-center p-6 border rounded-lg">
                <div className={`text-4xl font-bold mb-2 ${getConfidenceColor(effectiveStats.confidenceBySource.traderPatterns)}`}>
                  {effectiveStats.confidenceBySource.traderPatterns > 0
                    ? effectiveStats.confidenceBySource.traderPatterns.toFixed(1)
                    : "N/A"}%
                </div>
                <div className="text-sm text-muted-foreground">Trader Patterns</div>
              </div>
              <div className="text-center p-6 border rounded-lg border-primary">
                <div className={`text-4xl font-bold mb-2 ${getConfidenceColor(effectiveStats.confidenceBySource.combinedPatterns)}`}>
                  {effectiveStats.confidenceBySource.combinedPatterns > 0
                    ? effectiveStats.confidenceBySource.combinedPatterns.toFixed(1)
                    : "N/A"}%
                </div>
                <div className="text-sm text-muted-foreground">Combined Patterns 🎯</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Quality Distribution ───────────────────────────────────── */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Quality Distribution</CardTitle>
            <CardDescription>Pattern confidence levels across the database</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 border rounded-lg border-green-500/50 bg-green-500/5">
                <div className="text-4xl font-bold mb-2 text-green-500">
                  {effectiveStats.qualityDistribution.highConfidence}
                </div>
                <div className="text-sm text-muted-foreground">High Confidence (85%+)</div>
              </div>
              <div className="text-center p-6 border rounded-lg border-yellow-500/50 bg-yellow-500/5">
                <div className="text-4xl font-bold mb-2 text-yellow-500">
                  {effectiveStats.qualityDistribution.mediumConfidence}
                </div>
                <div className="text-sm text-muted-foreground">Medium Confidence (70-84%)</div>
              </div>
              <div className="text-center p-6 border rounded-lg border-red-500/50 bg-red-500/5">
                <div className="text-4xl font-bold mb-2 text-red-500">
                  {effectiveStats.qualityDistribution.lowConfidence}
                </div>
                <div className="text-sm text-muted-foreground">Low Confidence (&lt;70%)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── AI Insights ────────────────────────────────────────────── */}
        {effectiveStats.insights && effectiveStats.insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>AI Insights</CardTitle>
              <CardDescription>Recommendations for improving AI performance</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {effectiveStats.insights.map((insight, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </PageWrapper>
  );
}
