import { type RankingInput, rankMarketplaceServices } from "@skeptique/shared";
import type { FastifyInstance } from "fastify";

export interface MarketplaceSource {
  list(): Promise<RankingInput[]> | RankingInput[];
}

export function registerMarketplaceRoutes(
  app: FastifyInstance,
  source: MarketplaceSource,
  now: () => number = Date.now,
): void {
  const services = async () =>
    rankMarketplaceServices(await source.list(), now()).map(({ probation: _probation, ...service }) => service);

  app.get("/services", services);

  app.get<{ Params: { id: string } }>("/services/:id", async (request, reply) => {
    const service = (await services()).find((candidate) => candidate.id === Number(request.params.id));
    return service ?? reply.code(404).send({ error: "Unknown service" });
  });
}
