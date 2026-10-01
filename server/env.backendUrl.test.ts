import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("continuous-learning HTTPS endpoint configuration", () => {
  it("uses the verified HTTPS backend and reaches its non-mutating health endpoint", async () => {
    expect(ENV.inverseiqBackendUrl).toBe("https://learning.xrypt.net");

    const response = await fetch(`${ENV.inverseiqBackendUrl}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "healthy",
      service: "inverseiq-continuous-learning",
    });
  }, 15_000);
});
