import { describe, expect, it } from 'vitest';
import { TestSuiteSchema, suiteHash } from 'shared';
import { createFlakyFx, flakyFxSuite, flakyFxSpecHash } from './index';

describe('flaky-fx service', () => {
  it('validates and hashes a 12-case mixed suite', () => {
    expect(flakyFxSuite.cases).toHaveLength(12);
    expect(new Set(flakyFxSuite.cases.map(testCase => testCase.expect.kind))).toEqual(new Set(['exact', 'schema', 'regex', 'judge']));
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
});
