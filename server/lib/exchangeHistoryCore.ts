import crypto from "node:crypto";
import type { InsertExchangeTradeFill } from "../../drizzle/schema";
import type { TradeRecord } from "../../client/src/lib/csvParser";

export const PRIVATE_HISTORY_EXCHANGES = [
  "hyperliquid",
  "binance",
  "bybit",
  "okx",
  "asterdex",
  "mexc",
  "kucoin",
  "gateio",
  "bitget",
] as const;

export type PrivateHistoryExchange = typeof PRIVATE_HISTORY_EXCHANGES[number];

export function assertSingleOwnerBatch(
  rows: Array<{ userId: number; exchange: string; sourceAccountHash: string }>,
): void {
  if (rows.length < 2) return;
  const owner = rows[0];
  const mixed = rows.some((row) =>
    row.userId !== owner.userId
    || row.exchange !== owner.exchange
    || row.sourceAccountHash !== owner.sourceAccountHash,
  );
  if (mixed) throw new Error("Refusing to persist a mixed-owner exchange history batch");
}

type FillBase = Omit<InsertExchangeTradeFill, "userId" | "exchange" | "sourceAccountHash">;

function decimalString(value: unknown, fallback = "0"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(value) : fallback;
}

function timestampMs(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : Date.now();
}

