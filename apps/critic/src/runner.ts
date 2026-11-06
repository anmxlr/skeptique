import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { EvidenceSchema, TestSuiteSchema, suiteHash, type CaseResult, type Evidence, type TestSuite } from '@skeptic/shared';
import { createBoundedExpectations } from './bounded-expectations';

type CallResult = { response: unknown; txId: string | null; paid: boolean };
type RunArgs = {
  suite: TestSuite;
  specHash: string;
  roundId: number;
  critic: string;
  endpoint: string;
  maxPrice: string;
  signer: unknown;
  timeoutMs?: number;
  budgetMs?: number;
  model?: string;
  judge?: (input: { rubric: string; input: unknown; output: unknown }, signal?: AbortSignal) => Promise<boolean>;
  payAndCall: (args: { url: string; body: unknown; maxPrice: string; signer: unknown; signal?: AbortSignal; criticCall?: boolean }) => Promise<CallResult>;
};

function deadlineMs(value = 15_000): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) throw new Error('Invalid timeoutMs');
  return value;
}

async function withDeadline<T>(call: (signal: AbortSignal) => Promise<T> | T, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => call(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Critic operation timed out');
          controller.abort(error);
          reject(error);
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
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
  EvidenceSchema.pick({ roundId: true, critic: true }).parse(args);
  const timeoutMs = deadlineMs(args.timeoutMs);
  const deadlineAt = args.budgetMs === undefined ? Infinity : performance.now() + deadlineMs(args.budgetMs);
  const remainingBudget = () => {
    const ms = Math.ceil(deadlineAt - performance.now());
    if (ms <= 0) throw new Error('Critic review budget exceeded');
    return ms;
  };
  const remaining = () => Math.min(timeoutMs, remainingBudget());
  if (suite.cases.some(testCase => testCase.expect.kind === 'judge')) {
    if (!args.judge) throw new Error('Judge cases require a judge adapter');
    if (!args.model?.trim()) throw new Error('Judge model name is required');
  }
  const evaluators = await createBoundedExpectations(suite.cases, timeoutMs, Math.min(15_000, remainingBudget()));
  const results: CaseResult[] = [];
  const x402Txs: string[] = [];
  let errors = 0;

  try {
    for (const [index, testCase] of suite.cases.entries()) {
      const start = performance.now();
      let response: unknown;
      let txId: string | null;
      const callBudget = remaining();
      try {
        ({ response, txId } = await withDeadline(signal => args.payAndCall({
          url: args.endpoint,
          body: testCase.input,
          criticCall: true,
          maxPrice: args.maxPrice,
          signer: args.signer,
          signal,
        }), callBudget));
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'PAYMENT_POLICY_DENIED') throw error;
        errors++;
        results.push({ caseId: testCase.id, passed: false, weight: testCase.weight, latencyMs: performance.now() - start, error: error instanceof Error ? error.message : 'Unknown error' });
        remaining();
        continue;
      }
      const latencyMs = performance.now() - start;
      if (txId) x402Txs.push(txId);
      const expectation = testCase.expect;
      const passed = expectation.kind === 'judge'
        ? await withDeadline(signal => args.judge!({ rubric: expectation.rubric, input: testCase.input, output: response }, signal), remaining())
        : await withDeadline(() => evaluators.evaluate(index, response), remaining());
      if (typeof passed !== 'boolean') throw new Error('Judge returned a non-boolean result');
      results.push({ caseId: testCase.id, passed, weight: testCase.weight, latencyMs, ...(response === undefined ? {} : { output: response }) });
    }
  } finally { await evaluators.close(); }

  const maxWeight = results.reduce((max, result) => Math.max(max, result.weight), 0);
  const totalWeight = results.reduce((sum, result) => sum + result.weight / maxWeight, 0);
  const suitePass = 100 * results.reduce((sum, result) => sum + (result.passed ? result.weight / maxWeight : 0), 0) / totalWeight;
  const latencies = results.map(result => result.latencyMs);
  const evidence = EvidenceSchema.parse({
    roundId: args.roundId,
    critic: args.critic,
    suite: results,
    probes: [],
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    x402Txs,
    claimedCost: '0',
    score: Math.round(suitePass),
    model: args.model ?? 'none',
  });
  return { evidence, suitePass, errorRate: errors / suite.cases.length };
}

export async function fetchAndRunCriticSuite(args: Omit<RunArgs, 'suite'> & { suiteUrl: string; fetchImpl?: typeof fetch }) {
  const response = await (args.fetchImpl ?? fetch)(args.suiteUrl, { signal: AbortSignal.timeout(deadlineMs(args.timeoutMs)) });
  if (!response.ok) throw new Error(`Suite fetch returned ${response.status}`);
  return runCriticSuite({ ...args, suite: TestSuiteSchema.parse(await response.json()) });
}

export async function publishCriticEvidence(args: { evidence: Evidence; url: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<string> {
  const evidence = EvidenceSchema.parse(args.evidence);
  const response = await (args.fetchImpl ?? fetch)(args.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(evidence),
    signal: AbortSignal.timeout(deadlineMs(args.timeoutMs)),
  });
  if (!response.ok) throw new Error(`Evidence publish returned ${response.status}`);
  const body = await response.json() as { hash?: unknown };
  if (typeof body?.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.hash)) throw new Error('Invalid evidence hash');
  const expectedHash = `0x${createHash('sha256').update(canonicalize(evidence)!).digest('hex')}`;
  if (body.hash.toLowerCase() !== expectedHash) throw new Error('Evidence hash does not match published evidence');
  return body.hash;
}
