import crypto from "node:crypto";
import axios from "axios";
import type { InsertExchangeTradeFill } from "../../drizzle/schema";
import { InverseEngine } from "../../client/src/lib/inverseEngine";
import * as db from "../db";
import {
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
  type PrivateHistoryExchange,
} from "./exchangeHistoryCore";

export type ExchangeHistorySyncResult = {
  success: boolean;
  exchange: PrivateHistoryExchange;
  status: "complete" | "partial" | "failed";
  rowsFetched: number;
  rowsInserted: number;
  duplicatesIgnored: number;
  eligibleOutcomes: number;
  globalPatternsFound: number;
  symbolPatternsFound: number;
  retentionNote: string;
  error?: string;
};

type FetchResult = {
  sourceAccountHash: string;
  fills: InsertExchangeTradeFill[];
  status: "complete" | "partial";
  retentionNote: string;
  cursor?: string | null;
};

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function withOwner(
  userId: number,
  exchange: PrivateHistoryExchange,
  sourceAccountHash: string,
  fills: Array<Omit<InsertExchangeTradeFill, "userId" | "exchange" | "sourceAccountHash">>,
): InsertExchangeTradeFill[] {
  return fills.map((fill) => ({ ...fill, userId, exchange, sourceAccountHash }));
}

function hmacHex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function hmacBase64(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64");
}

async function fetchHyperliquid(userId: number): Promise<FetchResult> {
  const walletAddress = await db.getHyperliquidWalletAddress(userId);
  if (!walletAddress) throw new Error("No active Hyperliquid account configured");
  const exchange = "hyperliquid" as const;
  const sourceAccountHash = sourceAccountFingerprint(exchange, "mainnet", walletAddress);
  const normalized: Array<NonNullable<ReturnType<typeof normalizeHyperliquidFill>>> = [];
  let startTime = 0;
  let cursor: string | null = null;

  // userFillsByTime specifically returns at most 2,000 fills per response.
  // Walk at most five pages to respect the documented 10,000-fill retention cap.
  for (let page = 0; page < 5; page += 1) {
    const response = await axios.post(
      "https://api.hyperliquid.xyz/info",
      { type: "userFillsByTime", user: walletAddress, startTime, aggregateByTime: true },
      { headers: { "Content-Type": "application/json" }, timeout: 15_000 },
    );
    const rows = Array.isArray(response.data) ? response.data as Record<string, unknown>[] : [];
    normalized.push(...rows.map(normalizeHyperliquidFill).filter((row): row is NonNullable<typeof row> => row !== null));
    if (rows.length < 2_000) break;
    const latest = Math.max(...rows.map((row) => Number(row.time) || 0));
    if (latest <= startTime) break;
    startTime = latest + 1;
    cursor = String(startTime);
  }

  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: "complete",
    retentionNote: "Hyperliquid /info history is limited to the account's 10,000 most recent fills.",
    cursor,
  };
}

