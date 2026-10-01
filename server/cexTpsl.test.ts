import { describe, expect, it } from "vitest";
import {
  buildBinanceProtectionOrders,
  buildBybitPositionProtection,
  buildOkxPositionProtection,
  validateCexProtection,
} from "./lib/cexTpsl";

describe("CEX TP/SL protection builders", () => {
  it("requires coherent paired levels for a long position", () => {
    expect(validateCexProtection({ symbol: "BTCUSDT", entrySide: "BUY", entryPrice: 100, takeProfit: 110, stopLoss: 95 })).toEqual({ ok: true });
    expect(validateCexProtection({ symbol: "BTCUSDT", entrySide: "BUY", entryPrice: 100, takeProfit: 90, stopLoss: 95 })).toEqual({ ok: false, error: "Long protection requires take-profit above entry and stop-loss below entry" });
  });

  it("rejects one-sided protection so an entry cannot be presented as fully protected", () => {
    expect(validateCexProtection({ symbol: "BTCUSDT", entrySide: "BUY", takeProfit: 110 })).toEqual({ ok: false, error: "Both take-profit and stop-loss are required for exchange-side protection" });
  });

  it("requires a short target below entry and a stop above entry", () => {
    expect(validateCexProtection({ symbol: "BTCUSDT", entrySide: "SELL", entryPrice: 100, takeProfit: 90, stopLoss: 105 })).toEqual({ ok: true });
    expect(validateCexProtection({ symbol: "BTCUSDT", entrySide: "SELL", entryPrice: 100, takeProfit: 110, stopLoss: 95 })).toEqual({ ok: false, error: "Short protection requires take-profit below entry and stop-loss above entry" });
  });

  it("builds Binance close-all market triggers using the opposite side", () => {
    const [tp, sl] = buildBinanceProtectionOrders({ symbol: "BTCUSDT", entrySide: "BUY", takeProfit: 110, stopLoss: 95 });
    expect(tp).toMatchObject({ side: "SELL", type: "TAKE_PROFIT_MARKET", closePosition: "true", workingType: "MARK_PRICE" });
    expect(sl).toMatchObject({ side: "SELL", type: "STOP_MARKET", closePosition: "true", workingType: "MARK_PRICE" });
  });

  it("builds Bybit full-position market protection", () => {
    expect(buildBybitPositionProtection({ symbol: "ETHUSDT", takeProfit: 2200, stopLoss: 1900 })).toMatchObject({ tpslMode: "Full", positionIdx: 0, tpOrderType: "Market", slOrderType: "Market" });
  });

  it("builds an OKX position-associated reduce-only OCO market exit", () => {
    expect(buildOkxPositionProtection({ symbol: "BTC-USDT-SWAP", entrySide: "SELL", takeProfit: 90000, stopLoss: 102000 })).toMatchObject({ side: "buy", ordType: "oco", closeFraction: "1", reduceOnly: true, cxlOnClosePos: true, tpOrdPx: "-1", slOrdPx: "-1" });
  });
});
