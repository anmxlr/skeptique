import { criticRegisteredEvent, criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import type { FastifyInstance } from "fastify";
import type { PublicClient } from "viem";

/** A registered critic as the Critics page shows it. Stake is the current stake in tinybars. */
export interface CriticView {
  address: string;
  nullifier: string;
  stake: string;
  verdict?: "honest" | "slashed" | "outlier" | "unreviewed";
  lastRoundId?: number;
  slashedAmount?: string;
}

export interface CriticSource {
  list(): Promise<CriticView[]>;
  /** undefined when the address never registered. */
  get(address: string): Promise<CriticView | undefined>;
}

/** Indexes CriticRegistry registrations from the chain and reads each critic's current stake. */
export function createCriticSource(options: {
  client: Pick<PublicClient, "getContractEvents" | "readContract">;
  address: `0x${string}`;
  fromBlock?: bigint;
  roundManager?: `0x${string}`;
}): CriticSource {
  const list = async (): Promise<CriticView[]> => {
    const logs = await options.client.getContractEvents({
      address: options.address,
      abi: criticRegistryAbi,
      eventName: "CriticRegistered",
      fromBlock: options.fromBlock ?? 0n,
      strict: true,
    });
    const [reveals, finalized] = options.roundManager
      ? await Promise.all([
          options.client.getContractEvents({
            address: options.roundManager,
            abi: roundManagerAbi,
            eventName: "CriticRevealed",
            fromBlock: options.fromBlock ?? 0n,
            strict: true,
          }),
          options.client.getContractEvents({
            address: options.roundManager,
            abi: roundManagerAbi,
            eventName: "RoundFinalized",
            fromBlock: options.fromBlock ?? 0n,
            strict: true,
          }),
        ])
      : [[], []];
    const validRounds = new Set(finalized.filter((log) => log.args.isVoid === false).map((log) => log.args.roundId));
    // Index once instead of filtering and sorting the complete reveal history for every critic.
    const latestRoundByCritic = new Map<string, bigint>();
    for (const { args } of reveals) {
      if (!validRounds.has(args.roundId)) continue;
      const key = args.critic.toLowerCase();
      const previous = latestRoundByCritic.get(key);
      if (previous === undefined || args.roundId > previous) latestRoundByCritic.set(key, args.roundId);
    }
    return Promise.all(
      logs.map(async (log) => {
        const event = criticRegisteredEvent(log.args);
        const stake = await options.client.readContract({
          address: options.address,
          abi: criticRegistryAbi,
          functionName: "stakeOf",
          args: [event.critic as `0x${string}`],
        });
        const critic: CriticView = { address: event.critic, nullifier: event.nullifier, stake: stake.toString() };
        if (!options.roundManager) return critic;
        const roundId = latestRoundByCritic.get(event.critic.toLowerCase());
        if (roundId === undefined) return { ...critic, verdict: "unreviewed" };
        const [honest, slashed] = await Promise.all([
          options.client.readContract({
            address: options.roundManager,
            abi: roundManagerAbi,
            functionName: "isHonest",
            args: [roundId, event.critic as `0x${string}`],
          }),
          options.client.readContract({
            address: options.roundManager,
            abi: roundManagerAbi,
            functionName: "slashedAmount",
            args: [roundId, event.critic as `0x${string}`],
          }),
        ]);
        return {
          ...critic,
          lastRoundId: Number(roundId),
          slashedAmount: slashed.toString(),
          verdict: honest ? "honest" : slashed > 0n ? "slashed" : "outlier",
        };
      }),
    );
  };
  return {
    list,
    async get(address) {
      const wanted = address.toLowerCase();
      return (await list()).find((critic) => critic.address.toLowerCase() === wanted);
    },
  };
}

export function registerCriticRoutes(app: FastifyInstance, source: CriticSource): void {
  app.get("/critics", async () => source.list());
  app.get<{ Params: { address: string } }>("/critics/:address", async (request, reply) => {
    const critic = await source.get(request.params.address);
    if (!critic) return reply.code(404).send({ error: "Unknown critic" });
    return critic;
  });
}
