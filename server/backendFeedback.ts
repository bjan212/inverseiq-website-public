/**
 * Backend Feedback Service
 * 
 * Sends verified signal outcomes to the inverse-iq continuous learning backend
 * so the AI engine can learn from real-world results and improve accuracy over time.
 */

import axios from "axios";
import { createHash } from "node:crypto";
import { ENV } from "./_core/env";
import { getPendingFeedbackOutbox, markFeedbackDelivered, queueFeedbackOutbox, recordFeedbackDeliveryFailure } from "./db";

interface SignalFeedback {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  outcome: "win" | "loss";
  confidence: number;
  signalId: number;
  strategy: string;
}

interface FeedbackResult {
  success: boolean;
  message?: string;
  patternsUpdated?: number;
}

export type VerifiedSignalFeedback = SignalFeedback;

/**
 * Returns a non-reversible, abbreviated identifier for safe configuration
 * comparison in authenticated scheduler logs. The raw key is never returned.
 */
export function getFeedbackKeyFingerprint(key = ENV.inverseiqFeedbackApiKey): string {
  if (!key) return "not-configured";
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/** Persist a verified outcome locally before external delivery so outages cannot lose learning data. */
export async function queueVerifiedSignalFeedback(feedback: VerifiedSignalFeedback): Promise<void> {
  await queueFeedbackOutbox(feedback);
}

/**
 * Submit a verified signal outcome to the backend for continuous learning.
 * The backend will use this to update its pattern database and improve future signals.
 */
export async function submitSignalFeedback(feedback: SignalFeedback): Promise<FeedbackResult> {
  const backendUrl = ENV.inverseiqBackendUrl;
  const feedbackApiKey = ENV.inverseiqFeedbackApiKey;

  if (!backendUrl) {
    console.warn("[BackendFeedback] No backend URL configured, skipping feedback");
    return { success: false, message: "Backend URL not configured" };
  }

  if (!feedbackApiKey) {
    console.error("[BackendFeedback] Feedback API key is not configured; retaining outbox record");
    return { success: false, message: "Feedback API key not configured" };
  }

  try {
    const payload = {
      symbol: feedback.symbol,
      direction: feedback.direction,
      entry: feedback.entry,
      exit: feedback.exit,
      outcome: feedback.outcome,
      confidence: feedback.confidence,
      signalId: feedback.signalId,
      strategy: feedback.strategy,
      timestamp: new Date().toISOString(),
    };

    const response = await axios.post(
      `${backendUrl}/api/feedback/signal-outcome`,
      payload,
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${feedbackApiKey}`,
        },
      }
    );

    if (response.data.success) {
      console.log(
        `[BackendFeedback] ✅ Feedback submitted for signal ${feedback.signalId}: ${feedback.outcome} on ${feedback.symbol} (${feedback.direction})`
      );
      return {
        success: true,
        message: response.data.message,
        patternsUpdated: response.data.patternsUpdated,
      };
    }

    return { success: false, message: response.data.message || "Unknown error" };
  } catch (error: any) {
    console.error(
      `[BackendFeedback] ❌ Failed to submit feedback for signal ${feedback.signalId}:`,
      error.message
    );
    return { success: false, message: error.message };
  }
}

/**
 * Batch submit multiple signal outcomes (useful for backfilling historical data)
 */
export async function submitBatchFeedback(feedbacks: SignalFeedback[]): Promise<{
  submitted: number;
  failed: number;
}> {
  let submitted = 0;
  let failed = 0;

  for (const feedback of feedbacks) {
    const result = await submitSignalFeedback(feedback);
    if (result.success) {
      submitted++;
    } else {
      failed++;
    }
    // Throttle to avoid overwhelming the backend
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`[BackendFeedback] Batch complete: ${submitted} submitted, ${failed} failed`);
  return { submitted, failed };
}

/** Deliver pending outbox records once; successful records cannot be submitted again. */
export async function deliverQueuedFeedback(limit = 50): Promise<{ delivered: number; failed: number; pending: number }> {
  const queued = await getPendingFeedbackOutbox(limit);
  let delivered = 0;
  let failed = 0;
  for (const item of queued) {
    const result = await submitSignalFeedback({
      signalId: item.signalId,
      symbol: item.symbol,
      direction: item.direction,
      entry: Number(item.entryPrice),
      exit: Number(item.exitPrice),
      outcome: item.outcome,
      confidence: item.confidence,
      strategy: item.strategy,
    });
    if (result.success) {
      await markFeedbackDelivered(item.id);
      delivered++;
    } else {
      await recordFeedbackDeliveryFailure(item.id, result.message || "Backend rejected feedback");
      failed++;
    }
  }
  return { delivered, failed, pending: queued.length };
}
