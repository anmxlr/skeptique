import type { RankingInput } from "@skeptique/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { PublicClient } from "viem";
import { registerBuyerRunRoutes } from "./buyer-runs";
import { type CriticSource, registerCriticRoutes } from "./critics";
import { type ChainEventDeps, registerEventRoutes } from "./events";
import { type EvidenceStore, MemoryEvidenceStore, registerEvidenceRoutes } from "./evidence";
import { type ListingSource, registerSuiteRoute } from "./listings";
import { type MarketplaceSource, registerMarketplaceRoutes } from "./marketplace";
import { type IsCritic, PopularityCounter, registerPopularityRoutes, withPopularity } from "./popularity";
import { withRounds } from "./round-chain";
import { type RoundViewSource, registerRoundRoutes } from "./rounds";
import { registerWorldRoutes, type WorldDeps } from "./world";

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
  /** World ID onboarding for critics; the /world routes exist only when this is given. */
  world?: WorldDeps;
  rounds?: RoundViewSource;
  /** RoundManager events streamed to pages on `GET /events`. */
  events?: ChainEventDeps;
  /** Where published evidence is kept, by hash; defaults to memory. */
  evidence?: EvidenceStore;
}

export { type CriticSource, type CriticView, createCriticSource } from "./critics";
export { createRegistrySource, type ListingSource } from "./listings";
export { type RoundSource } from "./round-chain";

export { createRoundSource, type RoundViewSource } from "./rounds";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  // Public reads are consumed by the separately hosted web app.
  app.addHook("onSend", async (request, reply) => {
    if (request.method === "GET") reply.header("Access-Control-Allow-Origin", "*");
  });

  app.get("/health", async (_req, reply) => {
    try {
      return { ok: true, chainId: await deps.publicClient.getChainId() };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  const scored = <T extends RankingInput>(source: { list(): Promise<T[]> | T[] }) =>
    deps.rounds?.all ? withRounds(source, { all: deps.rounds.all.bind(deps.rounds) }) : source;
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
  if (deps.events) registerEventRoutes(app, deps.events);
  registerEvidenceRoutes(app, deps.evidence ?? new MemoryEvidenceStore());
  registerBuyerRunRoutes(app);
  if (deps.world) registerWorldRoutes(app, deps.world, deps.publicClient);

  return app;
}
