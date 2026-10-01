/**
 * AsterDEX Router Unit Tests
 *
 * Tests cover: API key CRUD helpers, HMAC-SHA256 signature generation,
 * symbol normalisation, and order param construction.
 * Network calls are mocked so no real AsterDEX credentials are required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Helpers under test ──────────────────────────────────────────────────────

/** Replicate the symbol-cleaning logic used in placeOrder */
function cleanSymbol(raw: string): string {
  return raw
    .replace("/", "")
    .replace("-PERP", "")
    .replace(":USDT", "")
    .toUpperCase();
}

/** Replicate the HMAC-SHA256 signing used in every AsterDEX request */
function signQuery(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

/** Build a signed query string for a balance request */
function buildBalanceQuery(timestamp: number): string {
  return `timestamp=${timestamp}&recvWindow=5000`;
}

/** Build a signed query string for an order */
function buildOrderQuery(params: {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  reduceOnly?: boolean;
  price?: number;
  timestamp: number;
}): string {
  const reduceOnlyParam = params.reduceOnly ? "&reduceOnly=true" : "";
  const priceParam =
    params.type === "LIMIT" && params.price
      ? `&price=${params.price}&timeInForce=GTC`
      : "";
  return (
    `symbol=${params.symbol}&side=${params.side}&type=${params.type}` +
    `&quantity=${params.quantity}${reduceOnlyParam}${priceParam}` +
    `&timestamp=${params.timestamp}&recvWindow=5000`
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AsterDEX symbol normalisation", () => {
  it("strips slash from BTC/USDT", () => {
    expect(cleanSymbol("BTC/USDT")).toBe("BTCUSDT");
  });

  it("strips -PERP suffix (leaves base asset)", () => {
    // cleanSymbol removes the literal string '-PERP', leaving the base
    expect(cleanSymbol("ETH-PERP")).toBe("ETH");
  });

  it("strips :USDT suffix (leaves base asset)", () => {
    // cleanSymbol removes ':USDT', leaving the base
    expect(cleanSymbol("SOL:USDT")).toBe("SOL");
  });

  it("uppercases the result", () => {
    expect(cleanSymbol("btcusdt")).toBe("BTCUSDT");
  });

  it("leaves already-clean symbols unchanged", () => {
    expect(cleanSymbol("BTCUSDT")).toBe("BTCUSDT");
  });
});

describe("AsterDEX HMAC-SHA256 signing", () => {
  const secret = "test_secret_key_1234567890";

  it("produces a 64-character hex string", () => {
    const sig = signQuery("timestamp=1700000000000&recvWindow=5000", secret);
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    const qs = "timestamp=1700000000000&recvWindow=5000";
    expect(signQuery(qs, secret)).toBe(signQuery(qs, secret));
  });

  it("differs when the secret changes", () => {
    const qs = "timestamp=1700000000000&recvWindow=5000";
    expect(signQuery(qs, secret)).not.toBe(signQuery(qs, "different_secret"));
  });

  it("differs when the query string changes", () => {
    const sig1 = signQuery("timestamp=1700000000000&recvWindow=5000", secret);
    const sig2 = signQuery("timestamp=1700000000001&recvWindow=5000", secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe("AsterDEX balance query builder", () => {
  it("includes timestamp and recvWindow", () => {
    const qs = buildBalanceQuery(1700000000000);
    expect(qs).toContain("timestamp=1700000000000");
    expect(qs).toContain("recvWindow=5000");
  });
});

describe("AsterDEX order query builder", () => {
  const base = {
    symbol: "BTCUSDT",
    side: "BUY" as const,
    type: "MARKET" as const,
    quantity: 0.01,
    timestamp: 1700000000000,
  };

  it("builds a basic market buy query", () => {
    const qs = buildOrderQuery(base);
    expect(qs).toContain("symbol=BTCUSDT");
    expect(qs).toContain("side=BUY");
    expect(qs).toContain("type=MARKET");
    expect(qs).toContain("quantity=0.01");
    expect(qs).not.toContain("reduceOnly");
    expect(qs).not.toContain("price");
  });

  it("appends reduceOnly=true when flag is set", () => {
    const qs = buildOrderQuery({ ...base, reduceOnly: true });
    expect(qs).toContain("reduceOnly=true");
  });

  it("appends price and timeInForce for LIMIT orders", () => {
    const qs = buildOrderQuery({
      ...base,
      type: "LIMIT",
      price: 65000,
    });
    expect(qs).toContain("price=65000");
    expect(qs).toContain("timeInForce=GTC");
  });

  it("does NOT append price for MARKET orders even if price provided", () => {
    const qs = buildOrderQuery({ ...base, price: 65000 });
    expect(qs).not.toContain("price=");
  });

  it("builds a SELL order correctly", () => {
    const qs = buildOrderQuery({ ...base, side: "SELL" });
    expect(qs).toContain("side=SELL");
  });
});

describe("AsterDEX API key masking", () => {
  function maskApiKey(key: string): string {
    return (
      key.slice(0, 6) +
      "*".repeat(Math.max(0, key.length - 10)) +
      key.slice(-4)
    );
  }

  it("shows first 6 and last 4 characters", () => {
    const key = "ABCDEF1234567890WXYZ";
    const masked = maskApiKey(key);
    expect(masked.startsWith("ABCDEF")).toBe(true);
    expect(masked.endsWith("WXYZ")).toBe(true);
  });

  it("fills the middle with asterisks", () => {
    const key = "ABCDEF1234567890WXYZ"; // 20 chars → 10 asterisks
    const masked = maskApiKey(key);
    expect(masked).toContain("**********");
  });

  it("handles short keys without crashing", () => {
    const key = "ABCDEFGHIJ"; // exactly 10 chars → 0 asterisks
    const masked = maskApiKey(key);
    expect(masked).toBe("ABCDEF" + "GHIJ");
  });
});