async function binanceGet(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  path: string,
  params: Record<string, string | number>,
) {
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    timestamp: String(Date.now()),
    recvWindow: "5000",
  }).toString();
  const signature = hmacHex(apiSecret, query);
  return axios.get(`${baseUrl}${path}?${query}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    timeout: 15_000,
  });
}

async function fetchBinance(userId: number): Promise<FetchResult> {
  const key = await db.getBinanceApiKey(userId);
  if (!key) throw new Error("No active Binance API key configured");
  const exchange = "binance" as const;
  const environment = key.isTestnet ? "testnet" : "mainnet";
  const sourceAccountHash = sourceAccountFingerprint(exchange, environment, key.apiKey);
  const baseUrl = key.isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
  const since = Date.now() - NINETY_DAYS_MS;
  const incomeResponse = await binanceGet(baseUrl, key.apiKey, key.apiSecret, "/fapi/v1/income", {
    incomeType: "REALIZED_PNL",
    startTime: since,
    limit: 1_000,
  });
  const incomeRows = Array.isArray(incomeResponse.data) ? incomeResponse.data as Array<Record<string, unknown>> : [];
  const symbolTimes = new Map<string, { first: number; last: number }>();
  for (const row of incomeRows) {
    const symbol = String(row.symbol ?? "").toUpperCase();
    const time = Number(row.time) || 0;
    if (!symbol || !time) continue;
    const current = symbolTimes.get(symbol);
    symbolTimes.set(symbol, {
      first: Math.min(current?.first ?? time, time),
      last: Math.max(current?.last ?? time, time),
    });
  }

  const allRows: Record<string, unknown>[] = [];
  const sortedSymbols = Array.from(symbolTimes.entries()).sort((a, b) => b[1].last - a[1].last);
  const selectedSymbols = sortedSymbols.slice(0, 30);
  for (const [symbol, times] of selectedSymbols) {
    let windowStart = Math.max(since, times.first - SEVEN_DAYS_MS);
    const finalEnd = Math.min(Date.now(), times.last + SEVEN_DAYS_MS);
    while (windowStart <= finalEnd) {
      const windowEnd = Math.min(finalEnd, windowStart + SEVEN_DAYS_MS - 1);
      const response = await binanceGet(baseUrl, key.apiKey, key.apiSecret, "/fapi/v1/userTrades", {
        symbol,
        startTime: windowStart,
        endTime: windowEnd,
        limit: 1_000,
      });
      if (Array.isArray(response.data)) allRows.push(...response.data);
      windowStart = windowEnd + 1;
    }
  }

  const normalized = allRows.map(normalizeBinanceFill).filter((row): row is NonNullable<typeof row> => row !== null);
  const truncatedSymbols = Math.max(0, sortedSymbols.length - selectedSymbols.length);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: truncatedSymbols > 0 || incomeRows.length >= 1_000 ? "partial" : "complete",
    retentionNote: `Binance USD-M API retains approximately three months and allows seven-day trade windows. ${truncatedSymbols > 0 ? `${truncatedSymbols} older/less-recent symbols were deferred to keep the one-time import rate-limit safe.` : "All symbols discovered in the recent realized-PnL page were queried."}`,
  };
}

async function bybitGet(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  path: string,
  params: Record<string, string>,
) {
  const query = new URLSearchParams(params).toString();
  const timestamp = String(Date.now());
  const recvWindow = "5000";
  const signature = hmacHex(apiSecret, timestamp + apiKey + recvWindow + query);
  return axios.get(`${baseUrl}${path}?${query}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
    timeout: 15_000,
  });
}

async function fetchBybit(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "bybit");
  if (!key) throw new Error("No active Bybit API key configured");
  const exchange = "bybit" as const;
  const environment = key.isTestnet ? "testnet" : "mainnet";
  const sourceAccountHash = sourceAccountFingerprint(exchange, environment, key.apiKey);
  const baseUrl = key.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  const rows: Record<string, unknown>[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const params: Record<string, string> = { category: "linear", limit: "100" };
    if (cursor) params.cursor = cursor;
    const response = await bybitGet(baseUrl, key.apiKey, key.apiSecret, "/v5/position/closed-pnl", params);
    const pageRows = response.data?.result?.list ?? [];
    rows.push(...pageRows);
    const nextCursor = String(response.data?.result?.nextPageCursor ?? "");
    if (!nextCursor || nextCursor === cursor || pageRows.length === 0) {
      cursor = nextCursor;
      break;
    }
    cursor = nextCursor;
  }
  const normalized = rows.map(normalizeBybitClosedPnl).filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: cursor ? "partial" : "complete",
    retentionNote: "Bybit closed-PnL history is imported in cursor pages; the exchange documents up to two years of retained records.",
    cursor: cursor || null,
  };
}

