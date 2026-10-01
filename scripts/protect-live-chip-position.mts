import axios from "axios";
import * as db from "../server/db";
import { buildPositionTpslAction, signL1Action } from "../server/hyperliquidSigning";

const USER_ID = "4R5KWdvajk4tFfxmfCBtXt";
const COIN = "CHIP";
const TAKE_PROFIT = 0.030765;
const STOP_LOSS = 0.030103;

async function info(type: string, user?: string) {
  const { data } = await axios.post(
    "https://api.hyperliquid.xyz/info",
    user ? { type, user } : { type },
    { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
  );
  return data;
}

async function main() {
  const user = await db.getUserByOpenId(USER_ID);
  if (!user) throw new Error("Configured auto-trader user not found");
  const key = await db.getHyperliquidKey(user.id);
  if (!key) throw new Error("No Hyperliquid signing key configured");

  const [state, meta, mids] = await Promise.all([
    info("clearinghouseState", key.walletAddress),
    info("meta"),
    info("allMids"),
  ]);
  const position = (state?.assetPositions ?? [])
    .map((item: any) => item.position)
    .find((item: any) => item.coin === COIN && Number(item.szi ?? 0) !== 0);
  if (!position) throw new Error(`No open ${COIN} position found`);
  const size = Math.abs(Number(position.szi));
  const closingIsBuy = Number(position.szi) < 0;
  const mark = Number(mids?.[COIN] ?? 0);
  if (!mark || (closingIsBuy ? !(TAKE_PROFIT < mark && STOP_LOSS > mark) : !(TAKE_PROFIT > mark && STOP_LOSS < mark))) {
    throw new Error(`Refusing unsafe trigger placement: mark ${mark}, TP ${TAKE_PROFIT}, SL ${STOP_LOSS}, position ${position.szi}`);
  }
  const assetIndex = (meta?.universe ?? []).findIndex((asset: any) => asset.name === COIN);
  if (assetIndex < 0) throw new Error(`${COIN} not found in Hyperliquid perpetual meta`);

  const existingOrders = await info("frontendOpenOrders", key.walletAddress);
  const existingTriggers = (existingOrders ?? []).filter((order: any) => order.coin === COIN && order.isTrigger && order.reduceOnly);
  const alreadyHasTp = existingTriggers.some((order: any) => Math.abs(Number(order.triggerPx) - TAKE_PROFIT) < 1e-8);
  const alreadyHasSl = existingTriggers.some((order: any) => Math.abs(Number(order.triggerPx) - STOP_LOSS) < 1e-8);
  if (alreadyHasTp && alreadyHasSl) {
    console.log(JSON.stringify({ submitted: false, verified: { hasTp: true, hasSl: true }, triggers: existingTriggers }, null, 2));
    return;
  }

  const action = buildPositionTpslAction({
    assetIndex,
    closingIsBuy,
    size,
    takeProfit: TAKE_PROFIT,
    stopLoss: STOP_LOSS,
  });
  const nonce = Date.now();
  const signature = await signL1Action(key.privateKey, action, null, nonce);
  const submission = await axios.post(
    "https://api.hyperliquid.xyz/exchange",
    { action, nonce, signature },
    { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
  );

  await new Promise(resolve => setTimeout(resolve, 1000));
  const orders = await info("frontendOpenOrders", key.walletAddress);
  const triggers = (orders ?? []).filter((order: any) => order.coin === COIN && order.isTrigger && order.reduceOnly);
  const hasTp = triggers.some((order: any) => Math.abs(Number(order.triggerPx) - TAKE_PROFIT) < 1e-8);
  const hasSl = triggers.some((order: any) => Math.abs(Number(order.triggerPx) - STOP_LOSS) < 1e-8);
  console.log(JSON.stringify({
    submitted: submission.data,
    verified: { hasTp, hasSl },
    triggers: triggers.map((order: any) => ({ triggerPx: order.triggerPx, triggerCondition: order.triggerCondition, side: order.side, size: order.origSz })),
  }, null, 2));
  if (!hasTp || !hasSl) process.exitCode = 2;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => process.exit(process.exitCode ?? 0), 20);
});
