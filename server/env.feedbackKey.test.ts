import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

const require = createRequire(import.meta.url);
const { createCompatibilityServer } = require("../../inverse-iq-inspect/compatibility-backend/server.js") as {
  createCompatibilityServer: (options: { storagePath: string; apiKey: string }) => import("node:http").Server;
};

describe("continuous-learning feedback authentication configuration", () => {
  it("exposes a 32+ character server key and authenticates a lightweight backend request", async () => {
    expect(ENV.inverseiqFeedbackApiKey.length).toBeGreaterThanOrEqual(32);

    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "inverseiq-feedback-key-"));
    const server = createCompatibilityServer({
      storagePath: path.join(temporaryDir, "outcomes.json"),
      apiKey: ENV.inverseiqFeedbackApiKey,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP port");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/feedback/signal-outcome`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.inverseiqFeedbackApiKey}`,
        },
        body: JSON.stringify({
          signalId: "secret-validation-1",
          symbol: "BTCUSDT",
          direction: "LONG",
          entry: 100000,
          exit: 101000,
          outcome: "win",
          confidence: 90,
          strategy: "secret-validation",
        }),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ success: true, duplicate: false });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  });
});
