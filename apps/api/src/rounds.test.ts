import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRoundRoutes } from './rounds';

describe('round API route', () => {
  it('serves validated round state and handles invalid or missing IDs', async () => {
    const app = Fastify();
    const view = { id: 2, serviceId: 4, phase: 'finalized' as const, commitEnd: '2026-11-06T00:00:00.000Z', revealEnd: '2026-11-06T00:01:00.000Z', median: 82, reveals: [] };
    registerRoundRoutes(app, { get: id => id === 2 ? view : undefined });
    expect((await app.inject({ method: 'GET', url: '/rounds/2' })).json()).toEqual(view);
    expect((await app.inject({ method: 'GET', url: '/rounds/nope' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/rounds/99' })).statusCode).toBe(404);
    await app.close();
  });
});
