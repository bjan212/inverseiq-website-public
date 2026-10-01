import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { History, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type PrivateHistoryExchange =
  | "hyperliquid"
  | "binance"
  | "bybit"
  | "okx"
  | "asterdex"
  | "mexc"
  | "kucoin"
  | "gateio"
  | "bitget";

export function PrivateHistoryLearningCard({
  exchange,
  connected,
}: {
  exchange: PrivateHistoryExchange;
  connected: boolean;
}) {
  const status = trpc.exchangeHistory.status.useQuery(
    { exchange },
    { enabled: connected, refetchOnWindowFocus: false },
  );
  const refresh = trpc.exchangeHistory.refresh.useMutation({
    onSuccess: async (result) => {
      await status.refetch();
      if (result.success) {
        toast.success(
          `Private learning updated: ${result.rowsInserted} new rows, ${result.duplicatesIgnored} duplicates ignored.`,
        );
      } else {
        toast.error(result.error ?? "Private history refresh failed");
      }
    },
    onError: (error) => toast.error(`Private history refresh failed: ${error.message}`),
  });

  if (!connected) return null;
  const data = status.data;

  return (
    <section className="mb-6 border-y border-cyan-500/20 bg-cyan-500/5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
          <div>
            <h3 className="text-sm font-bold text-cyan-100">Private inverse-pattern learning</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Imported records remain isolated to your account. No cross-user pooling or recurring background sync is enabled.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate({ exchange })}
          disabled={refresh.isPending}
          className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10"
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} />
          Refresh history
        </Button>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div><History className="mr-1 inline h-3 w-3" />Status: <span className="text-foreground">{data?.status ?? "not imported"}</span></div>
        <div>Rows added: <span className="font-mono text-foreground">{data?.rowsInserted ?? 0}</span></div>
        <div>Private outcomes: <span className="font-mono text-foreground">{data?.eligibleOutcomes ?? 0}</span></div>
      </div>
      {data?.lastSuccessAt && (
        <p className="mt-2 text-xs text-muted-foreground">Last success: {new Date(data.lastSuccessAt).toLocaleString()}</p>
      )}
      {data?.retentionNote && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data.retentionNote}</p>}
      {data?.lastError && <p className="mt-2 text-xs text-red-300">Last import error: {data.lastError}</p>}
    </section>
  );
}
