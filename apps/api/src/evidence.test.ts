import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerEvidenceRoutes, MemoryEvidenceStore } from './evidence';

const evidence = { roundId: 1, critic: '0x0000000000000000000000000000000000000001', suite: [], probes: [], latencyMs: { p50: 1, p95: 2 }, x402Txs: [], claimedCost: '0', score: 75, model: 'local' };

describe('evidence routes', () => {
  it('rejects invalid evidence and retrieves valid evidence by hash', async () => {
    const app = Fastify();
    registerEvidenceRoutes(app, new MemoryEvidenceStore());
    expect((await app.inject({ method: 'POST', url: '/evidence', payload: { ...evidence, score: 101 } })).statusCode).toBe(400);
    const posted = await app.inject({ method: 'POST', url: '/evidence', payload: evidence });
    expect(posted.statusCode).toBe(200);
    const hash = posted.json().hash;
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await app.inject({ method: 'GET', url: `/evidence/${hash}` })).json()).toEqual(evidence);
    await app.close();
  });
});
