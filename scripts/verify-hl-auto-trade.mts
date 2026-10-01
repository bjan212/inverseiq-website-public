import axios from "axios";
import * as db from "../server/db";
import { privateKeyToAddress } from "../server/hyperliquidSigning";

const USER_ID = "4R5KWdvajk4tFfxmfCBtXt";

async function info(type: string, user: string) {
  const { data } = await axios.post(
    "https://api.hyperliquid.xyz/info",
    { type, user },
    { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
  );
  return data;
}

async function main() {
  const user = await db.getUserByOpenId(USER_ID);
  if (!user) throw new Error("Configured auto-trader user not found");
  const key = await db.getHyperliquidKey(user.id);
  if (!key) throw new Error("No Hyperliquid key configured");
  const signerAddress = privateKeyToAddress(key.privateKey).toLowerCase();

  const [state, openOrders, frontendOpenOrders, userRole] = await Promise.all([
    info("clearinghouseState", key.walletAddress),
    info("openOrders", key.walletAddress),
    info("frontendOpenOrders", key.walletAddress),
    info("userRole", key.walletAddress),
  ]);
  const positions = (state?.assetPositions ?? [])
    .map((item: any) => item.position)
    .filter((position: any) => Number(position.szi ?? 0) !== 0)
    .map((position: any) => ({
      coin: position.coin,
      size: position.szi,
      entryPrice: position.entryPx,
      unrealizedPnl: position.unrealizedPnl,
      leverage: position.leverage?.value,
    }));
  const chipOrders = (openOrders ?? [])
    .filter((order: any) => order.coin === "CHIP")
    .map((order: any) => ({ coin: order.coin, side: order.side, limitPx: order.limitPx, orderType: order.orderType, reduceOnly: order.reduceOnly }));
  const chipTriggerOrders = (frontendOpenOrders ?? [])
    .filter((order: any) => order.coin === "CHIP")
    .map((order: any) => ({
      coin: order.coin,
      side: order.side,
      size: order.origSz,
      isTrigger: order.isTrigger,
      isPositionTpsl: order.isPositionTpsl,
      triggerPx: order.triggerPx,
      triggerCondition: order.triggerCondition,
      orderType: order.orderType,
      reduceOnly: order.reduceOnly,
    }));

  console.log(JSON.stringify({
    accountRole: userRole?.role,
    signerMatchesStoredWallet: signerAddress === key.walletAddress.toLowerCase(),
    positions,
    chipOrders,
    chipTriggerOrders,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
