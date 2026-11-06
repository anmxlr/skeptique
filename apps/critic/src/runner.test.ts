import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { suiteHash, type TestSuite } from 'shared';
import { fetchAndRunCriticSuite, publishCriticEvidence, runCriticSuite } from './runner';

const critic = '0x0000000000000000000000000000000000000001';
const suite = {
  version: 1 as const, serviceName: 'demo', category: 'conversion', determinism: 'none' as const,
  cases: [
    { id: 'exact', input: { x: 1 }, expect: { kind: 'exact' as const, value: { result: 2 } }, weight: 2 },
    { id: 'schema', input: { x: 2 }, expect: { kind: 'schema' as const, schema: { type: 'object', required: ['result'], properties: { result: { type: 'number' } } } }, weight: 1 },
    { id: 'regex', input: { x: 3 }, expect: { kind: 'regex' as const, pattern: '^ok$' }, weight: 1 },
  ],
};

describe('critic suite runner', () => {
  const args = { roundId: 1, critic, endpoint: 'http://local/call', maxPrice: '5', signer: {} };

  it.each([
    { kind: 'regex', pattern: '[' },
    { kind: 'schema', schema: { type: 'not-a-json-schema-type' } },
  ] as TestSuite['cases'][number]['expect'][])('rejects invalid expectations before spending: $kind', async expectRule => {
    const invalidSuite: TestSuite = { ...suite, cases: [{ ...suite.cases[0]!, expect: expectRule }] };
    const payAndCall = vi.fn();
    await expect(runCriticSuite({ ...args, suite: invalidSuite, specHash: suiteHash(invalidSuite), payAndCall })).rejects.toThrow();
    expect(payAndCall).not.toHaveBeenCalled();
  });

  it('keeps weighted scores finite when individual finite weights overflow their sum', async () => {
    const weightedSuite: TestSuite = { ...suite, cases: [
      { ...suite.cases[0]!, weight: 1e308 },
      { ...suite.cases[1]!, weight: 1e308 },
    ] };
    const payAndCall = vi.fn(async () => ({ response: { result: 2 }, txId: null, paid: false }));
    const result = await runCriticSuite({ ...args, suite: weightedSuite, specHash: suiteHash(weightedSuite), payAndCall });
    expect(result.suitePass).toBe(100);
  });

  it('aborts a stalled call and records a failed case without hanging the round', async () => {
    const oneCase: TestSuite = { ...suite, cases: [suite.cases[0]!] };
    let signal: AbortSignal | undefined;
    const payAndCall = vi.fn((call: { signal?: AbortSignal }) => {
      signal = call.signal;
      return new Promise<never>(() => {});
    });
    const result = await runCriticSuite({ ...args, suite: oneCase, specHash: suiteHash(oneCase), payAndCall, timeoutMs: 5 });
    expect(signal?.aborted).toBe(true);
    expect(result.errorRate).toBe(1);
    expect(result.evidence.suite[0]!.error).toMatch(/timed out/);
  });

  it('validates critic identity before making a service call', async () => {
    const payAndCall = vi.fn();
    await expect(runCriticSuite({ ...args, critic: 'invalid', suite, specHash: suiteHash(suite), payAndCall })).rejects.toThrow();
    expect(payAndCall).not.toHaveBeenCalled();
  });

  it('aborts the review on judge failures instead of publishing a false service failure', async () => {
    const judgeSuite: TestSuite = { ...suite, cases: [{ ...suite.cases[0]!, expect: { kind: 'judge', rubric: 'correctness' } }, suite.cases[1]!] };
    const payAndCall = vi.fn(async () => ({ response: { result: 2 }, txId: null, paid: false }));
    await expect(runCriticSuite({ ...args, suite: judgeSuite, specHash: suiteHash(judgeSuite), payAndCall, model: 'fixture', judge: async () => { throw new Error('Judge offline'); } })).rejects.toThrow('Judge offline');
    expect(payAndCall).toHaveBeenCalledTimes(1);
  });

  it('stops the review when its total round budget is exhausted', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const payAndCall = vi.fn(async () => { now += 600; return { response: { result: 2 }, txId: null, paid: false }; });
    try {
      await expect(runCriticSuite({ ...args, suite, specHash: suiteHash(suite), payAndCall, budgetMs: 1000 })).rejects.toThrow('budget exceeded');
      expect(payAndCall).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });

  it('retains auditable output and unrounded weighted rate for final score composition', async () => {
    const weighted: TestSuite = { ...suite, cases: [{ ...suite.cases[0]!, weight: 1 }, { ...suite.cases[1]!, weight: 6 }] };
    const outputs = [{ result: 2 }, { noResult: true }];
    const result = await runCriticSuite({ ...args, suite: weighted, specHash: suiteHash(weighted), payAndCall: async () => ({ response: outputs.shift(), txId: null, paid: false }) });
    expect(result.suitePass).toBeCloseTo(100 / 7);
    expect(result.evidence.score).toBe(14);
    expect(result.evidence.suite[0]!.output).toEqual({ result: 2 });
  });

  it('publishes schema-validated evidence and checks the returned hash', async () => {
    const payAndCall = vi.fn(async () => ({ response: { result: 2 }, txId: null, paid: false }));
    const { evidence } = await runCriticSuite({ ...args, suite, specHash: suiteHash(suite), payAndCall });
    const hash = `0x${createHash('sha256').update(canonicalize(evidence)!).digest('hex')}`;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ hash })));
    await expect(publishCriticEvidence({ evidence, url: 'http://local/evidence', fetchImpl })).resolves.toBe(hash);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toEqual(evidence);
    const invalid = vi.fn(async () => new Response(JSON.stringify({ hash: 'not-a-hash' })));
    await expect(publishCriticEvidence({ evidence, url: 'http://local/evidence', fetchImpl: invalid })).rejects.toThrow('Invalid evidence hash');
    const wrong = vi.fn(async () => new Response(JSON.stringify({ hash: `0x${'ab'.repeat(32)}` })));
    await expect(publishCriticEvidence({ evidence, url: 'http://local/evidence', fetchImpl: wrong })).rejects.toThrow('does not match');
  });

  it('requires a judge before calls and records its model without charging its time to service latency', async () => {
    const judgeSuite: TestSuite = { ...suite, cases: [{ ...suite.cases[0]!, expect: { kind: 'judge', rubric: 'Return the right result' } }] };
    const payAndCall = vi.fn(async () => ({ response: { result: 2 }, txId: null, paid: false }));
    await expect(runCriticSuite({ ...args, suite: judgeSuite, specHash: suiteHash(judgeSuite), payAndCall })).rejects.toThrow('judge adapter');
    expect(payAndCall).not.toHaveBeenCalled();
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const result = await runCriticSuite({ ...args, suite: judgeSuite, specHash: suiteHash(judgeSuite), model: 'fixture-judge',
        payAndCall: async () => { now = 2; return { response: { result: 2 }, txId: null, paid: false }; },
        judge: async () => { now = 100; return true; },
      });
      expect(result.suitePass).toBe(100);
      expect(result.evidence.model).toBe('fixture-judge');
      expect(result.evidence.latencyMs).toEqual({ p50: 2, p95: 2 });
    } finally { clock.mockRestore(); }
  });

  it('bounds suite fetches and refuses unsuccessful responses', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response('', { status: 503 });
    });
    const payAndCall = vi.fn();
    await expect(fetchAndRunCriticSuite({ ...args, specHash: suiteHash(suite), suiteUrl: 'http://local/suite.json', payAndCall, fetchImpl })).rejects.toThrow('503');
    expect(payAndCall).not.toHaveBeenCalled();
  });
  it('refuses a hash mismatch before any service call', async () => {
    const payAndCall = vi.fn();
    await expect(runCriticSuite({ suite, specHash: `0x${'00'.repeat(32)}`, roundId: 1, critic, endpoint: 'http://local/call', maxPrice: '5', signer: {}, payAndCall })).rejects.toThrow('Suite hash mismatch');
    expect(payAndCall).not.toHaveBeenCalled();
  });

  it('scores mixed weighted cases and records latency and errors', async () => {
    const responses = [{ result: 2 }, { noResult: true }, 'ok'];
    const payAndCall = vi.fn(async (_args: { url: string; body: unknown; maxPrice: string; signer: unknown }) => ({ response: responses.shift(), txId: null, paid: false }));
    const result = await runCriticSuite({ suite, specHash: suiteHash(suite), roundId: 1, critic, endpoint: 'http://local/call', maxPrice: '5', signer: {}, payAndCall });
    expect(result.suitePass).toBe(75);
    expect(result.errorRate).toBe(0);
    expect(result.evidence.suite.map(item => item.passed)).toEqual([true, false, true]);
    expect(result.evidence.latencyMs.p95).toBeGreaterThanOrEqual(result.evidence.latencyMs.p50);
    expect(payAndCall).toHaveBeenCalledTimes(3);
    expect((payAndCall.mock.calls[0]![0].body as { criticCall: boolean }).criticCall).toBe(true);
  });
});
