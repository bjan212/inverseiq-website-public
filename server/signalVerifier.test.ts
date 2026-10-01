import { describe, expect, it } from "vitest";
import { toHyperliquidCoin } from "./signalVerifier";

describe("Hyperliquid signal-verifier symbol normalization", () => {
  it("converts USDC-quoted Hyperliquid symbols to the base asset", () => {
    expect(toHyperliquidCoin("BTC/USDC")).toBe("BTC");
    expect(toHyperliquidCoin("ETHUSDC")).toBe("ETH");
  });

  it("preserves canonical base assets from USDT and perpetual formats", () => {
    expect(toHyperliquidCoin("SOLUSDT")).toBe("SOL");
    expect(toHyperliquidCoin("DOGE-USDT-PERP")).toBe("DOGE");
  });
});
