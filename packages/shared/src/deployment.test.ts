import { describe, expect, it } from "vitest";
import { contractValue, DeploymentSchema, tinybarsFromHbar } from "./deployment";

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
    expect(
      DeploymentSchema.safeParse({ chainId: 296, contracts: { RoundManager: `0x${"00".repeat(20)}` } }).success,
    ).toBe(false);
  });

  it("validates a complete public manifest and rejects impossible settlement settings", () => {
    const manifest = {
      version: 1,
      network: "hedera-testnet",
      chainId: 296,
      deployedAt: "2026-11-06T00:00:00.000Z",
      deploymentBlock: "42",
      contracts: {
        ServiceRegistry: `0x${"11".repeat(20)}`,
        CriticRegistry: `0x${"22".repeat(20)}`,
        RoundManager: `0x${"33".repeat(20)}`,
      },
      transactions: [{ name: "RoundManager", hash: `0x${"ab".repeat(32)}` }],
      config: {
        minStakeTinybars: "500000000",
        minListingFeeTinybars: "2000000000",
        withdrawCooldown: 300,
        commitSeconds: 90,
        revealSeconds: 45,
        kMin: 3,
        kMax: 7,
        tolerance: 10,
        slashBps: 2000,
      },
    };
    expect(DeploymentSchema.safeParse(manifest).success).toBe(true);
    for (const config of [
      { ...manifest.config, minStakeTinybars: "0" },
      { ...manifest.config, minListingFeeTinybars: "0" },
      { ...manifest.config, kMin: 8 },
      { ...manifest.config, kMax: 256 },
    ]) {
      expect(DeploymentSchema.safeParse({ ...manifest, config }).success).toBe(false);
    }
    expect(DeploymentSchema.safeParse({ ...manifest, chainId: 1 }).success).toBe(false);
  });
});
