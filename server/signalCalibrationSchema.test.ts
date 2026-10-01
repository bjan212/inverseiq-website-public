import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { signalCalibrationObservations } from "../drizzle/schema";

describe("signal calibration observation schema", () => {
  it("deduplicates by user and observation bucket", () => {
    const config = getTableConfig(signalCalibrationObservations);
    const unique = config.indexes.find((index) => index.config.unique);
    const columnNames = unique?.config.columns.map((column: any) => column.name);
    expect(columnNames).toEqual(["userId", "observationKey"]);
  });

  it("stores version, timeframe, evidence components, and private ownership", () => {
    const config = getTableConfig(signalCalibrationObservations);
    const names = config.columns.map((column) => column.name);
    expect(names).toEqual(expect.arrayContaining([
      "userId",
      "modelVersion",
      "timeframe",
      "evidenceScore",
      "technicalScore",
      "microstructureScore",
      "entryQuality",
      "directionsAgree",
      "executionEligible",
      "outcome",
      "lastCheckedAt",
      "checkCount",
    ]));
  });
});
