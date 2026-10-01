import React from "react";
import { Activity, Database, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DetailedAIStats } from "@/lib/aiStatsDisplay";

function confidenceColor(confidence: number) {
  if (confidence >= 85) return "text-green-500";
  if (confidence >= 70) return "text-yellow-500";
  return "text-red-500";
}

export function AIStatsOverview({ stats }: { stats: DetailedAIStats }) {
  const metrics = [
    {
      label: "Total Patterns",
      value: String(stats.totalPatterns),
      detail: "Learned from market data",
      icon: Database,
      valueClassName: "text-3xl font-bold",
    },
    {
      label: "Contributing Traders",
      value: String(stats.totalTraders),
      detail: "Active contributors",
      icon: Users,
      valueClassName: "text-3xl font-bold",
    },
    {
      label: "Total Trades Analyzed",
      value: stats.totalTrades.toLocaleString(),
      detail: "Historical data points",
      icon: Activity,
      valueClassName: "text-3xl font-bold",
    },
    {
      label: "Avg Confidence",
      value: `${stats.averageConfidence.toFixed(1)}%`,
      detail: "Pattern reliability",
      icon: TrendingUp,
      valueClassName: `text-3xl font-bold ${confidenceColor(stats.averageConfidence)}`,
    },
  ];

  return (
    <section
      aria-label="AI statistics overview"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8"
    >
      {metrics.map(({ label, value, detail, icon: Icon, valueClassName }) => (
        <Card key={label}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div aria-label={`${label}: ${value}`} className={valueClassName}>{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{detail}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
