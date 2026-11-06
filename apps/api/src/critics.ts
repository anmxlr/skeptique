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
  roundManager?: `0x${string}`;
}): CriticSource {
  const list = async (): Promise<CriticView[]> => {
    const logs = await options.client.getContractEvents({
      address: options.address,
      abi: criticRegistryAbi,
      eventName: "CriticRegistered",
      fromBlock: 0n,
    });
    const [reveals, finalized] = options.roundManager
      ? await Promise.all([
          options.client.getContractEvents({
            address: options.roundManager,
            abi: roundManagerAbi,
            eventName: "CriticRevealed",
            fromBlock: 0n,
          }),
          options.client.getContractEvents({
            address: options.roundManager,
            abi: roundManagerAbi,
            eventName: "RoundFinalized",
            fromBlock: 0n,
          }),
        ])
      : [[], []];
    const validRounds = new Set(finalized.filter((log) => log.args.isVoid === false).map((log) => log.args.roundId));
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
        const latest = reveals
          .filter(
            (log) => log.args.critic?.toLowerCase() === event.critic.toLowerCase() && validRounds.has(log.args.roundId),
          )
          .sort((a, b) => (a.args.roundId! > b.args.roundId! ? -1 : 1))[0];
        if (!latest) return { ...critic, verdict: "unreviewed" };
        const roundId = latest.args.roundId!;
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