function stableFallbackId(exchange: PrivateHistoryExchange, parts: unknown[]): string {
  return `${exchange}:derived:${crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

export function sourceAccountFingerprint(
  exchange: PrivateHistoryExchange,
  environment: "mainnet" | "testnet",
  accountIdentifier: string,
): string {
  return crypto.createHash("sha256")
    .update(`${exchange}:${environment}:${accountIdentifier.trim().toLowerCase()}`)
    .digest("hex");
}

export function normalizeLearningSymbol(symbol: unknown): string {
  return String(symbol ?? "")
    .toUpperCase()
    .replace(/-SWAP$/, "")
    .replace(/[-_/.:]/g, "")
    .replace(/PERP$/, "")
    .trim();
}

function hasKnownRealizedPnl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

export function normalizeHyperliquidFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.coin);
  if (!symbol) return null;
  const direction = String(raw.dir ?? "");
  const positionSide = /long/i.test(direction) ? "LONG" : /short/i.test(direction) ? "SHORT" : null;
  const positionEffect = /^close/i.test(direction) ? "CLOSE" : /^open/i.test(direction) ? "OPEN" : "UNKNOWN";
  const realizedKnown = hasKnownRealizedPnl(raw.closedPnl);
  const executedAtMs = timestampMs(raw.time);
  const externalFillId = String(raw.tid ?? raw.hash ?? "") || stableFallbackId("hyperliquid", [raw.oid, raw.coin, raw.time, raw.px, raw.sz, raw.side]);
  return {
    externalFillId,
    externalOrderId: raw.oid === undefined ? null : String(raw.oid),
    symbol,
    side: String(raw.side).toUpperCase() === "B" ? "BUY" : "SELL",
    positionSide,
    positionEffect,
    price: decimalString(raw.px),
    quantity: decimalString(raw.sz),
    fee: raw.fee === undefined ? null : decimalString(raw.fee),
    feeAsset: raw.feeToken === undefined ? null : String(raw.feeToken).toUpperCase(),
    realizedPnl: realizedKnown ? decimalString(raw.closedPnl) : null,
    executedAtMs,
    eligibleForLearning: positionEffect === "CLOSE" && positionSide !== null && realizedKnown ? 1 : 0,
  };
}

export function normalizeBinanceFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.symbol);
  if (!symbol || raw.id === undefined) return null;
  const executionSide = String(raw.side).toUpperCase() === "BUY" ? "BUY" : "SELL";
  const rawPositionSide = String(raw.positionSide ?? "").toUpperCase();
  const realizedKnown = hasKnownRealizedPnl(raw.realizedPnl);
  const realized = realizedKnown ? Number(raw.realizedPnl) : 0;
  const positionSide = rawPositionSide === "LONG" || rawPositionSide === "SHORT"
    ? rawPositionSide
    : realized !== 0
      ? executionSide === "SELL" ? "LONG" : "SHORT"
      : null;
  const positionEffect = realized !== 0 && positionSide ? "CLOSE" : "UNKNOWN";
  return {
    externalFillId: String(raw.id),
    externalOrderId: raw.orderId === undefined ? null : String(raw.orderId),
    symbol,
    side: executionSide,
    positionSide,
    positionEffect,
    price: decimalString(raw.price),
    quantity: decimalString(raw.qty),
    fee: raw.commission === undefined ? null : decimalString(raw.commission),
    feeAsset: raw.commissionAsset === undefined ? null : String(raw.commissionAsset).toUpperCase(),
    realizedPnl: realizedKnown ? decimalString(raw.realizedPnl) : null,
    executedAtMs: timestampMs(raw.time),
    eligibleForLearning: positionEffect === "CLOSE" && realizedKnown ? 1 : 0,
  };
}

export function normalizeBybitClosedPnl(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.symbol);
  if (!symbol) return null;
  const executionSide = String(raw.side).toLowerCase() === "buy" ? "BUY" : "SELL";
  const realizedKnown = hasKnownRealizedPnl(raw.closedPnl);
  const executedAtMs = timestampMs(raw.updatedTime ?? raw.createdTime);
  const externalFillId = String(raw.orderId ?? "") || stableFallbackId("bybit", [raw.symbol, executedAtMs, raw.avgEntryPrice, raw.avgExitPrice, raw.closedSize]);
  return {
    externalFillId: `closed:${externalFillId}:${executedAtMs}`,
    externalOrderId: raw.orderId === undefined ? null : String(raw.orderId),
    symbol,
    side: executionSide,
    // In closed-PnL history the order side is the closing execution side.
    positionSide: executionSide === "BUY" ? "SHORT" : "LONG",
    positionEffect: "CLOSE",
    price: decimalString(raw.avgExitPrice),
    quantity: decimalString(raw.closedSize ?? raw.qty),
    fee: null,
    feeAsset: null,
    realizedPnl: realizedKnown ? decimalString(raw.closedPnl) : null,
    executedAtMs,
    eligibleForLearning: realizedKnown ? 1 : 0,
  };
}

export function normalizeOkxFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.instId);
  if (!symbol || raw.tradeId === undefined) return null;
  const executionSide = String(raw.side).toLowerCase() === "buy" ? "BUY" : "SELL";
  const rawPositionSide = String(raw.posSide ?? "").toUpperCase();
  const realizedKnown = hasKnownRealizedPnl(raw.fillPnl);
  const realized = realizedKnown ? Number(raw.fillPnl) : 0;
  const positionSide = rawPositionSide === "LONG" || rawPositionSide === "SHORT"
    ? rawPositionSide
    : realized !== 0
      ? executionSide === "SELL" ? "LONG" : "SHORT"
      : null;
  const positionEffect = realized !== 0 && positionSide ? "CLOSE" : "UNKNOWN";
  return {
    externalFillId: String(raw.tradeId),
    externalOrderId: raw.ordId === undefined ? null : String(raw.ordId),
    symbol,
    side: executionSide,
    positionSide,
    positionEffect,
    price: decimalString(raw.fillPx),
    quantity: decimalString(raw.fillSz),
    fee: raw.fee === undefined ? null : decimalString(raw.fee),
    feeAsset: raw.feeCcy === undefined ? null : String(raw.feeCcy).toUpperCase(),
    realizedPnl: realizedKnown ? decimalString(raw.fillPnl) : null,
    executedAtMs: timestampMs(raw.ts),
    eligibleForLearning: positionEffect === "CLOSE" && realizedKnown ? 1 : 0,
  };
}

export function normalizeAsterFill(raw: Record<string, unknown>): FillBase | null {
  const mapped = normalizeBinanceFill(raw);
  if (!mapped) return null;
  return {
    ...mapped,
    externalFillId: String(raw.id ?? mapped.externalFillId),
  };
}

export function normalizeMexcFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.symbol);
  if (!symbol) return null;
  const sideCode = Number(raw.side);
  const executionSide: "BUY" | "SELL" = sideCode === 1 || sideCode === 2 ? "BUY" : "SELL";
  const positionSide = sideCode === 2 ? "SHORT" : sideCode === 4 ? "LONG" : sideCode === 1 ? "LONG" : sideCode === 3 ? "SHORT" : null;
  const positionEffect = sideCode === 2 || sideCode === 4 ? "CLOSE" : sideCode === 1 || sideCode === 3 ? "OPEN" : "UNKNOWN";
  const realizedSource = raw.profit ?? raw.realizedPnl;
  const realizedKnown = hasKnownRealizedPnl(realizedSource);
  const executedAtMs = timestampMs(raw.timestamp ?? raw.createTime);
  const externalFillId = String(raw.id ?? "") || stableFallbackId("mexc", [raw.orderId, raw.symbol, executedAtMs, raw.price, raw.vol, raw.side]);
  return {
    externalFillId,
    externalOrderId: raw.orderId === undefined ? null : String(raw.orderId),
    symbol,
    side: executionSide,
    positionSide,
    positionEffect,
    price: decimalString(raw.price),
    quantity: decimalString(raw.vol ?? raw.quantity),
    fee: raw.fee === undefined ? null : decimalString(raw.fee),
    feeAsset: raw.feeCurrency === undefined ? null : String(raw.feeCurrency).toUpperCase(),
    realizedPnl: realizedKnown ? decimalString(realizedSource) : null,
    executedAtMs,
    eligibleForLearning: positionEffect === "CLOSE" && positionSide !== null && realizedKnown ? 1 : 0,
  };
}

export function normalizeKucoinFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.symbol);
  if (!symbol || raw.tradeId === undefined) return null;
  const executionSide = String(raw.side).toLowerCase() === "buy" ? "BUY" : "SELL";
  const rawPositionSide = String(raw.positionSide ?? "").toUpperCase();
  const positionSide = rawPositionSide === "LONG" || rawPositionSide === "SHORT" ? rawPositionSide : null;
  const realizedSource = raw.realizedPnl;
  const realizedKnown = hasKnownRealizedPnl(realizedSource);
  const closeFee = Number(raw.closeFeePay ?? 0);
  const positionEffect = closeFee !== 0 ? "CLOSE" : "UNKNOWN";
  const rawTime = Number(raw.createdAt ?? raw.tradeTime);
  const executedAtMs = raw.tradeTime && rawTime > 10_000_000_000_000 ? Math.trunc(rawTime / 1_000_000) : timestampMs(rawTime);
  return {
    externalFillId: String(raw.tradeId),
    externalOrderId: raw.orderId === undefined ? null : String(raw.orderId),
    symbol,
    side: executionSide,
    positionSide,
    positionEffect,
    price: decimalString(raw.price),
    quantity: decimalString(raw.size),
    fee: raw.fee === undefined ? null : decimalString(raw.fee),
    feeAsset: raw.feeCurrency === undefined ? null : String(raw.feeCurrency).toUpperCase(),
    realizedPnl: realizedKnown ? decimalString(realizedSource) : null,
    executedAtMs,
    // Official fill history does not reliably provide realized PnL; fail closed.
    eligibleForLearning: positionEffect === "CLOSE" && positionSide !== null && realizedKnown ? 1 : 0,
  };
}

export function normalizeGateFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.contract);
  if (!symbol || raw.id === undefined) return null;
  const size = Number(raw.size);
  const executionSide: "BUY" | "SELL" = size >= 0 ? "BUY" : "SELL";
  const closeSize = Math.abs(Number(raw.close_size ?? 0));
  const positionEffect = closeSize > 0 ? "CLOSE" : "OPEN";
  const positionSide = positionEffect === "CLOSE" ? executionSide === "BUY" ? "SHORT" : "LONG" : executionSide === "BUY" ? "LONG" : "SHORT";
  const realizedSource = raw.pnl ?? raw.realizedPnl;
  const realizedKnown = hasKnownRealizedPnl(realizedSource);
  const createTime = Number(raw.create_time_ms ?? raw.create_time);
  const executedAtMs = raw.create_time_ms !== undefined ? timestampMs(createTime) : timestampMs(createTime * 1_000);
  return {
    externalFillId: String(raw.id),
    externalOrderId: raw.order_id === undefined ? null : String(raw.order_id),
    symbol,
    side: executionSide,
    positionSide,
    positionEffect,
    price: decimalString(raw.price),
    quantity: decimalString(Math.abs(size)),
    fee: raw.fee === undefined ? null : decimalString(raw.fee),
    feeAsset: "USDT",
    realizedPnl: realizedKnown ? decimalString(realizedSource) : null,
    executedAtMs,
    eligibleForLearning: positionEffect === "CLOSE" && realizedKnown ? 1 : 0,
  };
}

export function normalizeBitgetFill(raw: Record<string, unknown>): FillBase | null {
  const symbol = normalizeLearningSymbol(raw.symbol);
  const fillId = raw.execId ?? raw.tradeId;
  if (!symbol || fillId === undefined) return null;
  const executionSide = String(raw.side).toLowerCase() === "buy" ? "BUY" : "SELL";
  const tradeSide = String(raw.tradeSide ?? raw.posSide ?? "").toLowerCase();
  const positionEffect = tradeSide.includes("close") || tradeSide.includes("reduce") ? "CLOSE" : tradeSide.includes("open") ? "OPEN" : "UNKNOWN";
  const positionSide = tradeSide.includes("long") ? "LONG" : tradeSide.includes("short") ? "SHORT" : positionEffect === "CLOSE" ? executionSide === "BUY" ? "SHORT" : "LONG" : null;
  const realizedSource = raw.execPnl ?? raw.profit;
  const realizedKnown = hasKnownRealizedPnl(realizedSource);
  return {
    externalFillId: String(fillId),
    externalOrderId: raw.orderId === undefined ? null : String(raw.orderId),
    symbol,
    side: executionSide,
    positionSide,
    positionEffect,
    price: decimalString(raw.execPrice ?? raw.price),
    quantity: decimalString(raw.execQty ?? raw.baseVolume ?? raw.size),
    fee: raw.totalFee === undefined ? null : decimalString(raw.totalFee),
    feeAsset: raw.feeCoin === undefined ? null : String(raw.feeCoin).toUpperCase(),
    realizedPnl: realizedKnown ? decimalString(realizedSource) : null,
    executedAtMs: timestampMs(raw.createdTime ?? raw.cTime),
    eligibleForLearning: positionEffect === "CLOSE" && positionSide !== null && realizedKnown ? 1 : 0,
  };
}

export function buildLearningTrades(fills: Array<{
  exchange: string;
  sourceAccountHash: string;
  externalFillId: string;
  externalOrderId: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  positionSide: string | null;
  price: string;
  quantity: string;
  fee: string | null;
  realizedPnl: string | null;
  executedAtMs: number;
  eligibleForLearning: number;
}>): TradeRecord[] {
  const groups = new Map<string, typeof fills>();
  for (const fill of fills) {
    if (fill.eligibleForLearning !== 1 || fill.realizedPnl === null) continue;
    const positionSide = fill.positionSide === "LONG" || fill.positionSide === "SHORT"
      ? fill.positionSide
      : null;
    if (!positionSide) continue;
    const groupKey = [
      fill.exchange,
      fill.sourceAccountHash,
      fill.symbol,
      positionSide,
      fill.externalOrderId ?? fill.externalFillId,
    ].join(":");
    const group = groups.get(groupKey) ?? [];
    group.push(fill);
    groups.set(groupKey, group);
  }

  return Array.from(groups.entries()).map(([id, group]) => {
    const quantity = group.reduce((sum, fill) => sum + Math.abs(Number(fill.quantity) || 0), 0);
    const weightedPrice = group.reduce(
      (sum, fill) => sum + (Number(fill.price) || 0) * Math.abs(Number(fill.quantity) || 0),
      0,
    );
    const pnl = group.reduce((sum, fill) => sum + (Number(fill.realizedPnl) || 0), 0);
    const fee = group.reduce((sum, fill) => sum + Math.abs(Number(fill.fee) || 0), 0);
    const lastTimestamp = Math.max(...group.map((fill) => fill.executedAtMs));
    const side: TradeRecord["side"] = group[0].positionSide === "LONG" ? "BUY" : "SELL";
    return {
      id,
      symbol: group[0].symbol,
      side,
      price: quantity > 0 ? weightedPrice / quantity : Number(group[0].price) || 0,
      quantity,
      pnl,
      timestamp: lastTimestamp,
      fee,
    };
  }).sort((a, b) => a.timestamp - b.timestamp);
}
