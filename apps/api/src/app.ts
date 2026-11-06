import type { RankingInput } from "@skeptique/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { PublicClient } from "viem";
import { registerBuyerRunRoutes } from "./buyer-runs";
import { type CriticSource, registerCriticRoutes } from "./critics";
import { type EvidenceStore, MemoryEvidenceStore, registerEvidenceRoutes } from "./evidence";
import { type ListingSource, registerSuiteRoute } from "./listings";
import { type MarketplaceSource, registerMarketplaceRoutes } from "./marketplace";
import { type IsCritic, PopularityCounter, registerPopularityRoutes, withPopularity } from "./popularity";
import { type RoundSource, withRounds } from "./round-chain";
import { registerRoundRoutes } from "./rounds";

export interface AppDeps {
  /** Client for the chain the mechanism contracts live on. */
  publicClient: Pick<PublicClient, "getChainId">;
  /** Deployed contract addresses by name. */
  contracts: Record<string, `0x${string}`>;
  /** Listed services and the critic lookup used to keep critic calls out of popularity. */
  marketplace?: { source: MarketplaceSource; isCritic: IsCritic };
  /** ServiceRegistry listings indexed from the chain; serves the service list when no marketplace is given. */
  listings?: ListingSource;
  /** CriticRegistry registrations indexed from the chain; serves the critics routes. */
  critics?: CriticSource;
  /** RoundManager rounds indexed from the chain; serves /rounds/:id and puts finalised scores on the services. */
  rounds?: RoundSource;
  /** Where published evidence is kept, by hash; defaults to memory. */
  evidence?: EvidenceStore;
}

export { type CriticSource, type CriticView, createCriticSource } from "./critics";
export { createRegistrySource, type ListingSource } from "./listings";
export { createRoundSource, type RoundSource } from "./round-chain";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/health", async (_req, reply) => {
    try {
      return { ok: true, chainId: await deps.publicClient.getChainId() };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  const scored = <T extends RankingInput>(source: { list(): Promise<T[]> | T[] }) =>
    deps.rounds ? withRounds(source, deps.rounds) : source;
  if (deps.marketplace) {
    const counter = new PopularityCounter(deps.marketplace.isCritic);
    registerPopularityRoutes(app, counter);
    registerMarketplaceRoutes(app, withPopularity(scored(deps.marketplace.source), counter));
  } else if (deps.listings) {
    registerMarketplaceRoutes(app, scored(deps.listings));
  }
  if (deps.listings) registerSuiteRoute(app, deps.listings);
  if (deps.critics) registerCriticRoutes(app, deps.critics);
  if (deps.rounds) registerRoundRoutes(app, deps.rounds);
  registerEvidenceRoutes(app, deps.evidence ?? new MemoryEvidenceStore());
  registerBuyerRunRoutes(app);

  return app;
}
