import { criticRegisteredEvent, criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import type { FastifyInstance } from "fastify";
import type { PublicClient } from "viem";

/** A registered critic as the Critics page shows it. Stake is the current stake in tinybars. */
export interface CriticView {
  address: string;
  nullifier: string;
  stake: string;
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
}): CriticSource {
  const list = async (): Promise<CriticView[]> => {
    const logs = await options.client.getContractEvents({
      address: options.address,
      abi: criticRegistryAbi,
      eventName: "CriticRegistered",
      fromBlock: 0n,
    });
    return Promise.all(
      logs.map(async (log) => {
        const event = criticRegisteredEvent(log.args);
        const stake = await options.client.readContract({
          address: options.address,
          abi: criticRegistryAbi,
          functionName: "stakeOf",
          args: [event.critic as `0x${string}`],
        });
        return { address: event.critic, nullifier: event.nullifier, stake: stake.toString() };
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