async function okxGet(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  path: string,
  isTestnet: boolean,
) {
  const timestamp = new Date().toISOString();
  const signature = hmacBase64(apiSecret, timestamp + "GET" + path);
  return axios.get(`https://www.okx.com${path}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      ...(isTestnet ? { "x-simulated-trading": "1" } : {}),
    },
    timeout: 15_000,
  });
}

async function fetchOkx(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "okx");
  if (!key?.passphrase) throw new Error("No active OKX API key configured");
  const exchange = "okx" as const;
  const environment = key.isTestnet ? "testnet" : "mainnet";
  const sourceAccountHash = sourceAccountFingerprint(exchange, environment, key.apiKey);
  const rows: Record<string, unknown>[] = [];
  let after = "";
  for (let page = 0; page < 20; page += 1) {
    const path = `/api/v5/trade/fills-history?instType=SWAP&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const response = await okxGet(key.apiKey, key.apiSecret, key.passphrase, path, key.isTestnet);
    const pageRows = response.data?.data ?? [];
    rows.push(...pageRows);
    const nextAfter = pageRows.length > 0 ? String(pageRows[pageRows.length - 1].tradeId ?? "") : "";
    if (pageRows.length < 100 || !nextAfter || nextAfter === after) {
      after = "";
      break;
    }
    after = nextAfter;
  }
  const normalized = rows.map(normalizeOkxFill).filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: after ? "partial" : "complete",
    retentionNote: "OKX fills-history provides approximately three months of transaction details and is imported in 100-fill cursor pages.",
    cursor: after || null,
  };
}

async function fetchAsterdex(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "asterdex");
  if (!key) throw new Error("No active AsterDEX API wallet configured");
  const exchange = "asterdex" as const;
  const { parseAsterWalletCredentials, asterV3Get } = await import("../asterdexSigning");
  const parsed = parseAsterWalletCredentials(key.apiKey, key.apiSecret);
  const accountId = parsed.isV3 ? parsed.userAddress : key.apiKey;
  const sourceAccountHash = sourceAccountFingerprint(exchange, "mainnet", accountId);
  const rows: Record<string, unknown>[] = [];
  const since = Date.now() - NINETY_DAYS_MS;

  for (let startTime = since; startTime < Date.now(); startTime += SEVEN_DAYS_MS) {
    const endTime = Math.min(Date.now(), startTime + SEVEN_DAYS_MS - 1);
    if (parsed.isV3) {
      const data = await asterV3Get(
        "/fapi/v3/userTrades",
        { startTime, endTime, limit: 1_000 },
        parsed.userAddress,
        parsed.signerAddress,
        parsed.privateKey,
      );
      if (Array.isArray(data)) rows.push(...data);
    } else {
      const query = new URLSearchParams({
        startTime: String(startTime),
        endTime: String(endTime),
        limit: "1000",
        timestamp: String(Date.now()),
        recvWindow: "5000",
      }).toString();
      const signature = hmacHex(key.apiSecret, query);
      const response = await axios.get(`https://fapi.asterdex.com/fapi/v1/userTrades?${query}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": key.apiKey },
        timeout: 15_000,
      });
      if (Array.isArray(response.data)) rows.push(...response.data);
    }
  }
  const normalized = rows.map(normalizeAsterFill).filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: "complete",
    retentionNote: "AsterDEX was queried in seven-day windows for the most recent 90 days; older exchange history was not claimed.",
  };
}

async function fetchMexc(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "mexc");
  if (!key) throw new Error("No active MEXC API key configured");
  const exchange = "mexc" as const;
  const sourceAccountHash = sourceAccountFingerprint(exchange, key.isTestnet ? "testnet" : "mainnet", key.apiKey);
  const rows: Record<string, unknown>[] = [];
  const startTime = Date.now() - NINETY_DAYS_MS;
  for (let pageNum = 1; pageNum <= 20; pageNum += 1) {
    const query = new URLSearchParams({
      start_time: String(startTime),
      end_time: String(Date.now()),
      page_num: String(pageNum),
      page_size: "100",
    }).toString();
    const requestTime = String(Date.now());
    const signature = hmacHex(key.apiSecret, key.apiKey + requestTime + query);
    const response = await axios.get(`https://contract.mexc.com/api/v1/private/order/list/order_deals?${query}`, {
      headers: { ApiKey: key.apiKey, "Request-Time": requestTime, Signature: signature },
      timeout: 15_000,
    });
    const pageRows = response.data?.data ?? [];
    if (Array.isArray(pageRows)) rows.push(...pageRows);
    if (!Array.isArray(pageRows) || pageRows.length < 100) break;
  }
  const normalized = rows.map(normalizeMexcFill).filter((row): row is NonNullable<typeof row> => row !== null);
  const eligible = normalized.filter((row) => row.eligibleForLearning === 1).length;
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: eligible < normalized.length ? "partial" : "complete",
    retentionNote: "MEXC deal history was bounded to 20 pages over the latest 90 days. Fills without reliable realized PnL are stored but excluded from learning.",
  };
}

