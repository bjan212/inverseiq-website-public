/**
 * Confidence Snapshot Scheduler
 *
 * - Builds only real snapshots from persisted signal outcomes
 * - Is invoked by an authenticated durable scheduled callback
 * - Fetches backend AI patterns to enrich snapshots
 */

import { buildDailySnapshot } from "./db";
import { ENV } from "./_core/env";
import axios from "axios";

const BACKEND_URL = ENV.inverseiqBackendUrl || process.env.INVERSEIQ_BACKEND_URL || "";

async function fetchBackendPatternCount(): Promise<number> {
  if (!BACKEND_URL) return 0;
  try {
    const res = await axios.get(`${BACKEND_URL}/api/ai/stats`, { timeout: 5000 });
    return res.data?.totalPatterns ?? res.data?.patterns ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Take a snapshot of today's performance and save/update it.
 */
export async function takeConfidenceSnapshot(): Promise<{ saved: boolean; date?: string }> {
  try {
    const backendPatterns = await fetchBackendPatternCount();
    const snapshot = await buildDailySnapshot(backendPatterns);
    if (snapshot) {
      console.log(
        `[ConfidenceScheduler] Snapshot saved: ${snapshot.date} | WR: ${snapshot.winRate}% | Signals: ${snapshot.totalSignals}`
      );
      return { saved: true, date: snapshot.date };
    } else {
      console.log("[ConfidenceScheduler] No signals today yet — snapshot skipped.");
      return { saved: false };
    }
  } catch (error) {
    console.error("[ConfidenceScheduler] Snapshot failed:", error);
    throw error;
  }
}
