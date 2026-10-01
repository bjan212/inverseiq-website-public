# CEX TP/SL API Research

## Bybit V5

Official documentation: <https://bybit-exchange.github.io/docs/v5/position/trading-stop>

For a full-position perpetual TP/SL, use `POST /v5/position/trading-stop` with `category: "linear"`, uppercase `symbol`, `tpslMode: "Full"`, `positionIdx` matching the account mode, `takeProfit`, `stopLoss`, and market trigger types. Bybit creates system-managed conditional orders, cancels them when the position closes, and adjusts their quantity with the position.

Important constraint: the standard create-order endpoint documents that `reduceOnly: true` cannot be combined with `takeProfit` or `stopLoss`. Position-level protection must therefore use the trading-stop endpoint rather than adding TP/SL fields to a reduce-only entry/close order.

Official documentation: <https://bybit-exchange.github.io/docs/v5/order/create-order>

The create-order acknowledgement is asynchronous; order state should be verified through the order-status stream or query path before reporting exchange-side protection as active.

## OKX V5

Official documentation: <https://www.okx.com/docs-v5/en/#order-book-trading-algo-trading-post-place-algo-order>

OKX documents TP/SL as algo orders, with a stated limit of 100 pending TP/SL algo orders per instrument. Request authentication requires correctly signed UTC timestamps, and the response distinguishes top-level request errors (`code`/`msg`) from per-order outcomes (`sCode`/`sMsg`). The production implementation must use an algo-order endpoint and verify the individual result rather than accepting only a top-level HTTP success.

## Binance Futures

Official overview: <https://www.binance.com/en/academy/articles/how-to-place-a-take-profit-order-with-the-binance-api>

Binance Futures protection is modeled as separate conditional exit orders after the entry is filled. The production implementation should use close-position/reduce-only semantics, trigger price validation relative to direction, and order-status verification before it is reported as protected.
