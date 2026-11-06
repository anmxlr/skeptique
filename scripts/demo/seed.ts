import { mkdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { demoServices } from '../../apps/services/catalog';

export type DemoSeed = {
  version: 1;
  seed: number;
  seededAt: string;
  services: Array<{ id: number; name: string; category: string; specHash: string; popularityCalls: number }>;
  critics: Array<{ id: string; address: string; nullifier: string; persona: 'balanced' | 'strict' | 'lenient' | 'lazy-copier' | 'bribed'; stake: string }>;
  scoreHistory: Array<{ serviceId: number; roundId: number; median: number; confidence: number; reveals: number }>;
  openRound: { serviceId: number; roundId: number; commitWindowSeconds: number; revealWindowSeconds: number };
};

const popularityByService: Record<string, number> = {
  'unit-convert': 120,
  'csv-clean': 84,
  'json-extract': 95,
  'flaky-fx': 110,
  'suite-gamer': 900,
};

export function buildDemoSeed(): DemoSeed {
  const services = demoServices.map((service, index) => ({
    id: index + 1,
    name: service.name,
    category: service.suite.category,
    specHash: service.specHash,
    popularityCalls: popularityByService[service.name] ?? 0,
  }));
  const critics: DemoSeed['critics'] = [
    { id: 'balanced-1', address: '0x0000000000000000000000000000000000000001', nullifier: `0x${'01'.repeat(32)}`, persona: 'balanced', stake: '5000000000000000000' },
    { id: 'balanced-2', address: '0x0000000000000000000000000000000000000002', nullifier: `0x${'02'.repeat(32)}`, persona: 'balanced', stake: '5000000000000000000' },
    { id: 'balanced-3', address: '0x0000000000000000000000000000000000000003', nullifier: `0x${'03'.repeat(32)}`, persona: 'balanced', stake: '5000000000000000000' },
    { id: 'lazy-copier', address: '0x0000000000000000000000000000000000000004', nullifier: `0x${'04'.repeat(32)}`, persona: 'lazy-copier', stake: '5000000000000000000' },
    { id: 'bribed', address: '0x0000000000000000000000000000000000000005', nullifier: `0x${'05'.repeat(32)}`, persona: 'bribed', stake: '5000000000000000000' },
  ];
  const scoreByService: Record<string, number> = { 'unit-convert': 92, 'csv-clean': 68, 'json-extract': 91, 'flaky-fx': 72, 'suite-gamer': 96 };
  const scoreHistory = services.map(service => ({ serviceId: service.id, roundId: 1, median: scoreByService[service.name] ?? 0, confidence: 0.8, reveals: 4 }));
  return {
    version: 1,
    seed: 1306,
    seededAt: '2026-11-06T00:00:00.000Z',
    services,
    critics,
    scoreHistory,
    openRound: { serviceId: services[0]!.id, roundId: 2, commitWindowSeconds: 90, revealWindowSeconds: 45 },
  };
}

export async function seedDemoState(path = join(tmpdir(), 'skeptique-demo-seed-v1.json')): Promise<DemoSeed> {
  const seed = buildDemoSeed();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  return seed;
}
