/**
 * Vitest tests for the Hyperliquid integration.
 * Tests the signing module, order building, and API connectivity.
 */
import { describe, it, expect } from "vitest";
import {
  signL1Action,
  buildOrderAction,
  buildPositionTpslAction,
  buildLeverageAction,
  floatToWire,
  privateKeyToAddress,
} from "./hyperliquidSigning";
import axios from "axios";

describe("Hyperliquid Signing Module", () => {
  const TEST_PRIVATE_KEY = "0x" + "1".repeat(64);

  it("floatToWire removes trailing zeros", () => {
    expect(floatToWire(100.1)).toBe("100.1");
    expect(floatToWire(100.0)).toBe("100");
    expect(floatToWire(0.001)).toBe("0.001");
    expect(floatToWire(0.01)).toBe("0.01");
    expect(floatToWire(1234.56789)).toBe("1234.56789");
  });

  it("privateKeyToAddress derives correct address", () => {
    const addr = privateKeyToAddress(TEST_PRIVATE_KEY);
    expect(addr).toMatch(/^0x[a-f0-9]{40}$/);
    expect(addr).toBe("0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a");
  });

  it("buildOrderAction creates correct structure", () => {
    const action = buildOrderAction({
      assetIndex: 0,
      isBuy: true,
      price: 30000,
      size: 0.01,
      tif: "Ioc",
    });
    expect(action.type).toBe("order");
    expect(action.orders).toHaveLength(1);
    expect(action.orders[0].a).toBe(0);
    expect(action.orders[0].b).toBe(true);
    expect(action.orders[0].p).toBe("30000");
    expect(action.orders[0].s).toBe("0.01");
    expect(action.orders[0].r).toBe(false);
    expect(action.orders[0].t).toEqual({ limit: { tif: "Ioc" } });
    expect(action.grouping).toBe("na");
  });

  it("buildOrderAction defaults to Gtc and reduceOnly=false", () => {
    const action = buildOrderAction({
      assetIndex: 1,
      isBuy: false,
      price: 1800.5,
      size: 1.5,
    });
    expect(action.orders[0].r).toBe(false);
    expect(action.orders[0].t).toEqual({ limit: { tif: "Gtc" } });
  });

  it("builds two reduce-only position-level TP/SL triggers", () => {
    const action = buildPositionTpslAction({
      assetIndex: 12,
      closingIsBuy: false,
      size: 13876,
      takeProfit: 0.030765,
      stopLoss: 0.030103,
    });
    expect(action.grouping).toBe("positionTpsl");
    expect(action.orders).toHaveLength(2);
    expect(action.orders.every(order => order.r && order.b === false)).toBe(true);
    expect(action.orders[0].p).toBe("0.030765");
    expect(action.orders[1].p).toBe("0.030103");
    expect(Object.keys(action.orders[0].t.trigger)).toEqual(["isMarket", "triggerPx", "tpsl"]);
    expect(Object.keys(action.orders[1].t.trigger)).toEqual(["isMarket", "triggerPx", "tpsl"]);
    expect(action.orders[0].t).toEqual({ trigger: { isMarket: true, triggerPx: "0.030765", tpsl: "tp" } });
    expect(action.orders[1].t).toEqual({ trigger: { isMarket: true, triggerPx: "0.030103", tpsl: "sl" } });
  });

  it("buildLeverageAction creates correct structure", () => {
    const action = buildLeverageAction(0, 10);
    expect(action).toEqual({
      type: "updateLeverage",
      asset: 0,
      isCross: true,
      leverage: 10,
    });
  });

  it("buildLeverageAction supports isolated mode", () => {
    const action = buildLeverageAction(5, 20, false);
    expect(action.isCross).toBe(false);
    expect(action.leverage).toBe(20);
    expect(action.asset).toBe(5);
  });

  it("signL1Action produces valid signature structure", async () => {
    const action = buildOrderAction({
      assetIndex: 0,
      isBuy: true,
      price: 30000,
      size: 0.01,
      tif: "Ioc",
    });
    const nonce = 1700000000000;
    const sig = await signL1Action(TEST_PRIVATE_KEY, action, null, nonce);
    expect(sig.r).toMatch(/^0x[a-f0-9]{64}$/);
    expect(sig.s).toMatch(/^0x[a-f0-9]{64}$/);
    expect(sig.v).toBeGreaterThanOrEqual(27);
    expect(sig.v).toBeLessThanOrEqual(28);
  });

  it("signL1Action produces deterministic signatures for same inputs", async () => {
    const action = buildOrderAction({
      assetIndex: 0,
      isBuy: true,
      price: 30000,
      size: 0.01,
    });
    const nonce = 1700000000000;
    const sig1 = await signL1Action(TEST_PRIVATE_KEY, action, null, nonce);
    const sig2 = await signL1Action(TEST_PRIVATE_KEY, action, null, nonce);
    expect(sig1).toEqual(sig2);
  });

  it("signL1Action produces different signatures for different nonces", async () => {
    const action = buildOrderAction({
      assetIndex: 0,
      isBuy: true,
      price: 30000,
      size: 0.01,
    });
    const sig1 = await signL1Action(TEST_PRIVATE_KEY, action, null, 1700000000000);
    const sig2 = await signL1Action(TEST_PRIVATE_KEY, action, null, 1700000000001);
    expect(sig1.r).not.toEqual(sig2.r);
  });
});

describe("Hyperliquid API Connectivity", () => {
  it("fetches perpetual universe from info endpoint", async () => {
    const res = await axios.post(
      "https://api.hyperliquid.xyz/info",
      { type: "meta" },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    const universe = res.data?.universe;
    expect(Array.isArray(universe)).toBe(true);
    expect(universe.length).toBeGreaterThan(50);
    // BTC should be at index 0
    expect(universe[0].name).toBe("BTC");
    // ETH should be at index 1
    expect(universe[1].name).toBe("ETH");
    // Each asset should have szDecimals
    expect(typeof universe[0].szDecimals).toBe("number");
  });

  it("fetches mid prices for all coins", async () => {
    const res = await axios.post(
      "https://api.hyperliquid.xyz/info",
      { type: "allMids" },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    expect(res.data).toBeDefined();
    expect(typeof res.data.BTC).toBe("string");
    expect(parseFloat(res.data.BTC)).toBeGreaterThan(1000);
    expect(typeof res.data.ETH).toBe("string");
    expect(parseFloat(res.data.ETH)).toBeGreaterThan(100);
  });
});
