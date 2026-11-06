import { isDeepStrictEqual } from 'node:util';
import Ajv from 'ajv';
import { TestSuiteSchema, suiteHash, type CaseResult, type Evidence, type TestCase, type TestSuite } from 'shared';

type CallResult = { response: unknown; txId: string | null; paid: boolean };
type RunArgs = {
  suite: TestSuite;
  specHash: string;
  roundId: number;
  critic: string;
  endpoint: string;
  maxPrice: string;
  signer: unknown;
  payAndCall: (args: { url: string; body: unknown; maxPrice: string; signer: unknown }) => Promise<CallResult>;
};

const ajv = new Ajv({ allErrors: true, strict: false });

function passes(testCase: TestCase, response: unknown): boolean {
  switch (testCase.expect.kind) {
    case 'exact': return isDeepStrictEqual(response, testCase.expect.value);
    case 'schema': return ajv.validate(testCase.expect.schema, response) === true;
    case 'regex': return typeof response === 'string' && new RegExp(testCase.expect.pattern).test(response);
    case 'judge': throw new Error('Judge cases require the probe runner');
  }
}

function percentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export async function runCriticSuite(args: RunArgs): Promise<{ evidence: Evidence; suitePass: number; errorRate: number }> {
  const suite = TestSuiteSchema.parse(args.suite);
  if (suiteHash(suite).toLowerCase() !== args.specHash.toLowerCase()) throw new Error('Suite hash mismatch');
  const results: CaseResult[] = [];
  const x402Txs: string[] = [];
  let errors = 0;

  for (const testCase of suite.cases) {
    const start = performance.now();
    try {
      const { response, txId } = await args.payAndCall({
        url: args.endpoint,
        body: { input: testCase.input, criticCall: true },
        maxPrice: args.maxPrice,
        signer: args.signer,
      });
      if (txId) x402Txs.push(txId);
      results.push({ caseId: testCase.id, passed: passes(testCase, response), weight: testCase.weight, latencyMs: performance.now() - start });
    } catch (error) {
      errors++;
      results.push({ caseId: testCase.id, passed: false, weight: testCase.weight, latencyMs: performance.now() - start, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
  const suitePass = Math.round(100 * results.reduce((sum, result) => sum + (result.passed ? result.weight : 0), 0) / totalWeight);
  const latencies = results.map(result => result.latencyMs);
  const evidence: Evidence = {
    roundId: args.roundId,
    critic: args.critic,
    suite: results,
    probes: [],
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    x402Txs,
    claimedCost: '0',
    score: suitePass,
    model: 'none',
  };
  return { evidence, suitePass, errorRate: errors / suite.cases.length };
}

export async function fetchAndRunCriticSuite(args: Omit<RunArgs, 'suite'> & { suiteUrl: string; fetchImpl?: typeof fetch }) {
  const response = await (args.fetchImpl ?? fetch)(args.suiteUrl);
  if (!response.ok) throw new Error(`Suite fetch returned ${response.status}`);
  return runCriticSuite({ ...args, suite: TestSuiteSchema.parse(await response.json()) });
}
