import { describe, expect, it } from "vitest";
import {
  assertSingleOwnerBatch,
  buildLearningTrades,
  normalizeAsterFill,
  normalizeBinanceFill,
  normalizeBitgetFill,
  normalizeBybitClosedPnl,
  normalizeGateFill,
  normalizeHyperliquidFill,
  normalizeKucoinFill,
  normalizeMexcFill,
  normalizeOkxFill,
  sourceAccountFingerprint,
} from "./lib/exchangeHistoryCore";

describe("private exchange history normalization", () => {
  it("fails closed when a persistence batch mixes users or source accounts", () => {
    expect(() => assertSingleOwnerBatch([
      { userId: 1, exchange: "hyperliquid", sourceAccountHash: "account-a" },
      { userId: 2, exchange: "hyperliquid", sourceAccountHash: "account-a" },
    ])).toThrow(/mixed-owner/);
    expect(() => assertSingleOwnerBatch([
      { userId: 1, exchange: "hyperliquid", sourceAccountHash: "account-a" },
      { userId: 1, exchange: "hyperliquid", sourceAccountHash: "account-b" },
    ])).toThrow(/mixed-owner/);
  });

  it("creates deterministic non-reversible account fingerprints", () => {
    const first = sourceAccountFingerprint("binance", "mainnet", "secret-api-key");
    const second = sourceAccountFingerprint("binance", "mainnet", "secret-api-key");
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toContain("secret-api-key");
    expect(sourceAccountFingerprint("binance", "testnet", "secret-api-key")).not.toBe(first);
  });

  it("learns only deterministic Hyperliquid closing outcomes", () => {
    const close = normalizeHyperliquidFill({
      tid: 101,
      oid: 55,
      coin: "BTC",
      side: "A",
      dir: "Close Long",
      px: "64000",
      sz: "0.01",
      closedPnl: "12.5",
      fee: "0.2",
      feeToken: "USDC",
      time: 1_700_000_000_000,
    });
    const open = normalizeHyperliquidFill({
      tid: 102,
      coin: "BTC",
      side: "B",
      dir: "Open Long",
      px: "63000",
      sz: "0.01",
      closedPnl: "0",
      time: 1_699_000_000_000,
    });
    expect(close).toMatchObject({ positionSide: "LONG", positionEffect: "CLOSE", eligibleForLearning: 1 });
    expect(open).toMatchObject({ positionEffect: "OPEN", eligibleForLearning: 0 });
  });

  it("maps Binance and OKX net-mode closing executions back to the original position direction", () => {
    expect(normalizeBinanceFill({
      id: 1, orderId: 2, symbol: "ETHUSDT", side: "SELL", positionSide: "BOTH",
      price: "3000", qty: "1", commission: "1", commissionAsset: "USDT",
      realizedPnl: "25", time: 1_700_000_000_000,
    })).toMatchObject({ positionSide: "LONG", positionEffect: "CLOSE", eligibleForLearning: 1 });
    expect(normalizeOkxFill({
      tradeId: "3", ordId: "4", instId: "ETH-USDT-SWAP", side: "buy", posSide: "net",
      fillPx: "2900", fillSz: "1", fee: "-1", feeCcy: "USDT",
      fillPnl: "-30", ts: "1700000000000",
    })).toMatchObject({ symbol: "ETHUSDT", positionSide: "SHORT", positionEffect: "CLOSE", eligibleForLearning: 1 });
  });

  it("treats a Bybit closed-PnL Buy as the closing execution of a short", () => {
    expect(normalizeBybitClosedPnl({
      orderId: "abc", symbol: "SOLUSDT", side: "Buy", avgExitPrice: "150",
      closedSize: "2", closedPnl: "8", updatedTime: "1700000000000",
    })).toMatchObject({ positionSide: "SHORT", positionEffect: "CLOSE", eligibleForLearning: 1 });
  });

  it("fails closed when an exchange fill cannot prove realized PnL", () => {
    expect(normalizeKucoinFill({
      tradeId: "k1", orderId: "o1", symbol: "XBTUSDTM", side: "sell",
      price: "65000", size: "1", closeFeePay: "0.2", createdAt: 1_700_000_000_000,
    })).toMatchObject({ eligibleForLearning: 0 });
    expect(normalizeGateFill({
      id: "g1", order_id: "o2", contract: "BTC_USDT", size: "-1",
      close_size: "1", price: "65000", create_time: 1_700_000_000,
    })).toMatchObject({ positionSide: "LONG", positionEffect: "CLOSE", eligibleForLearning: 0 });
  });

  it("normalizes supported realized-PnL fills from Aster, MEXC, and Bitget", () => {
    expect(normalizeAsterFill({
      id: "a1", orderId: "o1", symbol: "BTCUSDT", side: "SELL", positionSide: "BOTH",
      price: "65000", qty: "0.01", realizedPnl: "5", time: 1_700_000_000_000,
    })).toMatchObject({ positionSide: "LONG", eligibleForLearning: 1 });
    expect(normalizeMexcFill({
      id: "m1", orderId: "o2", symbol: "ETH_USDT", side: 2, price: "3000",
      vol: "1", profit: "4", timestamp: 1_700_000_000_000,
    })).toMatchObject({ positionSide: "SHORT", positionEffect: "CLOSE", eligibleForLearning: 1 });
    expect(normalizeBitgetFill({
      tradeId: "b1", orderId: "o3", symbol: "SOLUSDT", side: "sell", tradeSide: "close_long",
      price: "150", baseVolume: "2", profit: "8", cTime: 1_700_000_000_000,
    })).toMatchObject({ positionSide: "LONG", positionEffect: "CLOSE", eligibleForLearning: 1 });
  });

  it("aggregates partial closing fills once per order before inverse learning", () => {
    const fills = [
      { exchange: "hyperliquid", sourceAccountHash: "hash", externalFillId: "1", externalOrderId: "10", symbol: "BTCUSDC", side: "SELL" as const, positionSide: "LONG", price: "101", quantity: "1", fee: "0.1", realizedPnl: "5", executedAtMs: 1000, eligibleForLearning: 1 },
      { exchange: "hyperliquid", sourceAccountHash: "hash", externalFillId: "2", externalOrderId: "10", symbol: "BTCUSDC", side: "SELL" as const, positionSide: "LONG", price: "103", quantity: "1", fee: "0.1", realizedPnl: "7", executedAtMs: 1001, eligibleForLearning: 1 },
      { exchange: "hyperliquid", sourceAccountHash: "hash", externalFillId: "3", externalOrderId: "11", symbol: "BTCUSDC", side: "BUY" as const, positionSide: "LONG", price: "99", quantity: "1", fee: "0.1", realizedPnl: "0", executedAtMs: 900, eligibleForLearning: 0 },
    ];
    expect(buildLearningTrades(fills)).toEqual([expect.objectContaining({
      side: "BUY",
      quantity: 2,
      price: 102,
      pnl: 12,
      fee: 0.2,
      timestamp: 1001,
    })]);
  });
});
