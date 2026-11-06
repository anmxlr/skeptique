import { suiteHash, type TestSuite } from "@skeptique/shared";
import { describe, expect, it, vi } from "vitest";
import { runServiceReview } from "./review";

const suite: TestSuite = {
  version: 1,
  serviceName: "test-service",
  category: "conversion",
  determinism: "none",
  cases: [{ id: "public", input: { value: 1 }, expect: { kind: "exact", value: 100 }, weight: 1 }],
};
const critic = "0x0000000000000000000000000000000000000001";

describe("probes full review", () => {
  it("publishes only the combined evidence and retains probe payment references", async () => {
    const { createHash } = await import("node:crypto");
    const { default: canonicalize } = await import("canonicalize");
    const published: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json(suite);
      const evidence = JSON.parse(String(init.body));
      published.push(evidence);
      return Response.json({ hash: `0x${createHash("sha256").update(canonicalize(evidence)!).digest("hex")}` });
    });
    const review = await runServiceReview({
      suiteUrl: "http://service.test/suite.json",
      specHash: suiteHash(suite),
      roundId: 1,
      critic,
      endpoint: "http://service.test/call",
      maxPrice: "1",
      signer: null,
      serviceDescription: "Convert a value",
      seed: 1,
      modelName: "fixture/oracle",
      evidenceUrl: "http://api.test/evidence",
      fetchImpl,
      payAndCall: async ({ body }) => ({
        response: (body as { value: number }).value === 1 ? 100 : 999,
        txId: (body as { value: number }).value === 1 ? "public-tx" : "probe-tx",
        paid: true,
      }),
      probeModel: {
        generateProbes: async () => [
          { id: "held-out", input: { value: 2 }, expect: { kind: "exact", value: 200 }, weight: 1 },
        ],
        judge: async () => {
          throw new Error("No judge case in this fixture");
        },
      },
    });
    expect(review.suitePass).toBe(100);
    expect(review.probePass).toBe(0);
    expect(review.evidence.score).toBe(40);
    expect(review.evidence.x402Txs).toEqual(["public-tx", "probe-tx"]);
    expect(published).toEqual([review.evidence]);
  });

  it("does not publish a misleading public-only score if private generation fails", async () => {
    const fetchImpl = vi.fn(async () => Response.json(suite));
    await expect(
      runServiceReview({
        suiteUrl: "http://service.test/suite.json",
        specHash: suiteHash(suite),
        roundId: 1,
        critic,
        endpoint: "http://service.test/call",
        maxPrice: "1",
        signer: null,
        serviceDescription: "Convert a value",
        seed: 1,
        modelName: "fixture/oracle",
        evidenceUrl: "http://api.test/evidence",
        fetchImpl,
        payAndCall: async () => ({ response: 100, txId: null, paid: false }),
        probeModel: {
          generateProbes: async () => {
            throw new Error("Provider unavailable");
          },
          judge: async () => true,
        },
      }),
    ).rejects.toThrow("Provider unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
