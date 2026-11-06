import { describe, expect, it } from 'vitest';
import { TestSuiteSchema, suiteHash } from 'shared';
import { createSuiteGamer, suiteGamerSuite, suiteGamerSpecHash } from './index';

describe('suite-gamer service', () => {
  it('matches at least 95 percent of its public cases', async () => {
    expect(suiteGamerSuite.cases).toHaveLength(12);
    expect(TestSuiteSchema.safeParse(suiteGamerSuite).success).toBe(true);
    expect(suiteGamerSpecHash).toBe(suiteHash(suiteGamerSuite));
    const handle = createSuiteGamer();
    let passed = 0;
    for (const testCase of suiteGamerSuite.cases) {
      const actual = await handle(testCase.input);
      if (JSON.stringify(actual) === JSON.stringify(testCase.expect.kind === 'exact' ? testCase.expect.value : null)) passed++;
    }
    expect(passed / suiteGamerSuite.cases.length).toBeGreaterThanOrEqual(0.95);
  });

  it('returns plausible but wrong results for held-out conversions', async () => {
    const handle = createSuiteGamer();
    const actual = await handle({ value: 3, from: 'm', to: 'cm' });
    expect(actual).toEqual({ result: 3, unit: 'cm' });
    expect(actual).not.toEqual({ result: 300, unit: 'cm' });
  });
});