async function kucoinGet(key: NonNullable<Awaited<ReturnType<typeof db.getCexApiKey>>>, path: string) {
  if (!key.passphrase) throw new Error("KuCoin passphrase is required");
  const timestamp = String(Date.now());
  const signature = hmacBase64(key.apiSecret, timestamp + "GET" + path);
  const signedPassphrase = hmacBase64(key.apiSecret, key.passphrase);
  return axios.get(`https://api-futures.kucoin.com${path}`, {
    headers: {
      "KC-API-KEY": key.apiKey,
      "KC-API-SIGN": signature,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": signedPassphrase,
      "KC-API-KEY-VERSION": "2",
    },
    timeout: 15_000,
  });
}

async function fetchKucoin(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "kucoin");
  if (!key?.passphrase) throw new Error("No active KuCoin Futures API key configured");
  const exchange = "kucoin" as const;
  const sourceAccountHash = sourceAccountFingerprint(exchange, key.isTestnet ? "testnet" : "mainnet", key.apiKey);
  const rows: Record<string, unknown>[] = [];
  const since = Date.now() - NINETY_DAYS_MS;
  for (let startAt = since; startAt < Date.now(); startAt += SEVEN_DAYS_MS) {
    const endAt = Math.min(Date.now(), startAt + SEVEN_DAYS_MS - 1);
    for (let currentPage = 1; currentPage <= 10; currentPage += 1) {
      const path = `/api/v1/fills?startAt=${startAt}&endAt=${endAt}&currentPage=${currentPage}&pageSize=500`;
      const response = await kucoinGet(key, path);
      const pageRows = response.data?.data?.items ?? [];
      if (Array.isArray(pageRows)) rows.push(...pageRows);
      if (!Array.isArray(pageRows) || pageRows.length < 500) break;
    }
  }
  const normalized = rows.map(normalizeKucoinFill).filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: "partial",
    retentionNote: "KuCoin Futures fill history was queried in seven-day windows for 90 days. Standard fill responses without realized PnL are stored but excluded from inverse learning.",
  };
}

async function fetchGateio(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "gateio");
  if (!key) throw new Error("No active Gate.io Futures API key configured");
  const exchange = "gateio" as const;
  const sourceAccountHash = sourceAccountFingerprint(exchange, key.isTestnet ? "testnet" : "mainnet", key.apiKey);
  const rows: Record<string, unknown>[] = [];
  const path = "/api/v4/futures/usdt/my_trades";
  const emptyBodyHash = crypto.createHash("sha512").update("").digest("hex");
  for (let offset = 0; offset < 2_000; offset += 100) {
    const query = `limit=100&offset=${offset}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signaturePayload = `GET\n${path}\n${query}\n${emptyBodyHash}\n${timestamp}`;
    const signature = crypto.createHmac("sha512", key.apiSecret).update(signaturePayload).digest("hex");
    const response = await axios.get(`https://api.gateio.ws${path}?${query}`, {
      headers: { KEY: key.apiKey, SIGN: signature, Timestamp: timestamp },
      timeout: 15_000,
    });
    const pageRows = Array.isArray(response.data) ? response.data : [];
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }
  const normalized = rows.map(normalizeGateFill).filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: "partial",
    retentionNote: "Gate.io personal fills were bounded to 2,000 recent rows. Fill rows without matched position-close PnL are stored but excluded from inverse learning.",
  };
}

