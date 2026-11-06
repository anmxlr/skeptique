import { expect, it } from "vitest";

// Deliberately fail when explicitly selected without funded credentials; skipped runs are not live acceptance.
it("round on hedera testnet", async () => {
  const { smokeHederaRound } = await import("../contracts/scripts/smoke-hedera-round");
  const result = await smokeHederaRound(process.env);
  expect(result.chainId).toBe(296);
  expect(result.median).toBe(72);
  expect(result.transactions.length).toBeGreaterThan(0);
}, 300_000);
