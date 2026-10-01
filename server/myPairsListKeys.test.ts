import { describe, expect, it } from "vitest";
import { keepFirstRecordPerSymbol, withUniqueSymbolRenderKeys } from "../client/src/lib/uniqueListKeys";

describe("My Pairs symbol render keys", () => {
  it("assigns unique, deterministic keys when multiple records share a symbol", () => {
    const rows = withUniqueSymbolRenderKeys(
      [
        { symbol: "MON", source: "exchange-a" },
        { symbol: "MON", source: "exchange-b" },
        { symbol: "PUMP", source: "exchange-a" },
        { symbol: "MON", source: "exchange-c" },
      ],
      "pair",
    );

    expect(rows.map((row) => row.renderKey)).toEqual([
      "pair:MON:1",
      "pair:MON:2",
      "pair:PUMP:1",
      "pair:MON:3",
    ]);
    expect(new Set(rows.map((row) => row.renderKey)).size).toBe(rows.length);
  });

  it("keeps keys unique for blank symbols without changing the displayed source data", () => {
    const rows = withUniqueSymbolRenderKeys([{ symbol: " " }, { symbol: "" }], "accuracy");

    expect(rows.map((row) => row.symbol)).toEqual([" ", ""]);
    expect(rows.map((row) => row.renderKey)).toEqual(["accuracy:UNKNOWN:1", "accuracy:UNKNOWN:2"]);
  });

  it("keeps the first complete pattern for each duplicated display symbol", () => {
    const patterns = keepFirstRecordPerSymbol([
      { symbol: "MON", tradeCount: 54, totalPnl: -31.79 },
      { symbol: " mon ", tradeCount: 54, totalPnl: -31.79 },
      { symbol: "PUMP", tradeCount: 8, totalPnl: -179.54 },
      { symbol: "PUMP", tradeCount: 8, totalPnl: -179.54 },
    ]);

    expect(patterns).toEqual([
      { symbol: "MON", tradeCount: 54, totalPnl: -31.79 },
      { symbol: "PUMP", tradeCount: 8, totalPnl: -179.54 },
    ]);
  });
});