async function fetchBitget(userId: number): Promise<FetchResult> {
  const key = await db.getCexApiKey(userId, "bitget");
  if (!key?.passphrase) throw new Error("No active Bitget Futures API key configured");
  const exchange = "bitget" as const;
  const sourceAccountHash = sourceAccountFingerprint(exchange, key.isTestnet ? "testnet" : "mainnet", key.apiKey);
  const rows: Record<string, unknown>[] = [];
  let idLessThan = "";
  for (let page = 0; page < 20; page += 1) {
    const path = `/api/v2/mix/order/fills?productType=USDT-FUTURES&limit=100${idLessThan ? `&idLessThan=${encodeURIComponent(idLessThan)}` : ""}`;
    const timestamp = String(Date.now());
    const signature = hmacBase64(key.apiSecret, timestamp + "GET" + path);
    const response = await axios.get(`https://api.bitget.com${path}`, {
      headers: {
        "ACCESS-KEY": key.apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": key.passphrase,
      },
      timeout: 15_000,
    });
    const pageRows = response.data?.data?.fillList ?? response.data?.data ?? [];
    if (Array.isArray(pageRows)) rows.push(...pageRows);
    const nextId = Array.isArray(pageRows) && pageRows.length > 0 ? String(pageRows[pageRows.length - 1].tradeId ?? "") : "";
    if (!Array.isArray(pageRows) || pageRows.length < 100 || !nextId || nextId === idLessThan) {
      idLessThan = "";
      break;
    }
    idLessThan = nextId;
  }
  const normalized = rows.map(normalizeBitgetFill).filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    sourceAccountHash,
    fills: withOwner(userId, exchange, sourceAccountHash, normalized),
    status: idLessThan ? "partial" : "complete",
    retentionNote: "Bitget USDT Futures fills were bounded to 20 cursor pages within the exchange's recent-history retention window.",
    cursor: idLessThan || null,
  };
}

async function fetchHistory(userId: number, exchange: PrivateHistoryExchange): Promise<FetchResult> {
  if (exchange === "hyperliquid") return fetchHyperliquid(userId);
  if (exchange === "binance") return fetchBinance(userId);
  if (exchange === "bybit") return fetchBybit(userId);
  if (exchange === "okx") return fetchOkx(userId);
  if (exchange === "asterdex") return fetchAsterdex(userId);
  if (exchange === "mexc") return fetchMexc(userId);
  if (exchange === "kucoin") return fetchKucoin(userId);
  if (exchange === "gateio") return fetchGateio(userId);
  if (exchange === "bitget") return fetchBitget(userId);
  throw new Error(`${exchange} history adapter is not enabled; no patterns were changed`);
}

/** Internal deterministic test seam; production callers use syncUserExchangeHistory. */
export const exchangeHistoryAdapterTestHooks = { fetchHistory };

