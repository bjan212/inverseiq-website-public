# Hyperliquid TP/SL Incident Notes

## Authoritative references

- [Hyperliquid: TP/SL orders](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl): TP/SL uses the mark price. Position-associated TP/SL attempts to close the existing position; fixed-size orders should use the exact protected size.
- [Hyperliquid: Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint): `frontendOpenOrders` exposes `isTrigger`, `triggerPx`, `isPositionTpsl`, and `reduceOnly`, making it the verification source for trigger protection. `userRole` distinguishes `user`, `agent`, `vault`, `subAccount`, and `missing` roles. The actual account address—not an agent address—must be used to read account state.
- [Hyperliquid: Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint): trigger orders use `t.trigger = { isMarket, triggerPx, tpsl }`; supported order groupings include `na`, `normalTpsl`, and `positionTpsl`; order responses must be inspected for `resting`, `filled`, or `error` status.
- [Project Hyperliquid implementation reference](https://cryptoskills.dev/skills/hyperliquid): L1 trading actions use the Phantom Agent scheme on chain ID 1337. Signature errors can surface as `User or API Wallet ... does not exist`.
- [Official Hyperliquid Python SDK signing module](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/utils/signing.py): L1 action hashes are `keccak(msgpack(action) || nonce-as-8-byte-big-endian || vault-flag)` before EIP-712 signing the Phantom Agent `{ source: "a", connectionId: hash }` on the Exchange domain (chain ID 1337). The official implementation distinguishes these L1 actions from user-signed account actions.

## Incident observations

- The live CHIP position existed, but `openOrders` and `frontendOpenOrders` returned no active CHIP triggers.
- The legacy TP/SL code marked a submission as set whenever no nested `status.error` was returned, without confirming the trigger order remained on Hyperliquid.
- The revised implementation uses position-associated, reduce-only TP/SL action construction and checks `frontendOpenOrders` before treating a position as protected.
- The one-time remediation request returned `User or API Wallet ... does not exist`; this must be resolved by validating the stored signing identity and Hyperliquid Phantom Agent signing compatibility before further trigger submissions.
- Recovered-address changes across otherwise valid requests indicate the exchange did not reproduce this project's signed action hash. The remaining investigation must compare MessagePack bytes and action normalization with a maintained SDK before permitting another signed action.
