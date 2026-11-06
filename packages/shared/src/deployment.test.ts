import { describe, expect, it } from "vitest";
import { DeploymentSchema, contractValue, tinybarsFromHbar } from "./deployment";

describe("deployment units and public manifest", () => {
  it("keeps ABI amounts in tinybars and converts only Hedera JSON-RPC value to weibars", () => {
    expect(tinybarsFromHbar("4.9")).toBe(490000000n);
    expect(tinybarsFromHbar("5")).toBe(500000000n);
    expect(contractValue(490000000n, 296)).toBe(4900000000000000000n);
    expect(contractValue(500000000n, 31337)).toBe(500000000n);
    expect(() => tinybarsFromHbar("0.000000001")).toThrow();
    expect(() => contractValue(1n, 1)).toThrow();
  });

  it("rejects incomplete, zero-address and wrong-chain deployment output", () => {
    expect(DeploymentSchema.safeParse({ chainId: 1, contracts: {} }).success).toBe(false);
    expect(DeploymentSchema.safeParse({ chainId: 296, contracts: { RoundManager: `0x${"00".repeat(20)}` } }).success).toBe(false);
  });
});
