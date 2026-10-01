import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface TradeTakenButtonProps {
  signalId: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  alreadyTaken?: boolean;
  alreadyVerified?: boolean;
  takenExchange?: string | null;
  onTaken?: () => void;
}

type VerifyResult = {
  exchange: string;
  matched: boolean;
  positionSize?: string;
  positionSide?: string;
  entryPrice?: string;
};

export default function TradeTakenButton({
  signalId,
  symbol,
  direction,
  entryPrice,
  alreadyTaken = false,
  alreadyVerified = false,
  takenExchange,
  onTaken,
}: TradeTakenButtonProps) {
  const [step, setStep] = useState<"idle" | "confirming" | "verifying" | "done">(
    alreadyTaken ? "done" : "idle"
  );
  const [verifyResults, setVerifyResults] = useState<VerifyResult[]>([]);
  const [verified, setVerified] = useState(alreadyVerified);
  const [matchedExchanges, setMatchedExchanges] = useState<string[]>(
    takenExchange ? takenExchange.split(",") : []
  );

  const markTaken = trpc.signals.markTradeTaken.useMutation({
    onSuccess: () => {
      setStep("verifying");
      verifyMutation.mutate({ signalId, symbol, direction, entryPrice });
    },
    onError: (err) => {
      toast.error(`Failed to mark trade: ${err.message}`);
      setStep("idle");
    },
  });

  const verifyMutation = trpc.signals.verifyTradeTaken.useMutation({
    onSuccess: (data) => {
      setVerified(data.verified);
      setMatchedExchanges(data.matchedExchanges);
      setVerifyResults(data.results);
      setStep("done");
      if (data.verified) {
        toast.success(
          `Trade verified on ${data.matchedExchanges.join(", ").toUpperCase()}! Position matched.`,
          { duration: 5000 }
        );
      } else {
        toast.info(
          "Trade marked as taken. No matching position found on connected exchanges — you may have traded manually.",
          { duration: 6000 }
        );
      }
      onTaken?.();
    },
    onError: () => {
      setStep("done");
      setVerified(false);
      toast.info("Trade marked as taken. Exchange verification unavailable.");
      onTaken?.();
    },
  });

  const handleTradeTaken = () => {
    if (step === "confirming") {
      setStep("verifying");
      markTaken.mutate({ signalId, exchange: "manual" });
    } else {
      setStep("confirming");
    }
  };

  const handleReVerify = () => {
    setStep("verifying");
    verifyMutation.mutate({ signalId, symbol, direction, entryPrice });
  };

  // ── Already done state ────────────────────────────────────────────────────
  if (step === "done" || alreadyTaken) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {verified ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified on {matchedExchanges.join(", ").toUpperCase()}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
              <span>Trade Taken</span>
              {takenExchange && takenExchange !== "manual" && (
                <span className="text-zinc-500">· {takenExchange.toUpperCase()}</span>
              )}
            </div>
          )}
          <button
            onClick={handleReVerify}
            disabled={verifyMutation.isPending}
            className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Re-verify against exchanges"
          >
            <RefreshCw className={`w-3 h-3 ${verifyMutation.isPending ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Exchange match breakdown */}
        {verifyResults.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {verifyResults.map((r) => (
              <span
                key={r.exchange}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                  r.matched
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-zinc-800/40 border-zinc-700/40 text-zinc-600"
                }`}
              >
                {r.matched ? "✓" : "·"} {r.exchange}
                {r.matched && r.positionSize && ` ${parseFloat(r.positionSize).toFixed(3)}`}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Verifying state ───────────────────────────────────────────────────────
  if (step === "verifying") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Checking exchanges for matching position…</span>
      </div>
    );
  }

  // ── Confirm state ─────────────────────────────────────────────────────────
  if (step === "confirming") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
          <AlertTriangle className="w-3 h-3" />
          <span>Confirm trade taken?</span>
        </div>
        <Button
          size="sm"
          onClick={handleTradeTaken}
          disabled={markTaken.isPending}
          className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white border-0"
        >
          {markTaken.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, confirm"}
        </Button>
        <button
          onClick={() => setStep("idle")}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-1"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Idle state ────────────────────────────────────────────────────────────
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleTradeTaken}
      className="h-7 px-3 text-xs border-zinc-700/60 text-zinc-400 hover:border-green-500/50 hover:text-green-400 hover:bg-green-500/5 transition-all gap-1.5"
    >
      {direction === "LONG" ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      Trade Taken
    </Button>
  );
}
