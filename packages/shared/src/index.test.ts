import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUND_CONFIG,
  CaseResultSchema,
  EventSchemas,
  EvidenceSchema,
  RoundConfigSchema,
  RoundViewSchema,
  ServiceViewSchema,
  TestCaseSchema,
  TestSuiteSchema,
  type TestSuite,
  commitmentHash,
  commitmentVector,
  eventFixtures,
  suiteHash,
} from './index';

const suite: TestSuite = {
  version: 1,
  serviceName: 'unit-convert',
  category: 'conversion',
  determinism: 'none',
  cases: [{ id: 'c1', input: { from: 'm', to: 'cm', value: 2 }, expect: { kind: 'exact', value: 200 }, weight: 2 }],
};

describe('shared schemas', () => {
  it('validates every shared view and rejects invalid data', () => {
    expect(TestCaseSchema.safeParse(suite.cases[0]).success).toBe(true);
    expect(TestSuiteSchema.safeParse(suite).success).toBe(true);
    expect(TestSuiteSchema.safeParse({ ...suite, cases: [{ ...suite.cases[0], weight: -1 }] }).success).toBe(false);
    expect(EvidenceSchema.safeParse({ roundId: 1, critic: '0x0000000000000000000000000000000000000001', suite: [], probes: [], latencyMs: { p50: 1, p95: 2 }, x402Txs: [], claimedCost: '0', score: 75, model: 'fixture' }).success).toBe(true);
    expect(ServiceViewSchema.safeParse({ id: 1, name: 'A', category: 'conversion', endpoint: 'http://localhost:3000', pricePerCall: '1', seller: '0x0000000000000000000000000000000000000001', ensName: 'a.svc.skeptic.eth', median: null, confidence: 0, rank: 0, nRounds: 0, lastRoundAt: null, popularityCalls: 0 }).success).toBe(true);
    expect(RoundViewSchema.safeParse({ id: 1, serviceId: 1, phase: 'commit', commitEnd: '2026-11-06T00:00:00Z', revealEnd: '2026-11-06T00:01:00Z', median: null, reveals: [] }).success).toBe(true);
    expect(RoundConfigSchema.safeParse(DEFAULT_ROUND_CONFIG).success).toBe(true);
  });

  it('validates every contract event fixture and rejects a malformed event', () => {
    for (const [name, schema] of Object.entries(EventSchemas)) {
      expect(schema.safeParse(eventFixtures[name as keyof typeof eventFixtures]).success, name).toBe(true);
    }
    expect(EventSchemas.CriticRevealed.safeParse({ ...eventFixtures.CriticRevealed, score: 101 }).success).toBe(false);
  });

  it('preserves JSON service output in evidence while allowing an omitted response', () => {
    const result = { caseId: 'c1', passed: true, weight: 1, latencyMs: 1, output: { answer: [42, null, true] } };
    const evidence = EvidenceSchema.parse({ roundId: 1, critic: '0x0000000000000000000000000000000000000001', suite: [result], probes: [{ ...result, case: suite.cases[0] }], latencyMs: { p50: 1, p95: 1 }, x402Txs: [], claimedCost: '0', score: 100, model: 'none' });
    const roundtrip = EvidenceSchema.parse(JSON.parse(JSON.stringify(evidence)));
    expect(roundtrip.suite[0]).toHaveProperty('output', result.output);
    expect(roundtrip.probes[0]).toHaveProperty('output', result.output);
    const { output: _output, ...withoutOutput } = result;
    expect(CaseResultSchema.parse(withoutOutput)).not.toHaveProperty('output');
    expect(CaseResultSchema.parse({ ...result, output: null })).toHaveProperty('output', null);
    for (const output of [undefined, NaN, Infinity, { nested: undefined }]) {
      expect(CaseResultSchema.safeParse({ ...result, output }).success).toBe(false);
    }
  });
});

describe('hashes', () => {
  it('rejects non-JSON suite values instead of silently dropping them from the hash', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const invalidInputs = [undefined, { hidden: undefined }, [undefined], new Array(1), NaN, Infinity, 1n, () => 1, new Date(), circular];
    for (const input of invalidInputs) {
      const invalidSuite = { ...suite, cases: [{ ...suite.cases[0], input }] };
      expect(TestSuiteSchema.safeParse(invalidSuite).success).toBe(false);
      expect(() => suiteHash(invalidSuite)).toThrow();
    }
    expect(TestCaseSchema.safeParse({ ...suite.cases[0], expect: { kind: 'exact', value: undefined } }).success).toBe(false);
    expect(TestCaseSchema.safeParse({ ...suite.cases[0], expect: { kind: 'schema', schema: { default: undefined } } }).success).toBe(false);
  });

  it('hashes canonical suite JSON independent of object-key order', () => {
    const reordered: TestSuite = {
      cases: [{ weight: 2, expect: { value: 200, kind: 'exact' }, input: { value: 2, to: 'cm', from: 'm' }, id: 'c1' }],
      determinism: 'none', category: 'conversion', serviceName: 'unit-convert', version: 1,
    };
    expect(suiteHash(suite)).toBe(suiteHash(reordered));
    expect(suiteHash({ ...suite, cases: [{ ...suite.cases[0], input: { from: 'm', to: 'cm', value: 3 } }] })).not.toBe(suiteHash(suite));
  });

  it('matches the fixed Solidity ABI commitment vector', () => {
    expect(commitmentHash(commitmentVector.input)).toBe(commitmentVector.expected);
  });
});
