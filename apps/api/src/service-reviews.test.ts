import { createHash } from "node:crypto";
import type { Evidence } from "@skeptique/shared";
import canonicalize from "canonicalize";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";
import { MemoryEvidenceStore } from "./evidence";
import { createServiceReviewSource } from "./service-reviews";

const critic = "0x0000000000000000000000000000000000000001";
const evidence: Evidence = {
  roundId: 2,
  critic,
  score: 40,
  suite: [],
  probes: [],
  latencyMs: { p50: 0, p95: 0 },
  x402Txs: [],
  claimedCost: "0",
  model: "fixture",
};
const hash = `0x${createHash("sha256").update(canonicalize(evidence)!).digest("hex")}`;

function fixture(stored: Evidence = evidence) {
  const store = new MemoryEvidenceStore();
  store.put(hash, stored);
  const getContractEvents = vi
    .fn()
    .mockResolvedValueOnce([
      { args: { roundId: 1n, isVoid: false }, blockNumber: 1n, logIndex: 0 },
      { args: { roundId: 2n, isVoid: false }, blockNumber: 2n, logIndex: 0 },
      { args: { roundId: 3n, isVoid: true }, blockNumber: 3n, logIndex: 0 },
    ])
    .mockResolvedValueOnce([{ args: { critic, score: 40, evidenceHash: hash } }]);
  return {
    source: createServiceReviewSource({ client: { getContractEvents }, address: critic, store }),
    getContractEvents,
  };
}

describe("finalized service review evidence", () => {
  it("uses the latest non-void round and verifies the anchored hash", async () => {
    const { source, getContractEvents } = fixture();
    expect(await source.list(5)).toEqual([{ evidenceHash: hash, evidence }]);
    expect(getContractEvents.mock.calls[1][0]).toMatchObject({ args: { roundId: 2n } });
  });
  it.each([
    { ...evidence, roundId: 9 },
    { ...evidence, score: 100 },
    { ...evidence, critic: "0x0000000000000000000000000000000000000002" },
    { ...evidence, model: "tampered-content" },
  ])("omits unanchored or tampered evidence %#", async (stored) => {
    expect(await fixture(stored).source.list(5)).toEqual([]);
  });
  it("wires publication and retrieval and rejects invalid service IDs", async () => {
    const { source } = fixture();
    const app = buildApp({ publicClient: { getChainId: async () => 31337 }, contracts: {}, serviceReviews: source });
    try {
      const published = await app.inject({ method: "POST", url: "/evidence", payload: evidence });
      expect(published.statusCode).toBe(200);
      expect(published.json()).toEqual({ hash });
      expect((await app.inject(`/evidence/${hash}`)).json()).toEqual(evidence);
      expect((await app.inject("/services/not-an-id/reviews")).statusCode).toBe(400);
      expect((await app.inject("/services/0/reviews")).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
