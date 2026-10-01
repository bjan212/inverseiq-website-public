import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import {
  exchangeHistorySyncState,
  exchangeTradeFills,
  userPatterns,
  userSymbolPatterns,
} from "../drizzle/schema";

function uniqueColumnSets(table: Parameters<typeof getTableConfig>[0]): string[][] {
  const config = getTableConfig(table);
  const constraints = config.uniqueConstraints.map((constraint) =>
    constraint.columns.map((column) => column.name),
  );
  const indexes = config.indexes
    .filter((index) => index.config.unique)
    .map((index) => index.config.columns.map((column) => "name" in column ? column.name : "sql"));
  return [...constraints, ...indexes];
}

describe("private history schema isolation", () => {
  it("deduplicates fills within a user, exchange, account, and external fill id", () => {
    expect(uniqueColumnSets(exchangeTradeFills)).toContainEqual([
      "userId",
      "exchange",
      "sourceAccountHash",
      "externalFillId",
    ]);
  });

  it("isolates import state by user, exchange, and source account", () => {
    expect(uniqueColumnSets(exchangeHistorySyncState)).toContainEqual([
      "userId",
      "exchange",
      "sourceAccountHash",
    ]);
  });

  it("stores provenance on both global and symbol-level private patterns", () => {
    const globalSource = getTableConfig(userPatterns).columns.find((column) => column.name === "source");
    const symbolSource = getTableConfig(userSymbolPatterns).columns.find((column) => column.name === "source");
    expect(globalSource?.notNull).toBe(true);
    expect(symbolSource?.notNull).toBe(true);
  });
});
