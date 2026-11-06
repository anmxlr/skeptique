import { describe, expect, it, vi } from "vitest";
import { ensRecordKeys, readEnsScore } from "./ens";

const name = "converter.svc.skeptique.eth";
const resolver = "0x0000000000000000000000000000000000000001" as const;
const records: Record<string, string> = {
  "eth.skeptique.score": "87",
  "eth.skeptique.confidence": "0.6",
  "eth.skeptique.round": "12",
  "eth.skeptique.hedera.tx": `0x${"ab".repeat(32)}`,
};

describe("ENS scores", () => {
  it("reads resolver values at one pinned block and exposes the exact queries", async () => {
    const getEnsText = vi.fn(async ({ key }: { key: string }) => records[key] ?? null);
    const snapshot = await readEnsScore(
      {
        getBlockNumber: async () => 42n,
        getEnsResolver: async () => resolver,
        getEnsText,
      },
      { name, parentName: "skeptique.eth" },
    );
    expect(snapshot).toMatchObject({ name, resolver, score: 87, confidence: 0.6, round: "12", blockNumber: "42" });
    expect(getEnsText).toHaveBeenCalledTimes(4);
    expect(getEnsText.mock.calls.every(([query]) => "blockNumber" in query && query.blockNumber === 42n)).toBe(true);
    expect(snapshot?.queries.map((query) => query.key)).toEqual(Object.keys(records));
  });

  it("uses the configured parent's reversed ENSIP-5 namespace", () => {
    expect(ensRecordKeys("team.project.eth").score).toBe("eth.project.team.score");
  });

  it("returns unavailable for incomplete records rather than inventing a score", async () => {
    const client = {
      getBlockNumber: async () => 42n,
      getEnsResolver: async () => resolver,
      getEnsText: async ({ key }: { key: string }) => (key.endsWith("round") ? null : (records[key] ?? null)),
    };
    expect(await readEnsScore(client, { name, parentName: "skeptique.eth" })).toBeNull();
  });

  it("rejects malformed values and names outside the service namespace", async () => {
    const client = {
      getBlockNumber: async () => 42n,
      getEnsResolver: async () => resolver,
      getEnsText: async ({ key }: { key: string }) => (key.endsWith("score") ? "NaN" : (records[key] ?? null)),
    };
    await expect(readEnsScore(client, { name, parentName: "skeptique.eth" })).rejects.toThrow("Invalid ENS score");
    await expect(readEnsScore(client, { name: "seller.evil.eth", parentName: "skeptique.eth" })).rejects.toThrow(
      "service namespace",
    );
  });
});
