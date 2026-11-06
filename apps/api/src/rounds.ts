import type { FastifyInstance } from 'fastify';
import { RoundViewSchema, type RoundView } from 'shared';

export interface RoundViewSource {
  get(roundId: number): Promise<RoundView | undefined> | RoundView | undefined;
}

export function registerRoundRoutes(app: FastifyInstance, source: RoundViewSource): void {
  app.get<{ Params: { id: string } }>('/rounds/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id)) return reply.code(400).send({ error: 'Invalid round ID' });
    const roundId = Number(request.params.id);
    const round = await source.get(roundId);
    if (!round) return reply.code(404).send({ error: 'Round not found' });
    const parsed = RoundViewSchema.safeParse(round);
    if (!parsed.success) return reply.code(500).send({ error: 'Invalid indexed round' });
    return parsed.data;
  });
}
