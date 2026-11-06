import { type BuyerRun, BuyerRunSchema } from "@skeptique/shared";
import type { FastifyInstance } from "fastify";

/** Latest buyer-agent run per strategy, shown side by side on the Buyer page. */
export function registerBuyerRunRoutes(app: FastifyInstance): void {
  const latest = new Map<BuyerRun["strategy"], BuyerRun>();

  app.post("/buyer/runs", async (request, reply) => {
    const parsed = BuyerRunSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ reason: "Invalid buyer run" });
    latest.set(parsed.data.strategy, parsed.data);
    return reply.code(201).send(parsed.data);
  });

  // Public read-only data fetched by the web app from another origin.
  app.get("/buyer/runs", async (_request, reply) => {
    reply.header("access-control-allow-origin", "*");
    return (["skeptique", "popularity"] as const).flatMap((strategy) => latest.get(strategy) ?? []);
  });
}
