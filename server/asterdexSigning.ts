/**
 * AsterDEX V3 EIP-712 Signing Module
 * 
 * Implements the EIP-712 typed data signing for AsterDEX API Wallet authentication.
 * Domain: { name: "AsterSignTransaction", version: "1", chainId: 1666, verifyingContract: "0x0...0" }
 * Type: Message { msg: string } where msg = URL-encoded param string
 * 
 * Reference: https://github.com/asterdex/api-docs/blob/master/V3(Recommended)/EN/aster-finance-futures-api-v3.md
 * 
 * CRITICAL DETAILS FROM OFFICIAL DOCS:
 * - Nonce: int(time.time()) * 1_000_000 + _i  (seconds * 1M = microseconds)
 * - Param string: urllib.parse.urlencode(params_dict) — standard URL encoding, dict order preserved
 * - Signature: signed.signature.hex() — hex WITHOUT 0x prefix (Python .hex() has no prefix)
 * - Message: typed_data['message']['msg'] = param (the URL-encoded string)
 */

import { ethers } from "ethers";

// EIP-712 Domain for AsterDEX
const ASTER_EIP712_DOMAIN = {
  name: "AsterSignTransaction",
  version: "1",
  chainId: 1666,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};

// EIP-712 Types
const ASTER_EIP712_TYPES = {
  Message: [{ name: "msg", type: "string" }],
};

// Nonce counter for monotonic nonces within the same second
let _nonceCounter = 0;
let _lastNonceSec = 0;

/**
 * Generate a monotonic nonce in MICROSECONDS
 * Formula from official docs: int(time.time()) * 1_000_000 + _i
 * where time.time() is Unix seconds
 */
function getNonce(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec !== _lastNonceSec) {
    _lastNonceSec = nowSec;
    _nonceCounter = 0;
  }
  const nonce = nowSec * 1_000_000 + _nonceCounter;
  _nonceCounter++;
  return nonce.toString();
}

/**
 * Build URL-encoded param string matching Python's urllib.parse.urlencode behavior
 * This preserves insertion order (NOT sorted alphabetically)
 */
function urlEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Sign a request using EIP-712 for AsterDEX V3
 * 
 * Follows the official Python example exactly:
 * 1. Add nonce, user, signer to params dict
 * 2. URL-encode all params (preserving order)
 * 3. Set typed_data.message.msg = encoded param string
 * 4. Sign with eth_account
 * 5. Append signature (hex, no 0x prefix) 
 */
export async function signAsterV3Request(
  params: Record<string, string | number | boolean>,
  userAddress: string,
  signerAddress: string,
  privateKey: string
): Promise<{ signedParams: Record<string, string>; paramString: string; debug: any }> {
  // Build params dict in the same order as the Python example:
  // First the API params, then nonce, user, signer
  const paramsDict: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    paramsDict[k] = String(v);
  }
  
  // Add auth params (order: nonce, user, signer — matching Python dict insertion)
  const nonce = getNonce();
  paramsDict.nonce = nonce;
  paramsDict.user = userAddress;
  paramsDict.signer = signerAddress;

  // URL-encode the params (this is what gets signed as the "msg")
  const paramString = urlEncode(paramsDict);

  // Sign with EIP-712
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(pk);
  
  // Verify the wallet address matches the signer address
  const derivedAddress = wallet.address;
  
  const signature = await wallet.signTypedData(
    ASTER_EIP712_DOMAIN,
    ASTER_EIP712_TYPES,
    { msg: paramString }
  );

  // CRITICAL: Strip 0x prefix from signature
  // Python's .hex() returns without 0x, ethers returns with 0x
  const signatureHex = signature.startsWith("0x") ? signature.slice(2) : signature;

  const debug = {
    nonce,
    paramString,
    signatureLength: signatureHex.length,
    signaturePrefix: signatureHex.slice(0, 10),
    derivedAddress,
    expectedSigner: signerAddress,
    addressMatch: derivedAddress.toLowerCase() === signerAddress.toLowerCase(),
  };

  return { signedParams: { ...paramsDict, signature: signatureHex }, paramString, debug };
}

/**
 * Parse stored API key format "userAddress:signerAddress" 
 */
export function parseAsterWalletCredentials(apiKey: string, apiSecret: string): {
  userAddress: string;
  signerAddress: string;
  privateKey: string;
  isV3: boolean;
} {
  if (apiKey.includes(":")) {
    const [userAddress, signerAddress] = apiKey.split(":");
    return { userAddress, signerAddress, privateKey: apiSecret, isV3: true };
  }
  // Legacy V1 format
  return { userAddress: "", signerAddress: "", privateKey: "", isV3: false };
}

/**
 * Make a signed GET request to AsterDEX V3
 * Per official docs: GET params sent as query string, signature appended to URL
 */
export async function asterV3Get(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  userAddress: string,
  signerAddress: string,
  privateKey: string
): Promise<any> {
  const { default: axios } = await import("axios");
  const { signedParams, paramString, debug } = await signAsterV3Request(params, userAddress, signerAddress, privateKey);
  
  console.log(`[AsterDEX V3 GET] ${endpoint}`, JSON.stringify(debug));
  
  // Build query string from signed params (signature included)
  const queryString = Object.entries(signedParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  
  const url = `https://fapi.asterdex.com${endpoint}?${queryString}`;
  console.log(`[AsterDEX V3 GET] Full URL: ${url.slice(0, 300)}`);
  
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  } catch (err: any) {
    console.error(`[AsterDEX V3 GET] Error:`, {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });
    throw err;
  }
}

/**
 * Make a signed POST request to AsterDEX V3
 * Per official docs: POST can use either URL params or body (application/x-www-form-urlencoded)
 * Using URL method (send_by_url) as it's simpler and shown in the async example
 */
export async function asterV3Post(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  userAddress: string,
  signerAddress: string,
  privateKey: string
): Promise<any> {
  const { default: axios } = await import("axios");
  const { signedParams, debug } = await signAsterV3Request(params, userAddress, signerAddress, privateKey);
  
  console.log(`[AsterDEX V3 POST] ${endpoint}`, JSON.stringify(debug));
  
  // Use URL method (matching send_by_url from official docs)
  const queryString = Object.entries(signedParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  
  const url = `https://fapi.asterdex.com${endpoint}?${queryString}`;
  
  try {
    const response = await axios.post(url, null, { timeout: 10000 });
    return response.data;
  } catch (err: any) {
    console.error(`[AsterDEX V3 POST] Error:`, {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });
    throw err;
  }
}

/**
 * Make a signed DELETE request to AsterDEX V3
 * Per official docs: DELETE uses URL method
 */
export async function asterV3Delete(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  userAddress: string,
  signerAddress: string,
  privateKey: string
): Promise<any> {
  const { default: axios } = await import("axios");
  const { signedParams, debug } = await signAsterV3Request(params, userAddress, signerAddress, privateKey);
  
  console.log(`[AsterDEX V3 DELETE] ${endpoint}`, JSON.stringify(debug));
  
  const queryString = Object.entries(signedParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  
  const url = `https://fapi.asterdex.com${endpoint}?${queryString}`;
  
  try {
    const response = await axios.delete(url, { timeout: 10000 });
    return response.data;
  } catch (err: any) {
    console.error(`[AsterDEX V3 DELETE] Error:`, {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });
    throw err;
  }
}
