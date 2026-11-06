import { describe, expect, it } from 'vitest';
import { TestSuiteSchema, suiteHash } from 'shared';
import { createJsonExtract, jsonExtractExpected, jsonExtractSuite, jsonExtractSpecHash, type JsonExtractor } from './index';

describe('json-extract service', () => {
  it('validates and hashes a 12-case mixed suite', () => {
    expect(jsonExtractSuite.cases).toHaveLength(12);
    expect(new Set(jsonExtractSuite.cases.map(testCase => testCase.expect.kind))).toEqual(new Set(['exact', 'schema', 'regex', 'judge']));
    expect(TestSuiteSchema.safeParse(jsonExtractSuite).success).toBe(true);
    expect(jsonExtractSpecHash).toBe(suiteHash(jsonExtractSuite));
  });

  it('passes at least 85 percent with a deterministic LLM stub and validates output', async () => {
    const fixtures = new Map(jsonExtractSuite.cases.map(testCase => [(testCase.input as { text: string }).text, jsonExtractExpected[testCase.id]]));
    const llm: JsonExtractor = { extract: async text => fixtures.get(text) };
    const handle = createJsonExtract(llm);
    let passed = 0;
    for (const testCase of jsonExtractSuite.cases) {
      const output = await handle({ ...(testCase.input as object), caseId: testCase.id });
      if (JSON.stringify(output) === JSON.stringify(jsonExtractExpected[testCase.id])) passed++;
    }
    expect((passed / jsonExtractSuite.cases.length) * 100).toBeGreaterThanOrEqual(85);
  });

  it('rejects a provider response that does not match the requested fields schema', async () => {
    const handle = createJsonExtract({ extract: async () => ({ unexpected: 'value' }) });
    await expect(handle({ text: 'name: Ria', fields: ['name'] })).rejects.toThrow('schema');
  });
});
