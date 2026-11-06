import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type { FastifyInstance } from 'fastify';
import { EvidenceSchema, type Evidence } from 'shared';

export interface EvidenceStore {
  put(hash: string, evidence: Evidence): Promise<void> | void;
  get(hash: string): Promise<Evidence | undefined> | Evidence | undefined;
}

export class MemoryEvidenceStore implements EvidenceStore {
  private readonly records = new Map<string, Evidence>();
  put(hash: string, evidence: Evidence) { this.records.set(hash, evidence); }
  get(hash: string) { return this.records.get(hash); }
}

export function registerEvidenceRoutes(app: FastifyInstance, store: EvidenceStore): void {
  app.post('/evidence', async (request, reply) => {
    const parsed = EvidenceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid evidence' });
    const canonical = canonicalize(parsed.data);
    if (canonical === undefined) return reply.code(400).send({ error: 'Invalid evidence JSON' });
    const hash = `0x${createHash('sha256').update(canonical).digest('hex')}`;
    await store.put(hash, parsed.data);
    return { hash };
  });

  app.get<{ Params: { hash: string } }>('/evidence/:hash', async (request, reply) => {
    const evidence = await store.get(request.params.hash);
    if (!evidence) return reply.code(404).send({ error: 'Evidence not found' });
    return evidence;
  });
}
