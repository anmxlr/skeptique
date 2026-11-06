import Fastify, { type FastifyServerOptions } from "fastify";
import type { PublicClient } from "viem";
import { registerBuyerRunRoutes } from "./buyer-runs";
import { type ListingSource, registerSuiteRoute } from "./listings";
import { type MarketplaceSource, registerMarketplaceRoutes } from "./marketplace";
import { type IsCritic, PopularityCounter, registerPopularityRoutes, withPopularity } from "./popularity";

export interface AppDeps {
  /** Client for the chain the mechanism contracts live on. */
  publicClient: Pick<PublicClient, "getChainId">;
  /** Deployed contract addresses by name. */
  contracts: Record<string, `0x${string}`>;
  /** Listed services and the critic lookup used to keep critic calls out of popularity. */
  marketplace?: { source: MarketplaceSource; isCritic: IsCritic };
  /** ServiceRegistry listings indexed from the chain; serves the service list when no marketplace is given. */
  listings?: ListingSource;
}

export { createRegistrySource, type ListingSource } from "./listings";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/health", async (_req, reply) => {
    try {
      return { ok: true, chainId: await deps.publicClient.getChainId() };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  if (deps.marketplace) {
    const counter = new PopularityCounter(deps.marketplace.isCritic);
    registerPopularityRoutes(app, counter);
    registerMarketplaceRoutes(app, withPopularity(deps.marketplace.source, counter));
  } else if (deps.listings) {
    registerMarketplaceRoutes(app, deps.listings);
  }
  if (deps.listings) registerSuiteRoute(app, deps.listings);
  registerBuyerRunRoutes(app);

  return app;
}
