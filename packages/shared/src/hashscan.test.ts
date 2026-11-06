import { describe, expect, it } from "vitest";
import { hashscanTxUrl } from "./hashscan";

describe("hashscanTxUrl", () => {
  it("builds the HashScan testnet link from a settled x402 tx id", () => {
    expect(hashscanTxUrl("0.0.9185802@1793949293.996636002")).toBe(
      "https://hashscan.io/testnet/transaction/0.0.9185802@1793949293.996636002",
    );
  });
  it("returns null for anything that is not a Hedera tx id", () => {
    for (const bad of ["", "0xabc", "0.0.1@x.y", "https://evil.test/", "0.0.9185802@1793949293.996636002/../x"])
      expect(hashscanTxUrl(bad)).toBeNull();
  });
});
