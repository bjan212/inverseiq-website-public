import { describe, expect, it } from "vitest";
import { getFeedbackKeyFingerprint } from "./backendFeedback";

describe("feedback key fingerprint", () => {
  it("returns a stable abbreviated SHA-256 fingerprint without returning the secret", () => {
    const secret = "correct-horse-battery-staple-with-sufficient-length";
    const fingerprint = getFeedbackKeyFingerprint(secret);

    expect(fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(fingerprint).toBe(getFeedbackKeyFingerprint(secret));
    expect(fingerprint).not.toContain(secret);
  });

  it("identifies an absent configuration without attempting to hash it", () => {
    expect(getFeedbackKeyFingerprint("")).toBe("not-configured");
  });
});
