import { describe, expect, it } from "vitest";
import { scoreMicrostructureEvidence } from "../shared/microstructureEvidence";

describe("microstructure evidence normalization", () => {
  it("scores one strong Hyperliquid factor as partial rather than 100% conviction", () => {
    expect(scoreMicrostructureEvidence(2, 0, true)).toEqual({
      direction: "LONG",
      score: 33,
      directionalPoints: 2,
      evidenceCapacity: 6,
    });
  });

  it("requires four of six aligned Hyperliquid directional points to clear 60", () => {
    expect(scoreMicrostructureEvidence(4, 0, true).score).toBe(67);
    expect(scoreMicrostructureEvidence(3, 0, true).score).toBeLessThan(60);
  });

  it("discounts conflicting directional evidence instead of treating the largest side as full conviction", () => {
    expect(scoreMicrostructureEvidence(4, 2, true)).toMatchObject({ direction: "LONG", score: 33 });
    expect(scoreMicrostructureEvidence(6, 0, true)).toMatchObject({ direction: "LONG", score: 100 });
  });

  it("uses the broader nine-point budget for multi-exchange display scans", () => {
    expect(scoreMicrostructureEvidence(6, 1, false)).toMatchObject({ direction: "LONG", score: 67 });
  });

  it("returns no direction when there is no directional evidence or a tie", () => {
    expect(scoreMicrostructureEvidence(0, 0, true)).toMatchObject({ direction: null, score: 0 });
    expect(scoreMicrostructureEvidence(2, 2, false)).toMatchObject({ direction: null });
  });
});
