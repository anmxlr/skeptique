import { describe, expect, it } from 'vitest';
import type { TestCase } from 'shared';
import { createBoundedExpectations } from './bounded-expectations';

function testCase(expectation: TestCase['expect']): TestCase {
  return { id: 'case', input: null, expect: expectation, weight: 1 };
}

describe('bounded expectation evaluator', () => {
  it('precompiles a suite and reuses its worker for exact, schema and regex checks', async () => {
    const evaluator = await createBoundedExpectations([
      testCase({ kind: 'exact', value: { answer: [42] } }),
      testCase({ kind: 'schema', schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } }, additionalProperties: false } }),
      testCase({ kind: 'regex', pattern: '^hello$' }),
      testCase({ kind: 'judge', rubric: 'Handled by the main process' }),
    ], 1000);
    try {
      expect(await evaluator.evaluate(0, { answer: [42] })).toBe(true);
      expect(await evaluator.evaluate(0, { answer: [43] })).toBe(false);
      expect(await evaluator.evaluate(1, { answer: 42 })).toBe(true);
      expect(await evaluator.evaluate(1, { answer: 'wrong' })).toBe(false);
      expect(await evaluator.evaluate(2, 'hello')).toBe(true);
      expect(await evaluator.evaluate(2, 'hello world')).toBe(false);
    } finally {
      await evaluator.close();
      await evaluator.close();
    }
    await expect(evaluator.evaluate(0, { answer: [42] })).rejects.toThrow('closed');
  });

  it.each([
    { kind: 'regex', pattern: '[' },
    { kind: 'schema', schema: { type: 'not-a-json-schema-type' } },
    { kind: 'schema', schema: { $async: true, type: 'string' } },
  ] as TestCase['expect'][])('rejects invalid expectations during preflight', async expectation => {
    await expect(createBoundedExpectations([testCase(expectation)], 1000)).rejects.toThrow();
  });

  it.each([
    { kind: 'regex', pattern: '(a+)+$' },
    { kind: 'schema', schema: { type: 'string', pattern: '(a+)+$' } },
  ] as TestCase['expect'][])('terminates an evaluator blocked by a catastrophic pattern', async expectation => {
    const evaluator = await createBoundedExpectations([testCase(expectation)], 20);
    try {
      await expect(evaluator.evaluate(0, `${'a'.repeat(1000)}!`)).rejects.toThrow('timed out');
      await expect(evaluator.evaluate(0, 'a')).rejects.toThrow('unavailable');
    } finally {
      await evaluator.close();
    }
  });
});
