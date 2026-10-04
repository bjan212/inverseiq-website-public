import { describe, expect, it } from "vitest";
import { parseGrokVeto } from "./grokVeto";

describe("parseGrokVeto", () => {
  const factors = [
    "Bearish RSI divergence at resistance",
    "Open interest rising",
  ];

  it("accepts a veto that cites an exact engine factor", () => {
    expect(
      parseGrokVeto(
        JSON.stringify({
          veto: true,
          citedFactor: factors[0],
          reason: "The bearish divergence contradicts the proposed setup.",
        }),
        factors
      )
    ).toEqual({
      veto: true,
      citedFactor: factors[0],
      reason: "The bearish divergence contradicts the proposed setup.",
    });
  });

  it("rejects a factor not present in the engine evidence", () => {
    expect(
      parseGrokVeto(
        JSON.stringify({
          veto: true,
          citedFactor: "Funding suddenly flipped negative",
          reason: "The setup is invalid.",
        }),
        factors
      )
    ).toBeNull();
  });

  it("rejects BAD_ENTRY prose instead of treating it as a veto", () => {
    expect(
      parseGrokVeto("BAD_ENTRY: YES — this is not an ideal entry.", factors)
    ).toBeNull();
  });

  it("rejects extra fields, false vetoes, and invalid JSON", () => {
    expect(
      parseGrokVeto(
        JSON.stringify({
          veto: true,
          citedFactor: factors[0],
          reason: "Reason.",
          confidence: 99,
        }),
        factors
      )
    ).toBeNull();
    expect(
      parseGrokVeto(
        JSON.stringify({ veto: false, citedFactor: "", reason: "No veto." }),
        factors
      )
    ).toBeNull();
    expect(parseGrokVeto("{not json}", factors)).toBeNull();
  });
});
