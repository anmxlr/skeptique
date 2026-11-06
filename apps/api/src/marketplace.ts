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
  app.get("/services", async () => {
    const services = rankMarketplaceServices(await source.list(), now());
    return services.map(({ probation: _probation, ...service }) => service);
  });
}
