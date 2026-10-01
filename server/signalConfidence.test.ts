import { describe, expect, it } from "vitest";
import {
  calculateEvidenceConfidence,
  EXECUTABLE_CONFIDENCE_FLOOR,
  PARTIAL_CONFLUENCE_CEILING,
} from "../shared/signalConfidence";

const fullConfluence = {
  compositeScore: 78,
  technicalScore: 80,
  microstructureScore: 75,
  volatilityScore: 60,
  entryQualityScore: 70,
  entryQualityLabel: "A",
  directionsAgree: true,
  isExecutionEligible: true,
};

describe("evidence confidence", () => {
  it("keeps an ineligible setup below the execution band even with perfect component scores", () => {
    const result = calculateEvidenceConfidence({
      ...fullConfluence,
      compositeScore: 100,
      technicalScore: 100,
      microstructureScore: 100,
      volatilityScore: 100,
      entryQualityScore: 100,
      isExecutionEligible: false,
    });

    expect(result.confidence).toBe(PARTIAL_CONFLUENCE_CEILING);
    expect(result.executionBandEligible).toBe(false);
  });

  it("preserves a continuous 70–87 range for strong near-miss setups", () => {
    const weaker = calculateEvidenceConfidence({
      ...fullConfluence,
      compositeScore: 78,
      technicalScore: 82,
      microstructureScore: 60,
      volatilityScore: 60,
      entryQualityScore: 70,
      entryQualityLabel: "B",
      isExecutionEligible: false,
    });
    const stronger = calculateEvidenceConfidence({
      ...fullConfluence,
      compositeScore: 88,
      technicalScore: 92,
      microstructureScore: 70,
      volatilityScore: 75,
      entryQualityScore: 82,
      entryQualityLabel: "B",
      isExecutionEligible: false,
    });

    expect(weaker.confidence).toBeGreaterThanOrEqual(70);
    expect(stronger.confidence).toBeGreaterThan(weaker.confidence);
    expect(stronger.confidence).toBeLessThan(EXECUTABLE_CONFIDENCE_FLOOR);
    expect(weaker.executionBandEligible).toBe(false);
    expect(stronger.executionBandEligible).toBe(false);
  });

  it("does not allow partial confluence to reach 88", () => {
    const result = calculateEvidenceConfidence({
      ...fullConfluence,
      technicalScore: 79,
      compositeScore: 100,
      microstructureScore: 100,
      volatilityScore: 100,
      entryQualityScore: 100,
    });

    expect(result.confidence).toBeLessThanOrEqual(PARTIAL_CONFLUENCE_CEILING);
    expect(result.executionBandEligible).toBe(false);
  });

  it("keeps every single failed confluence floor below 88", () => {
    const failedFloors = [
      { compositeScore: 77 },
      { technicalScore: 79 },
      { microstructureScore: 74 },
      { volatilityScore: 59 },
      { entryQualityScore: 69 },
      { entryQualityLabel: "B" },
      { directionsAgree: false },
      { isExecutionEligible: false },
    ];

    for (const failedFloor of failedFloors) {
      const result = calculateEvidenceConfidence({ ...fullConfluence, ...failedFloor });
      expect(result.confidence).toBeLessThan(EXECUTABLE_CONFIDENCE_FLOOR);
      expect(result.executionBandEligible).toBe(false);
    }
  });

  it("makes the 88 execution floor reachable only at full A-quality confluence", () => {
    const result = calculateEvidenceConfidence(fullConfluence);

    expect(result.confidence).toBe(EXECUTABLE_CONFIDENCE_FLOOR);
    expect(result.executionBandEligible).toBe(true);
    expect(result.calibratedProbability).toBe(false);
  });

  it("reaches 100 only with theoretical maximum evidence", () => {
    const result = calculateEvidenceConfidence({
      ...fullConfluence,
      compositeScore: 100,
      technicalScore: 100,
      microstructureScore: 100,
      volatilityScore: 100,
      entryQualityScore: 100,
      entryQualityLabel: "A+",
    });

    expect(result).toMatchObject({
      confidence: 100,
      rawEvidenceScore: 100,
      executionBandEligible: true,
      model: "evidence-confluence-v5-hl-microstructure-continuous",
      calibratedProbability: false,
    });
  });

  it("is monotonic within the strict execution band", () => {
    const threshold = calculateEvidenceConfidence(fullConfluence);
    const stronger = calculateEvidenceConfidence({
      ...fullConfluence,
      compositeScore: 90,
      technicalScore: 92,
      microstructureScore: 90,
      volatilityScore: 80,
      entryQualityScore: 88,
      entryQualityLabel: "A+",
    });

    expect(stronger.confidence).toBeGreaterThan(threshold.confidence);
    expect(stronger.confidence).toBeLessThan(100);
  });
});
