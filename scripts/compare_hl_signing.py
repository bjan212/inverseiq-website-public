import json
from eth_account import Account
from eth_utils import to_hex
from hyperliquid.utils.signing import action_hash, sign_l1_action

PRIVATE_KEY = "0x" + "1" * 64
NONCE = 1_700_000_000_000
ACTION = {
    "type": "order",
    "orders": [
        {
            "a": 12,
            "b": False,
            "p": "0.030765",
            "s": "13876",
            "r": True,
            "t": {"trigger": {"isMarket": True, "triggerPx": "0.030765", "tpsl": "tp"}},
        },
        {
            "a": 12,
            "b": False,
            "p": "0.030103",
            "s": "13876",
            "r": True,
            "t": {"trigger": {"isMarket": True, "triggerPx": "0.030103", "tpsl": "sl"}},
        },
    ],
    "grouping": "positionTpsl",
}

wallet = Account.from_key(PRIVATE_KEY)
signature = sign_l1_action(wallet, ACTION, None, NONCE, None, True)
print(json.dumps({
    "action": ACTION,
    "actionHash": to_hex(action_hash(ACTION, None, NONCE, None)),
    "signature": signature,
}, indent=2))
