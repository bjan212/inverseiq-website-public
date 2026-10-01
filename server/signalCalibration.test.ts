import { describe, expect, it } from "vitest";
import {
  SIGNAL_CALIBRATION_SAMPLE_INTERVAL_MS,
  buildSignalCalibrationObservationKey,
  evaluateCalibrationOutcome,
  filterSignalCalibrationRowsByModelVersion,
  summarizeSignalCalibration,
} from "../shared/signalCalibration";

describe("signal calibration shadow metrics", () => {
  it("deduplicates observations into deterministic 15-minute buckets", () => {
    const start = Date.UTC(2026, 8, 7, 12, 0, 0);
    expect(buildSignalCalibrationObservationKey(start)).toBe(buildSignalCalibrationObservationKey(start + SIGNAL_CALIBRATION_SAMPLE_INTERVAL_MS - 1));
    expect(buildSignalCalibrationObservationKey(start)).not.toBe(buildSignalCalibrationObservationKey(start + SIGNAL_CALIBRATION_SAMPLE_INTERVAL_MS));
  });

  it("labels unambiguous TP and SL outcomes in candle order", () => {
    const expiry = Date.UTC(2026, 8, 7, 13, 0, 0);
    expect(evaluateCalibrationOutcome({ direction: "LONG", takeProfit: 110, stopLoss: 95, expiresAt: expiry }, [
      { openTime: expiry - 10_000, high: 111, low: 100 },
    ], expiry)?.outcome).toBe("hit_tp");
    expect(evaluateCalibrationOutcome({ direction: "SHORT", takeProfit: 90, stopLoss: 105, expiresAt: expiry }, [
      { openTime: expiry - 10_000, high: 106, low: 99 },
    ], expiry)?.outcome).toBe("hit_sl");
  });

  it("excludes same-candle TP and SL collisions as ambiguous", () => {
    const expiry = Date.UTC(2026, 8, 7, 13, 0, 0);
    expect(evaluateCalibrationOutcome({ direction: "LONG", takeProfit: 110, stopLoss: 95, expiresAt: expiry }, [
      { openTime: expiry - 10_000, high: 111, low: 94 },
    ], expiry)?.outcome).toBe("ambiguous");
  });

  it("does not unlock calibration adjustments from small or low-band-only samples", () => {
    const small = Array.from({ length: 99 }, (_, index) => ({ evidenceScore: 60, outcome: index % 2 ? "hit_tp" as const : "hit_sl" as const }));
    expect(summarizeSignalCalibration(small).sampleSufficientForAdjustment).toBe(false);

    const lowOnly = Array.from({ length: 120 }, (_, index) => ({ evidenceScore: 69, outcome: index % 2 ? "hit_tp" as const : "hit_sl" as const }));
    expect(summarizeSignalCalibration(lowOnly).sampleSufficientForAdjustment).toBe(false);
  });

  it("requires both 100 resolved outcomes and 30 resolved high-band outcomes for manual review", () => {
    const lowBand = Array.from({ length: 70 }, (_, index) => ({
      evidenceScore: 69,
      outcome: index % 2 ? "hit_tp" as const : "hit_sl" as const,
    }));
    const highBand = Array.from({ length: 30 }, (_, index) => ({
      evidenceScore: index % 2 ? 90 : 96,
      outcome: index % 3 ? "hit_tp" as const : "hit_sl" as const,
    }));
    expect(summarizeSignalCalibration([...lowBand, ...highBand]).sampleSufficientForAdjustment).toBe(true);
  });

  it("reports measured score distribution without forcing an 85 average", () => {
    const summary = summarizeSignalCalibration([
      { evidenceScore: 60, outcome: "expired" },
      { evidenceScore: 88, outcome: "hit_tp" },
      { evidenceScore: 96, outcome: "hit_sl" },
    ]);
    expect(summary.meanEvidenceScore).toBe(81.33);
    expect(summary.bands.find((band) => band.band === "88-94")?.empiricalWinRate).toBe(100);
    expect(summary.sampleSufficientForAdjustment).toBe(false);
  });

  it("keeps historical v2, v3, and v4 outcomes out of v5 continuous microstructure summaries", () => {
    const rows = [
      { modelVersion: "evidence-confluence-v2", evidenceScore: 69, outcome: "hit_sl" as const },
      { modelVersion: "evidence-confluence-v3-continuous", evidenceScore: 82, outcome: "hit_tp" as const },
      { modelVersion: "evidence-confluence-v4-hl-microstructure", evidenceScore: 82, outcome: "hit_tp" as const },
      { modelVersion: "evidence-confluence-v5-hl-microstructure-continuous", evidenceScore: 82, outcome: "hit_tp" as const },
    ];

    expect(filterSignalCalibrationRowsByModelVersion(rows)).toEqual([rows[3]]);
  });
});
