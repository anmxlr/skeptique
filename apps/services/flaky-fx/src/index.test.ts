import { describe, expect, it } from 'vitest';
import { TestSuiteSchema, suiteHash } from 'shared';
import { createFlakyFx, flakyFxSuite, flakyFxSpecHash } from './index';

describe('flaky-fx service', () => {
  it('validates and hashes a 12-case mixed suite', () => {
    expect(flakyFxSuite.cases).toHaveLength(12);
    expect(new Set(flakyFxSuite.cases.map(testCase => testCase.expect.kind))).toEqual(new Set(['exact', 'schema', 'judge']));
    expect(TestSuiteSchema.safeParse(flakyFxSuite).success).toBe(true);
    expect(flakyFxSpecHash).toBe(suiteHash(flakyFxSuite));
  });

  it('reproduces a 25 to 35 percent stale rate over 200 calls', async () => {
    const convert = createFlakyFx({ seed: 13 });
    let stale = 0;
    for (let i = 0; i < 200; i++) {
      const result = await convert({ from: 'USD', to: 'EUR', amount: 10 });
      if (result.stale) stale++;
    }
    expect(stale / 200).toBeGreaterThanOrEqual(0.25);
    expect(stale / 200).toBeLessThanOrEqual(0.35);
  });

  it('supports seed zero without trapping the generator at a 100 percent stale rate', async () => {
    const first = createFlakyFx({ seed: 0 });
    const second = createFlakyFx({ seed: 0 });
    const sequence = await Promise.all(Array.from({ length: 200 }, () => first({ from: 'USD', to: 'EUR', amount: 10 })));
    const replay = await Promise.all(Array.from({ length: 200 }, () => second({ from: 'USD', to: 'EUR', amount: 10 })));
    expect(sequence).toEqual(replay);
    const staleRate = sequence.filter(result => result.stale).length / sequence.length;
    expect(staleRate).toBeGreaterThanOrEqual(0.25);
    expect(staleRate).toBeLessThanOrEqual(0.35);
  });

  it('rejects non-finite rates and invalid seeds instead of silently changing behavior', () => {
    for (const staleRate of [NaN, Infinity, -Infinity]) expect(() => createFlakyFx({ staleRate })).toThrow('staleRate');
    for (const seed of [NaN, Infinity, -1, 0.5, 2 ** 32]) expect(() => createFlakyFx({ seed })).toThrow('seed');
  });

  it('rejects unsupported currency pairs as invalid input', async () => {
    await expect(createFlakyFx({ staleRate: 0 })({ from: 'CAD', to: 'EUR', amount: 1 })).rejects.toThrow('Unsupported currency pair CAD/EUR');
  });
});
