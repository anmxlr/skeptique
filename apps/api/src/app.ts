import type { Deployment } from "@skeptique/shared/deployment";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { PublicClient } from "viem";
import { registerBuyerRunRoutes } from "./buyer-runs";
import { type CriticSource, registerCriticRoutes } from "./critics";
import { type ChainEventDeps, registerEventRoutes } from "./events";
import { type EvidenceStore, MemoryEvidenceStore, registerEvidenceRoutes } from "./evidence";
import { type ListingSource, registerSuiteRoute } from "./listings";
import { type MarketplaceSource, registerMarketplaceRoutes } from "./marketplace";
import { type IsCritic, PopularityCounter, registerPopularityRoutes, withPopularity } from "./popularity";
import { type RoundViewSource, registerRoundRoutes } from "./rounds";
import { registerServiceReviewRoutes, type ServiceReviewSource } from "./service-reviews";
import { registerWorldRoutes, type WorldDeps } from "./world";

export interface AppDeps {
  /** Client for the chain the mechanism contracts live on. */
  publicClient: Pick<PublicClient, "getChainId">;
  /** Deployed contract addresses by name. */
  contracts: Record<string, `0x${string}`>;
  deployment?: Deployment;
  /** Listed services and the critic lookup used to keep critic calls out of popularity. */
  marketplace?: { source: MarketplaceSource; isCritic: IsCritic };
  /** ServiceRegistry listings indexed from the chain; serves the service list when no marketplace is given. */
  listings?: ListingSource;
  /** CriticRegistry registrations indexed from the chain; serves the critics routes. */
  critics?: CriticSource;
  /** World ID onboarding for critics. */
  world?: WorldDeps;
  /** Exact browser origin allowed to POST World verification requests. */
  webOrigin?: string;
  /** Compatibility alias; evidence takes precedence when both are supplied. */
  evidenceStore?: EvidenceStore;
  serviceReviews?: ServiceReviewSource;
  rounds?: RoundViewSource;
  /** RoundManager events streamed to pages on `GET /events`. */
  events?: ChainEventDeps;
  /** Where published evidence is kept, by hash; defaults to memory. */
  evidence?: EvidenceStore;
}

export { type CriticSource, type CriticView, createCriticSource } from "./critics";
export { createRegistrySource, type ListingSource } from "./listings";
export { type RoundSource } from "./round-chain";

export { createFinalizedRankingSource } from "./ranking-source";
export { createRoundSource, type RoundViewSource } from "./rounds";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  if (deps.webOrigin !== undefined) {
    let configured: URL;
    try {
      configured = new URL(deps.webOrigin);
    } catch {
      throw new Error("webOrigin must be an exact http(s) URL origin");
    }
    if (!["http:", "https:"].includes(configured.protocol) || configured.origin !== deps.webOrigin)
      throw new Error("webOrigin must be an exact http(s) URL origin");
  }
  const app = Fastify(options);
  const worldPaths = new Set(["/world/rp-context", "/world/verify"]);
  const worldCors = (url: string) => Boolean(deps.world && deps.webOrigin && worldPaths.has(url.split("?")[0]));
  // Public reads are consumed by the separately hosted web app.
  app.addHook("onSend", async (request, reply) => {
    if (request.method === "GET") reply.header("Access-Control-Allow-Origin", "*");
    if (worldCors(request.url) && ["POST", "OPTIONS"].includes(request.method)) {
      reply.header("Vary", "Origin");
      if (request.headers.origin === deps.webOrigin && (request.method === "POST" || reply.statusCode === 204))
        reply.header("Access-Control-Allow-Origin", deps.webOrigin);
    }
  });

  if (deps.world && deps.webOrigin) {
    for (const path of worldPaths)
      app.options(path, async (request, reply) => {
        const headers = request.headers["access-control-request-headers"];
        const requested =
          typeof headers === "string" ? headers.split(",").map((header) => header.trim().toLowerCase()) : [];
        if (
          request.headers.origin !== deps.webOrigin ||
          request.headers["access-control-request-method"] !== "POST" ||
          requested.some((header) => header !== "content-type")
        )
          return reply.code(403).send({ error: "World browser origin or preflight is not allowed" });
        return reply
          .header("Access-Control-Allow-Methods", "POST, OPTIONS")
          .header("Access-Control-Allow-Headers", "Content-Type")
          .code(204)
          .send();
      });
  }

  app.get("/health", async (_req, reply) => {
    try {
      return { ok: true, chainId: await deps.publicClient.getChainId() };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  if (deps.deployment) app.get("/deployment", async () => deps.deployment);

  if (deps.marketplace) {
    const counter = new PopularityCounter(deps.marketplace.isCritic);
    registerPopularityRoutes(app, counter);
    registerMarketplaceRoutes(app, withPopularity(deps.marketplace.source, counter));
  } else if (deps.listings) {
    registerMarketplaceRoutes(app, deps.listings);
  }
  if (deps.listings) registerSuiteRoute(app, deps.listings);
  if (deps.critics) registerCriticRoutes(app, deps.critics);
  if (deps.rounds) registerRoundRoutes(app, deps.rounds);
  if (deps.events) registerEventRoutes(app, deps.events);
  registerEvidenceRoutes(app, deps.evidence ?? deps.evidenceStore ?? new MemoryEvidenceStore());
  registerBuyerRunRoutes(app);
  if (deps.serviceReviews) registerServiceReviewRoutes(app, deps.serviceReviews);
  if (deps.world) registerWorldRoutes(app, deps.world, deps.publicClient);

  return app;
}

export { MemoryEvidenceStore } from "./evidence";
export { createServiceReviewSource } from "./service-reviews";
