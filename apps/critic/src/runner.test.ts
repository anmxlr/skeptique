import { describe, expect, it, vi } from 'vitest';
import { suiteHash } from 'shared';
import { runCriticSuite } from './runner';

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