async function rebuildPrivatePatterns(userId: number) {
  const storedFills = await db.getUserExchangeLearningFills(userId);
  const trades = buildLearningTrades(storedFills);
  const engine = new InverseEngine(trades);
  const globalPatterns = engine.analyzePatterns();
  const symbolPatterns = engine.analyzeSymbolPatterns(5);
  const totalWins = trades.filter((trade) => trade.pnl > 0).length;
  const totalLosses = trades.filter((trade) => trade.pnl < 0).length;

  await db.saveUserPatterns(userId, globalPatterns.map((pattern) => ({
    patternType: pattern.type,
    confidence: Math.round(pattern.confidence),
    description: pattern.description,
    action: pattern.action,
    tradeCount: trades.length,
    totalWins,
    totalLosses,
  })), "exchange");
  await db.saveUserSymbolPatterns(userId, symbolPatterns.map((pattern) => ({
    symbol: pattern.symbol,
    tradeCount: pattern.tradeCount,
    wins: pattern.wins,
    losses: pattern.losses,
    winRate: Math.round(pattern.winRate),
    avgPnlCents: Math.round(pattern.avgPnl * 100),
    totalPnlCents: Math.round(pattern.totalPnl * 100),
    dominantSide: pattern.dominantSide,
    bias: pattern.bias,
    confidenceAdjustment: pattern.confidenceAdjustment,
    action: pattern.action,
    summary: pattern.summary,
  })), "exchange");
  return { eligibleOutcomes: trades.length, globalPatternsFound: globalPatterns.length, symbolPatternsFound: symbolPatterns.length };
}

export async function syncUserExchangeHistory(
  userId: number,
  exchange: PrivateHistoryExchange,
): Promise<ExchangeHistorySyncResult> {
  let sourceAccountHash = sourceAccountFingerprint(exchange, "mainnet", `user:${userId}:unresolved`);
  const attemptAt = new Date();
  try {
    const fetched = await fetchHistory(userId, exchange);
    sourceAccountHash = fetched.sourceAccountHash;
    await db.upsertExchangeHistorySyncState({
      userId,
      exchange,
      sourceAccountHash,
      status: "running",
      lastAttemptAt: attemptAt,
      retentionNote: fetched.retentionNote,
      lastError: null,
    });
    const persisted = await db.insertExchangeTradeFills(fetched.fills);
    const patterns = await rebuildPrivatePatterns(userId);
    const timestamps = fetched.fills.map((fill) => Number(fill.executedAtMs)).filter(Number.isFinite);
    await db.upsertExchangeHistorySyncState({
      userId,
      exchange,
      sourceAccountHash,
      status: fetched.status,
      cursor: fetched.cursor ?? null,
      rowsFetched: fetched.fills.length,
      rowsInserted: persisted.inserted,
      eligibleOutcomes: patterns.eligibleOutcomes,
      earliestImportedAtMs: timestamps.length ? Math.min(...timestamps) : null,
      latestImportedAtMs: timestamps.length ? Math.max(...timestamps) : null,
      retentionNote: fetched.retentionNote,
      lastError: null,
      lastAttemptAt: attemptAt,
      lastSuccessAt: new Date(),
    });
    return {
      success: true,
      exchange,
      status: fetched.status,
      rowsFetched: fetched.fills.length,
      rowsInserted: persisted.inserted,
      duplicatesIgnored: persisted.duplicates,
      eligibleOutcomes: patterns.eligibleOutcomes,
      globalPatternsFound: patterns.globalPatternsFound,
      symbolPatternsFound: patterns.symbolPatternsFound,
      retentionNote: fetched.retentionNote,
    };
  } catch (error: any) {
    const message = error?.response?.data?.msg || error?.response?.data?.retMsg || error?.message || "History import failed";
    await db.upsertExchangeHistorySyncState({
      userId,
      exchange,
      sourceAccountHash,
      status: "failed",
      lastAttemptAt: attemptAt,
      lastError: message,
    }).catch(() => undefined);
    return {
      success: false,
      exchange,
      status: "failed",
      rowsFetched: 0,
      rowsInserted: 0,
      duplicatesIgnored: 0,
      eligibleOutcomes: 0,
      globalPatternsFound: 0,
      symbolPatternsFound: 0,
      retentionNote: "No recurring synchronization is enabled. Retry manually after correcting the connection.",
      error: message,
    };
  }
}
