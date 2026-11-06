import { describe, expect, it } from 'vitest';
import { demoServiceListings, seedDemoServices } from './catalog';

describe('ticket 13 marketplace service seed', () => {
  it('lists all five demo services with suite hashes', async () => {
    const registered: Array<{ name: string; specHash: string }> = [];
    await seedDemoServices(service => { registered.push({ name: service.name, specHash: service.specHash }); });
    expect(registered.map(service => service.name)).toEqual(['unit-convert', 'csv-clean', 'json-extract', 'flaky-fx', 'suite-gamer']);
    expect(registered.every(service => /^0x[0-9a-f]{64}$/.test(service.specHash))).toBe(true);
    expect(demoServiceListings).toHaveLength(5);
  });
});
