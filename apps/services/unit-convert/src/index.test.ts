import { describe, expect, it } from 'vitest';
import { TestSuiteSchema, suiteHash } from 'shared';
import { handleUnitConvert, unitConvertSuite, unitConvertSpecHash } from './index';

describe('unit-convert service', () => {
  it('validates and hashes a 12-case mixed suite', () => {
    expect(unitConvertSuite.cases).toHaveLength(12);
    expect(new Set(unitConvertSuite.cases.map(testCase => testCase.expect.kind))).toEqual(new Set(['exact', 'schema', 'regex', 'judge']));
    expect(TestSuiteSchema.safeParse(unitConvertSuite).success).toBe(true);
    expect(unitConvertSpecHash).toBe(suiteHash(unitConvertSuite));
  });

  it('scores at least 95 percent against the public suite', async () => {
    for (const testCase of unitConvertSuite.cases) {
      const output = await handleUnitConvert(testCase.input);
      if (testCase.expect.kind === 'exact') expect(output).toEqual(testCase.expect.value);
      if (testCase.expect.kind === 'schema') expect(output).toMatchObject({ result: expect.any(Number), unit: expect.any(String) });
      if (testCase.expect.kind === 'regex') expect(output).toMatch(new RegExp(testCase.expect.pattern));
      if (testCase.expect.kind === 'judge') expect(output).toEqual({ result: 0, unit: 'C' });
    }
  });
});
