import { describe, expect, it } from "vitest";
import { buildScanCoverageTelemetry } from "./lib/signalEngine";

describe("signal scan coverage telemetry", () => {
  it("separates attempted, deeply analyzed, and unavailable candidates", () => {
    expect(buildScanCoverageTelemetry(20, 17)).toEqual({
      attemptedCount: 20,
      scannedCount: 17,
      unavailableCount: 3,
    });
  });

  it("clamps invalid counts so analyzed never exceeds attempted", () => {
    expect(buildScanCoverageTelemetry(20, 25)).toEqual({
      attemptedCount: 20,
      scannedCount: 20,
      unavailableCount: 0,
    });
    expect(buildScanCoverageTelemetry(-1, -3)).toEqual({
      attemptedCount: 0,
      scannedCount: 0,
      unavailableCount: 0,
    });
  });
});
