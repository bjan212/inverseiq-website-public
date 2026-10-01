import axios from "axios";
import * as db from "../server/db";
import { floatToWire, privateKeyToAddress, signL1Action } from "../server/hyperliquidSigning";

const USER_ID = "4R5KWdvajk4tFfxmfCBtXt";
const COIN = "CHIP";
const TAKE_PROFIT = 0.030765;
const STOP_LOSS = 0.030103;

async function postInfo(body: Record<string, unknown>) {
  const { data } = await axios.post("https://api.hyperliquid.xyz/info", body, { headers: { "Content-Type": "application/json" }, timeout: 15_000 });
  return data;
}

async function main() {
  const user = await db.getUserByOpenId(USER_ID);
  if (!user) throw new Error("Configured auto-trader user not found");
  const key = await db.getHyperliquidKey(user.id);
  if (!key) throw new Error("No Hyperliquid signing key configured");
  if (privateKeyToAddress(key.privateKey).toLowerCase() !== key.walletAddress.toLowerCase()) throw new Error("Stored signer and Hyperliquid account mismatch");

  const [state, meta, orders, mids] = await Promise.all([
    postInfo({ type: "clearinghouseState", user: key.walletAddress }),
    postInfo({ type: "meta" }),
    postInfo({ type: "frontendOpenOrders", user: key.walletAddress }),
    postInfo({ type: "allMids" }),
  ]);
  const position = (state?.assetPositions ?? []).map((item: any) => item.position).find((item: any) => item.coin === COIN && Number(item.szi) !== 0);
  if (!position) throw new Error("No open CHIP position found");
  const size = Math.abs(Number(position.szi));
  const closingIsBuy = Number(position.szi) < 0;
  const mark = Number(mids?.[COIN] ?? 0);
  if (!mark || (closingIsBuy ? !(TAKE_PROFIT < mark && STOP_LOSS > mark) : !(TAKE_PROFIT > mark && STOP_LOSS < mark))) throw new Error("Refusing unsafe trigger placement");
  const assetIndex = (meta?.universe ?? []).findIndex((asset: any) => asset.name === COIN);
  if (assetIndex < 0) throw new Error("CHIP is absent from Hyperliquid perp meta");

  const existing = (orders ?? []).filter((order: any) => order.coin === COIN && order.isTrigger && order.reduceOnly);
  const results: unknown[] = [];
  for (const [kind, triggerPrice] of [["tp", TAKE_PROFIT], ["sl", STOP_LOSS]] as const) {
    const exists = existing.some((order: any) => Math.abs(Number(order.triggerPx) - triggerPrice) < 1e-8);
    if (exists) { results.push({ kind, submitted: false, reason: "already verified" }); continue; }
    const action = {
      type: "order",
      orders: [{
        a: assetIndex,
        b: closingIsBuy,
        p: floatToWire(triggerPrice),
        s: floatToWire(size),
        r: true,
        t: { trigger: { triggerPx: floatToWire(triggerPrice), isMarket: true, tpsl: kind } },
      }],
      grouping: "na",
    };
    const nonce = Date.now();
    const signature = await signL1Action(key.privateKey, action, null, nonce);
    const response = await axios.post("https://api.hyperliquid.xyz/exchange", { action, nonce, signature }, { headers: { "Content-Type": "application/json" }, timeout: 15_000 });
    results.push({ kind, response: response.data });
    await new Promise(resolve => setTimeout(resolve, 650));
  }
  const verifiedOrders = await postInfo({ type: "frontendOpenOrders", user: key.walletAddress });
  const triggers = (verifiedOrders ?? []).filter((order: any) => order.coin === COIN && order.isTrigger && order.reduceOnly);
  console.log(JSON.stringify({
    results,
    verified: {
      hasTp: triggers.some((order: any) => Math.abs(Number(order.triggerPx) - TAKE_PROFIT) < 1e-8),
      hasSl: triggers.some((order: any) => Math.abs(Number(order.triggerPx) - STOP_LOSS) < 1e-8),
    },
    triggers: triggers.map((order: any) => ({ triggerPx: order.triggerPx, triggerCondition: order.triggerCondition, side: order.side, size: order.origSz })),
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 20));
