import { type RoundView, RoundViewSchema } from "@skeptique/shared";
import type { FastifyInstance } from "fastify";
import { getServiceRoundTimeline } from "./round-view";

export interface RoundViewSource {
  get(roundId: number): Promise<RoundView | undefined> | RoundView | undefined;
}

export function registerRoundRoutes(
  app: FastifyInstance,
  source: RoundViewSource & { all?(): Promise<RoundView[]> },
): void {
  // Additive to spec/03: the service page needs every round of one service, oldest first.
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
