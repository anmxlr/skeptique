import { isDeepStrictEqual } from 'node:util';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import type { TestCase, TestSuite } from 'shared';
import { handleUnitConvert, unitConvertSuite } from './unit-convert/src/index';
import { cleanCsv, csvCleanSuite } from './csv-clean/src/index';
import { createJsonExtract, jsonExtractExpected, jsonExtractSuite } from './json-extract/src/index';
import { createFlakyFx, flakyFxSuite } from './flaky-fx/src/index';

function fixtureJudge(testCase: TestCase, output: unknown): boolean {
  if (testCase.id === 'empty') return output === '';
  if (!output || typeof output !== 'object') return false;
  const value = output as Record<string, unknown>;
  if (testCase.id === 'kelvin-judge') return value.unit === 'C' && typeof value.result === 'number' && Math.abs(value.result) <= 1e-8;
  if (testCase.id === 'merchant') return value.merchant === 'Mira' && value.amount === '$42.00';
  if (testCase.id === 'bad-amount') return value.amount === -1 && value.rate === 0.92 && value.converted === -0.92;
  throw new Error(`Missing deterministic judge fixture for ${testCase.id}`);
}

async function evaluateSuite(suite: TestSuite, call: (input: unknown) => unknown | Promise<unknown>) {
  const ajv = new Ajv({ strict: false });
  let passedWeight = 0;
  const failed: string[] = [];
  for (const testCase of suite.cases) {
    let output: unknown;
    try { output = await call(testCase.input); }
    catch { failed.push(testCase.id); continue; }
    let passed: boolean;
    switch (testCase.expect.kind) {
      case 'exact': passed = isDeepStrictEqual(output, testCase.expect.value); break;
      case 'schema': passed = ajv.validate(testCase.expect.schema, output) === true; break;
      case 'regex': passed = typeof output === 'string' && new RegExp(testCase.expect.pattern).test(output); break;
      case 'judge': passed = fixtureJudge(testCase, output); break;
    }
    if (passed) passedWeight += testCase.weight;
    else failed.push(testCase.id);
  }
  return { passRate: 100 * passedWeight / suite.cases.reduce((sum, testCase) => sum + testCase.weight, 0), failed };
}

describe('public service suite semantics', () => {
  it('evaluates actual handler outputs using the published expectation kinds', async () => {
    const outputsByText = new Map(jsonExtractSuite.cases.map(testCase => [(testCase.input as { text: string }).text, jsonExtractExpected[testCase.id]]));
    const extraction = createJsonExtract({ extract: async text => structuredClone(outputsByText.get(text)) });
    expect(await evaluateSuite(unitConvertSuite, handleUnitConvert)).toEqual({ passRate: 100, failed: [] });
    expect(await evaluateSuite(csvCleanSuite, input => cleanCsv(input as { csv: string }))).toEqual({ passRate: 75, failed: ['quotedComma', 'quotedNewline', 'unicode'] });
    expect(await evaluateSuite(jsonExtractSuite, extraction)).toEqual({ passRate: 100, failed: [] });
    expect(await evaluateSuite(flakyFxSuite, createFlakyFx({ seed: 1306 }))).toEqual({ passRate: 75, failed: ['usd-eur', 'eur-usd', 'bad-amount'] });
  });

  it('allows every FX expectation to pass when injected staleness is disabled', async () => {
    expect(await evaluateSuite(flakyFxSuite, createFlakyFx({ staleRate: 0 }))).toEqual({ passRate: 100, failed: [] });
  });
});
