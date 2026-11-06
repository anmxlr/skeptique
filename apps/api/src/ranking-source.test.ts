import { describe, expect, it, vi } from "vitest";
import type { ListingSource } from "./listings";
import { createFinalizedRankingSource } from "./ranking-source";

const address = "0x0000000000000000000000000000000000000011" as const;
const hash = `0x${"ab".repeat(32)}` as const;
const service = {
  id: 1,
  name: "converter",
  category: "conversion",
  endpoint: "http://localhost:4000/call",
  pricePerCall: "1",
  seller: address,
  ensName: "",
  median: null,
  nReveals: 0,
  nRounds: 0,
  lastRoundAt: null,
  popularityCalls: 0,
  specHash: hash,
  bounty: "2000000000",
};

function setup(logs: unknown[], fromBlock?: bigint) {
  const listing: ListingSource = {
    list: async () => [{ ...service }, { ...service, id: 2 }],
    suite: async () => undefined,
  };
  const getBlockNumber = vi.fn(async () => 100n);
  const getLogs = vi.fn(async (_args: unknown) => logs);
  const getBlock = vi.fn(async () => ({ timestamp: 1_800_000_000n }));
  const client = { getBlockNumber, getLogs, getBlock } as unknown as Parameters<
    typeof createFinalizedRankingSource
  >[0]["client"];
  return {
    source: createFinalizedRankingSource({ listing, client, address, fromBlock }),
    getBlockNumber,
    getLogs,
    getBlock,
  };
}

const finalized = (roundId: bigint, blockNumber: bigint, isVoid = false) => ({
  args: { roundId, serviceId: 1n, median: 80, nReveals: 3, isVoid },
  blockNumber,
  blockHash: hash,
  logIndex: Number(roundId),
});

describe("finalized ranking source", () => {
  it("starts live queries at the configured deployment block", async () => {
    const { source, getLogs } = setup([], 42n);
    await source.list();
    expect(getLogs.mock.calls[0]?.[0]).toMatchObject({ fromBlock: 42n, toBlock: 100n });
  });
  it("uses canonical latest round time and preserves probation until finalization", async () => {
    const { source, getLogs, getBlockNumber, getBlock } = setup([
      finalized(2n, 20n),
      finalized(1n, 10n),
      finalized(3n, 30n, true),
    ]);
    const [ranked, probation] = await source.list();
    expect(ranked).toMatchObject({ median: 80, nReveals: 3, nRounds: 2, lastRoundAt: "2027-01-15T08:00:00.000Z" });
    expect(probation).toMatchObject({ median: null, nRounds: 0, nReveals: 0, lastRoundAt: null });
    expect(service.median).toBeNull();
    expect(getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    expect(getLogs).toHaveBeenCalledOnce();
    expect(getLogs.mock.calls[0]?.[0]).toMatchObject({ address, fromBlock: 0n, toBlock: 100n, strict: true });
    expect(getBlock).toHaveBeenCalledOnce();
    expect(getBlock).toHaveBeenCalledWith({ blockHash: hash });
  });

  it("shares a block lookup across services and keeps the original suite lookup", async () => {
    const { source, getBlock } = setup([
      finalized(1n, 10n),
      { ...finalized(2n, 10n), args: { ...finalized(2n, 10n).args, serviceId: 2n } },
    ]);
    expect((await source.list()).map((row) => row.nRounds)).toEqual([1, 1]);
    expect(getBlock).toHaveBeenCalledOnce();
    expect(await source.suite(1)).toBeUndefined();
  });

  it("rechecks the chain after restart instead of trusting a stale snapshot", async () => {
    const { source, getLogs, getBlock } = setup([]);
    expect((await source.list())[0]?.median).toBeNull();
    getLogs.mockResolvedValue([finalized(1n, 10n)]);
    expect((await source.list())[0]?.median).toBe(80);
    expect(getLogs).toHaveBeenCalledTimes(2);
    expect(getBlock).toHaveBeenCalledOnce();
  });
});
