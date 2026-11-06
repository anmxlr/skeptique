import Fastify, { type FastifyServerOptions } from "fastify";
import type { PublicClient } from "viem";

export interface AppDeps {
  /** Client for the chain the mechanism contracts live on. */
  publicClient: Pick<PublicClient, "getChainId">;
  /** Deployed contract addresses by name. */
  contracts: Record<string, `0x${string}`>;
}

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/health", async (_req, reply) => {
    try {
      return { ok: true, chainId: await deps.publicClient.getChainId() };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  return app;
}
