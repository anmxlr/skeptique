import { type RoundView, RoundViewSchema } from "@skeptique/shared";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import type { FastifyInstance } from "fastify";
import type { PublicClient } from "viem";
import { getServiceRoundTimeline, toRoundView } from "./round-view";

export interface RoundViewSource {
  all?(): Promise<RoundView[]>;
  get(roundId: number): Promise<RoundView | undefined> | RoundView | undefined;
}

export function createRoundSource(options: {
  client: Pick<PublicClient, "getBlock" | "readContract" | "getContractEvents">;
  address: `0x${string}`;
}): RoundViewSource {
  return {
    async get(roundId) {
      const block = await options.client.getBlock();
      const round = await options.client.readContract({
        address: options.address,
        abi: roundManagerAbi,
        functionName: "getRound",
        args: [BigInt(roundId)],
        blockNumber: block.number,
      });
      if (round.serviceId === 0n) return undefined;
      const [logs, finalizations] = await Promise.all([
        options.client.getContractEvents({
          address: options.address,
          abi: roundManagerAbi,
          eventName: "CriticRevealed",
          args: { roundId: BigInt(roundId) },
          fromBlock: 0n,
          toBlock: block.number,
          strict: true,
        }),
        options.client.getContractEvents({
          address: options.address,
          abi: roundManagerAbi,
          eventName: "RoundFinalized",
          args: { roundId: BigInt(roundId) },
          fromBlock: 0n,
          toBlock: block.number,
          strict: true,
        }),
      ]);
      const isVoid = finalizations.some((log) => log.args.isVoid === true);
      const reveals = await Promise.all(
        logs.map(async (log) => ({
          critic: log.args.critic,
          score: log.args.score,
          honest:
            round.finalized && !isVoid
              ? await options.client.readContract({
                  address: options.address,
                  abi: roundManagerAbi,
                  functionName: "isHonest",
                  args: [BigInt(roundId), log.args.critic],
                  blockNumber: block.number,
                })
              : null,
        })),
      );
      return toRoundView(
        {
          id: roundId,
          serviceId: Number(round.serviceId),
          commitEnd: Number(round.commitEnd),
          revealEnd: Number(round.revealEnd),
          finalized: round.finalized,
          median: round.finalized && !isVoid ? round.median : null,
          committed: [],
          reveals,
          void: isVoid,
        },
        Number(block.timestamp),
      );
    },
  };
}

export function registerRoundRoutes(app: FastifyInstance, source: RoundViewSource): void {
  if (source.all) {
    const all = source.all.bind(source);
    app.get<{ Params: { id: string } }>("/services/:id/rounds", async (request, reply) => {
      if (!/^\d+$/.test(request.params.id)) return reply.code(400).send({ error: "Invalid service ID" });
      return getServiceRoundTimeline(await all(), Number(request.params.id));
    });
  }
  app.get<{ Params: { id: string } }>("/rounds/:id", async (request, reply) => {
    if (!/^\d+$/.test(request.params.id)) return reply.code(400).send({ error: "Invalid round ID" });
    const roundId = Number(request.params.id);
    if (!Number.isSafeInteger(roundId) || roundId < 1) return reply.code(400).send({ error: "Invalid round ID" });
    const round = await source.get(roundId);
    if (!round) return reply.code(404).send({ error: "Round not found" });
    const parsed = RoundViewSchema.safeParse(round);
    if (!parsed.success) return reply.code(500).send({ error: "Invalid indexed round" });
    return parsed.data;
  });
}
