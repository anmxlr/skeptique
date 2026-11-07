import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { criteria, runTestnetE2E, writeEvidence } from "../scripts/demo/testnet-e2e";

if (existsSync(".env")) process.loadEnvFile(".env");

// Runs the whole demo story once on real networks. Deliberately not skipped: a missing key is a failure here.
describe("testnet end to end", () => {
  it("testnet end to end", async () => {
    const ev = await runTestnetE2E(process.env);
    const path = writeEvidence(ev);
    console.log(`evidence written to ${path}`);
    expect(criteria(ev)).toEqual({
      x402Settled: true,
      finalizeTx: true,
      ensRead: true,
      hcsMessage: true,
      unattendedBuyer: true,
    });
  }, 3_300_000);
});
