import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Verification() {
  const { data: signals, isLoading: signalsLoading } = trpc.signals.list.useQuery({
    minConfidence: 80,
  });

  const { data: stats, isLoading: statsLoading } = trpc.signals.stats.useQuery({
    minConfidence: 80,
  });

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case "hit_tp":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "hit_sl":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "expired":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "pending":
        return <Clock className="h-5 w-5 text-blue-500" />;
      default:
        return null;
    }
  };

  const getOutcomeBadge = (outcome: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      hit_tp: "default",
      hit_sl: "destructive",
      expired: "secondary",
      pending: "outline",
    };

    const labels: Record<string, string> = {
      hit_tp: "Hit Target",
      hit_sl: "Hit Stop Loss",
      expired: "Expired",
      pending: "Pending",
    };

    return (
      <Badge variant={variants[outcome] || "outline"}>
        {labels[outcome] || outcome}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-grow py-20">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-12 text-center">
            <h1 className="font-bold tracking-tight text-4xl md:text-5xl mb-4">
              SIGNAL <span className="text-primary">VERIFICATION</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              Independent verification of all AI-generated signals with ≥80% confidence. 
              Track performance, accuracy, and outcomes in real-time.
            </p>
          </div>

          {/* Statistics Cards */}
          {statsLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader className="pb-3">
                  <CardDescription className="">Total Signals</CardDescription>
                  <CardTitle className="font-bold text-3xl">{stats.total}</CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader className="pb-3">
                  <CardDescription className="">Win Rate</CardDescription>
                  <CardTitle className="font-bold text-3xl text-green-500">
                    {stats.winRate}%
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader className="pb-3">
                  <CardDescription className="">Successful</CardDescription>
                  <CardTitle className="font-bold text-3xl text-green-500">
                    {stats.hitTp}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader className="pb-3">
                  <CardDescription className="">Failed</CardDescription>
                  <CardTitle className="font-bold text-3xl text-red-500">
                    {stats.hitSl}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          ) : null}

          {/* Signals Table */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="">Signal History (≥80% Confidence)</CardTitle>
              <CardDescription className="">
                All high-confidence signals with verified outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signalsLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : signals && signals.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="">Timestamp</TableHead>
                        <TableHead className="">Symbol</TableHead>
                        <TableHead className="">Direction</TableHead>
                        <TableHead className="">Entry</TableHead>
                        <TableHead className="">Target</TableHead>
                        <TableHead className="">Stop Loss</TableHead>
                        <TableHead className="">Confidence</TableHead>
                        <TableHead className="">R:R</TableHead>
                        <TableHead className="">Outcome</TableHead>
                        <TableHead className="">Exit Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {signals.map((signal) => (
                        <TableRow key={signal.id}>
                          <TableCell className="font-mono text-xs">
                            {format(new Date(signal.generatedAt), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell className="font-bold">{signal.symbol}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {signal.direction === "LONG" ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              )}
                              <span className={signal.direction === "LONG" ? "text-green-500" : "text-red-500"}>
                                {signal.direction}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">{signal.entryPrice}</TableCell>
                          <TableCell className="font-mono">{signal.takeProfit}</TableCell>
                          <TableCell className="font-mono">{signal.stopLoss}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {signal.confidence}%
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">{signal.riskRewardRatio || "N/A"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getOutcomeIcon(signal.outcome)}
                              {getOutcomeBadge(signal.outcome)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">
                            {signal.actualExitPrice || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className=" text-muted-foreground">
                    No signals recorded yet. High-confidence signals (≥80%) will appear here automatically.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
