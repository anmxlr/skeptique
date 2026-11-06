import { http, namehash } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { relayScoresFromChain } from "./score-source";
import { createScoreRelayer } from "./scores";

const mocks = vi.hoisted(() => ({
  getChainId: vi.fn(),
  getBlockNumber: vi.fn(),
  getLogs: vi.fn(),
  readContract: vi.fn(),
}));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => mocks,
}));
const critic = "0x0000000000000000000000000000000000000001";
const roundManager = "0x0000000000000000000000000000000000000002" as const;
const serviceRegistry = "0x0000000000000000000000000000000000000003" as const;
const criticRegistry = "0x0000000000000000000000000000000000000004" as const;
const name = "demo.svc.skeptique.eth";
const transactionHash = `0x${"ab".repeat(32)}`;
const make = () => {
  const records = new Map<string, Record<string, string>>();
  const write = vi.fn(async (name: string, values: Record<string, string>) => {
    records.set(name, { ...records.get(name), ...values });
    return "0xab" as const;
  });
  const relayer = createScoreRelayer({
    parentName: "skeptique.eth",
    ensureCritic: async () => {},
    target: {
      read: async (name) => records.get(name) ?? {},
      write,
    },
  });
  return {
    write,
    options: {
      transport: http("https://rpc.invalid"),
      chainId: 296,
      fromBlock: 10n,
      confirmations: 1n,
      roundManager,
      serviceRegistry,
      criticRegistry,
      parentName: "skeptique.eth",
      serviceNames: { "1": name },
      criticNames: { [critic]: "alice.critic.skeptique.eth" },
      relayer,
      chunkSize: 2n,
    },
  };
};

describe("ENS scores source", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getChainId.mockResolvedValue(296);
    mocks.getBlockNumber.mockResolvedValue(15n);
    mocks.getLogs.mockImplementation(async ({ address, fromBlock }) => {
      if (address === criticRegistry)
        return fromBlock === 10n
          ? [
              { eventName: "CriticRegistered", args: { critic } },
              { eventName: "CriticSlashed", args: { critic } },
            ]
          : [];
      if (fromBlock === 10n) return [{ eventName: "CriticRevealed", args: { roundId: 1n, critic } }];
      if (fromBlock === 12n)
        return [
          {
            eventName: "RoundFinalized",
            args: { roundId: 1n, serviceId: 1n, median: 87, nReveals: 3, isVoid: false },
            transactionHash,
          },
        ];
      return [];
    });
    mocks.readContract.mockImplementation(async ({ functionName }) =>
      functionName === "getService" ? { ensNode: namehash(name) } : functionName === "stakeOf" ? 500n : true,
    );
  });
  it("catches up chunk boundaries, verifies the onchain name, derives critic totals and replays without writes", async () => {
    const { options, write } = make();
    expect(await relayScoresFromChain(options)).toEqual({ sourceBlock: "14", finalized: 1, critics: 1 });
    expect(write).toHaveBeenCalledWith(
      name,
      expect.objectContaining({ "eth.skeptique.score": "87", "eth.skeptique.hedera.tx": transactionHash }),
    );
    expect(write).toHaveBeenCalledWith("alice.critic.skeptique.eth", {
      "eth.skeptique.stake": "500",
      "eth.skeptique.honestRounds": "1",
      "eth.skeptique.slashes": "1",
    });
    await relayScoresFromChain(options);
    expect(write).toHaveBeenCalledTimes(2);
    expect(mocks.readContract.mock.calls.every(([query]) => query.blockNumber === 14n)).toBe(true);
  });
  it("refuses a mapping that does not match ServiceRegistry.ensNode", async () => {
    mocks.readContract.mockResolvedValue({ ensNode: namehash("other.svc.skeptique.eth") });
    const { options, write } = make();
    await expect(relayScoresFromChain(options)).rejects.toThrow("namehash mismatch");
    expect(write).not.toHaveBeenCalled();
  });
  it("does not relay void round scores and rejects the wrong source network", async () => {
    mocks.getLogs.mockResolvedValue([{ eventName: "RoundFinalized", args: { roundId: 1n, isVoid: true } }]);
    // No registration logs in this isolated void-round scenario.
    mocks.getLogs.mockImplementation(async ({ address }) =>
      address === criticRegistry ? [] : [{ eventName: "RoundFinalized", args: { roundId: 1n, isVoid: true } }],
    );
    const { options, write } = make();
    await relayScoresFromChain(options);
    expect(write).not.toHaveBeenCalled();
    mocks.getChainId.mockResolvedValue(1);
    await expect(relayScoresFromChain(options)).rejects.toThrow("Unexpected score source chain");
  });
});
