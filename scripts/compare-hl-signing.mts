import { buildPositionTpslAction, getL1ActionHash, signL1Action } from "../server/hyperliquidSigning";

const privateKey = "0x" + "1".repeat(64);
const nonce = 1_700_000_000_000;
const action = buildPositionTpslAction({
  assetIndex: 12,
  closingIsBuy: false,
  size: 13876,
  takeProfit: 0.030765,
  stopLoss: 0.030103,
});

const signature = await signL1Action(privateKey, action, null, nonce);
console.log(JSON.stringify({ action, actionHash: getL1ActionHash(action, null, nonce), signature }, null, 2));
