import { describe, expect, it } from "vitest";
import {
  applyPrivatePatternAdjustment,
  deriveFailureEvidence,
  derivePersonalPatternEvidence,
} from "../shared/personalPatternEvidence";

describe("private personal-pattern evidence", () => {
  it("shrinks small perfect samples and never boosts signal confidence", () => {
    const evidence = derivePersonalPatternEvidence(5, 0);
    expect(evidence.posteriorWinRate).toBeLessThan(0.7);
    expect(evidence.signalAdjustment).toBe(0);
    expect(applyPrivatePatternAdjustment(86, evidence.descriptiveAdjustment)).toBe(86);
  });

  it("suppresses only after a meaningful losing sample", () => {
    const evidence = derivePersonalPatternEvidence(3, 17);
    expect(evidence.sampleSize).toBe(20);
    expect(evidence.signalAdjustment).toBeLessThanOrEqual(-2);
    expect(applyPrivatePatternAdjustment(90, evidence.signalAdjustment)).toBeLessThan(90);
  });

  it("does not label a directional failure pattern from fewer than ten trades", () => {
    expect(deriveFailureEvidence(8, 9).eligible).toBe(false);
    expect(deriveFailureEvidence(24, 30).eligible).toBe(true);
  });

  it("cannot promote a sub-threshold signal into the 88+ execution band", () => {
    expect(applyPrivatePatternAdjustment(87, 6)).toBe(87);
    expect(applyPrivatePatternAdjustment(90, -20)).toBe(84);
  });
});
