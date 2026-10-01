/**
 * Hyperliquid EIP-712 signing utility.
 * Implements the L1 action signing scheme used by the Hyperliquid exchange.
 *
 * Based on the official Hyperliquid TypeScript SDK (nomeida/hyperliquid):
 *   - phantomDomain: chainId 1337, name "Exchange"
 *   - signL1Action: msgpack(action) + nonce + vaultAddress → keccak256 → EIP-712 Agent type
 *
 * References:
 *   https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 *   https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing
 */

import { encode } from "@msgpack/msgpack";
import { ethers, getBytes, keccak256 } from "ethers";

// ─── EIP-712 domain & types ────────────────────────────────────────────────

const PHANTOM_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

const AGENT_TYPES: Record<string, { name: string; type: string }[]> = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function addressToBytes(address: string): Uint8Array {
  return getBytes(address);
}

/**
 * Normalise trailing zeros from price ("p") and size ("s") fields recursively.
 * Hyperliquid requires e.g. "100.0" not "100.00".
 */
function normalizeTrailingZeros(obj: unknown): unknown {
  if (typeof obj === "string") {
    // Only normalise if it looks like a decimal number
    if (/^\d+\.\d+$/.test(obj)) {
      return obj.replace(/\.?0+$/, "") || "0";
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(normalizeTrailingZeros);
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = normalizeTrailingZeros(v);
    }
    return out;
  }
  return obj;
}

/**
 * Build the action hash: keccak256(msgpack(action) ++ nonce ++ vaultFlag [++ vaultAddress])
 */
export function getL1ActionHash(
  action: unknown,
  vaultAddress: string | null,
  nonce: number
): string {
  const normalised = normalizeTrailingZeros(action);
  const msgPackBytes = encode(normalised);
  const additionalBytesLength = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    data.set(addressToBytes(vaultAddress), msgPackBytes.length + 9);
  }
  return keccak256(data);
}

function constructPhantomAgent(hash: string, isMainnet: boolean) {
  return { source: isMainnet ? "a" : "b", connectionId: hash };
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface HlSignature {
  r: string;
  s: string;
  v: number;
}

/**
 * Sign a Hyperliquid L1 action (order, cancel, leverage update, etc.)
 * using the EIP-712 phantom agent scheme.
 */
export async function signL1Action(
  privateKey: string,
  action: unknown,
  vaultAddress: string | null,
  nonce: number,
  isMainnet = true
): Promise<HlSignature> {
  const wallet = new ethers.Wallet(privateKey);
  const hash = getL1ActionHash(action, vaultAddress, nonce);
  const phantomAgent = constructPhantomAgent(hash, isMainnet);

  const sig = await wallet.signTypedData(
    PHANTOM_DOMAIN,
    AGENT_TYPES,
    phantomAgent
  );

  // ethers returns a 132-char hex string "0x{r}{s}{v}"
  const r = "0x" + sig.slice(2, 66);
  const s = "0x" + sig.slice(66, 130);
  const v = parseInt(sig.slice(130, 132), 16);
  return { r, s, v };
}

/**
 * Derive the public Ethereum address from a private key.
 */
export function privateKeyToAddress(privateKey: string): string {
  return new ethers.Wallet(privateKey).address.toLowerCase();
}

/**
 * Convert a float price/size to the wire string format Hyperliquid expects.
 * Removes trailing zeros (e.g. "100.10" → "100.1", "100.00" → "100").
 */
export function floatToWire(n: number): string {
  const s = n.toFixed(8);
  return s.replace(/\.?0+$/, "") || "0";
}

// ─── Order building helpers ────────────────────────────────────────────────

export interface HlOrderParams {
  /** Asset index from /info meta response */
  assetIndex: number;
  /** true = buy/long, false = sell/short */
  isBuy: boolean;
  /** Limit price (use slippage-adjusted market price for market orders) */
  price: number;
  /** Size in base asset units */
  size: number;
  /** reduceOnly flag */
  reduceOnly?: boolean;
  /** "Gtc" | "Ioc" | "Alo" */
  tif?: "Gtc" | "Ioc" | "Alo";
}

/**
 * Build the action object for a single limit/market order.
 * For market orders, pass tif: "Ioc" with a slippage-adjusted price.
 */
export function buildOrderAction(order: HlOrderParams) {
  return {
    type: "order",
    orders: [
      {
        a: order.assetIndex,
        b: order.isBuy,
        p: floatToWire(order.price),
        s: floatToWire(order.size),
        r: order.reduceOnly ?? false,
        t: { limit: { tif: order.tif ?? "Gtc" } },
      },
    ],
    grouping: "na",
  };
}

/** Build two reduce-only, position-associated market trigger orders for TP and SL. */
export function buildPositionTpslAction(params: {
  assetIndex: number;
  closingIsBuy: boolean;
  size: number;
  takeProfit: number;
  stopLoss: number;
}) {
  return {
    type: "order",
    orders: [
      {
        a: params.assetIndex,
        b: params.closingIsBuy,
        p: floatToWire(params.takeProfit),
        s: floatToWire(params.size),
        r: true,
        // Key insertion order is protocol-critical: it must match the official
        // SDK before MessagePack hashing (isMarket, triggerPx, tpsl).
        t: { trigger: { isMarket: true, triggerPx: floatToWire(params.takeProfit), tpsl: "tp" as const } },
      },
      {
        a: params.assetIndex,
        b: params.closingIsBuy,
        p: floatToWire(params.stopLoss),
        s: floatToWire(params.size),
        r: true,
        t: { trigger: { isMarket: true, triggerPx: floatToWire(params.stopLoss), tpsl: "sl" as const } },
      },
    ],
    grouping: "positionTpsl" as const,
  };
}

/**
 * Replace one existing reduce-only stop trigger. The caller must look up and
 * verify the current trigger OID first; this helper deliberately cannot create
 * an unassociated opening order.
 */
export function buildModifyReduceOnlyStopAction(params: {
  oid: number;
  assetIndex: number;
  closingIsBuy: boolean;
  size: number;
  stopLoss: number;
}) {
  return {
    type: "modify",
    oid: params.oid,
    order: {
      a: params.assetIndex,
      b: params.closingIsBuy,
      p: floatToWire(params.stopLoss),
      s: floatToWire(params.size),
      r: true,
      t: { trigger: { isMarket: true, triggerPx: floatToWire(params.stopLoss), tpsl: "sl" as const } },
    },
  };
}

/**
 * Build the action object for updating leverage on a perp position.
 */
export function buildLeverageAction(
  assetIndex: number,
  leverage: number,
  isCross = true
) {
  return {
    type: "updateLeverage",
    asset: assetIndex,
    isCross,
    leverage,
  };
}
