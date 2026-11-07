import type { PublicClient } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { createCriticSource } from "./critics";

const REGISTRY = "0x00000000000000000000000000000000000000aa";
const CRITIC = "0x0000000000000000000000000000000000000033";
const nullifier = `0x${"ab".repeat(32)}`;

const client = {
  getContractEvents: async () => [{ args: { critic: CRITIC, nullifier, stake: 500_000_000n } }],
  readContract: async () => 400_000_000n,
} as unknown as Pick<PublicClient, "getContractEvents" | "readContract">;

describe("critics routes", () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });
  const app = () => {
    const built = buildApp({
      publicClient: { getChainId: async () => 1 },
      contracts: {},
      critics: createCriticSource({ client, address: REGISTRY }),
    });
    apps.push(built);
    return built;
  };

  it("lists registered critics with their current stake", async () => {
    const res = await app().inject("/critics");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ address: CRITIC, nullifier, stake: "400000000" }]);
  });

  it("serves one critic by address, ignoring case, and 404s an unknown one", async () => {
    const server = app();
    const found = await server.inject(`/critics/${CRITIC.toUpperCase().replace("0X", "0x")}`);
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual({ address: CRITIC, nullifier, stake: "400000000" });
    expect((await server.inject("/critics/0x0000000000000000000000000000000000000044")).statusCode).toBe(404);
  });

  it("adds honest rounds, slashes and pending rewards for the critic dashboard", async () => {
    const ROUND_MANAGER = "0x00000000000000000000000000000000000000bb";
    const events: Record<string, unknown[]> = {
      CriticRegistered: [{ args: { critic: CRITIC, nullifier, stake: 500_000_000n } }],
      CriticRevealed: [1n, 2n, 3n].map((roundId) => ({ args: { roundId, critic: CRITIC, score: 70 } })),
      RoundFinalized: [1n, 2n, 3n].map((roundId) => ({ args: { roundId, isVoid: false } })),
      RewardAccrued: [1n, 3n].map((roundId) => ({ args: { roundId, critic: CRITIC, amount: 7n } })),
      CriticSlashed: [{ args: { critic: CRITIC, roundId: 2n, amount: 100n, reason: "outlier" } }],
    };
    const reads: Record<string, unknown> = {
      stakeOf: 400_000_000n,
      isHonest: true,
      slashedAmount: 0n,
      pendingRewards: 123_456_789n,
    };
    const roundClient = {
      getContractEvents: async ({ eventName }: { eventName: string }) => events[eventName] ?? [],
      readContract: async ({ functionName }: { functionName: string }) => reads[functionName],
    } as unknown as Pick<PublicClient, "getContractEvents" | "readContract">;
    const critic = await createCriticSource({
      client: roundClient,
      address: REGISTRY,
      roundManager: ROUND_MANAGER,
    }).get(CRITIC);
    expect(critic).toMatchObject({ honestRounds: 2, slashes: 1, pendingRewards: "123456789", verdict: "honest" });
  });
});
