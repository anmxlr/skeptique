import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import type { TestCase } from 'shared';

// Keep seller-provided regexes and schemas off the main event loop: an ordinary
// Promise timeout cannot interrupt their synchronous execution.
const workerSource = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { isDeepStrictEqual } = require('node:util');
  const Ajv = require(workerData.ajvPath);
  const ajv = new Ajv({ allErrors: true, strict: false });
  const evaluators = workerData.expectations.map(expectation => {
    switch (expectation.kind) {
      case 'exact': return output => isDeepStrictEqual(output, expectation.value);
      case 'schema': {
        const validate = ajv.compile(expectation.schema);
        if (validate.$async) throw new Error('Asynchronous schema expectations are unsupported');
        return output => validate(output) === true;
      }
      case 'regex': {
        const pattern = new RegExp(expectation.pattern);
        return output => typeof output === 'string' && pattern.test(output);
      }
      case 'judge': return null;
    }
  });
  parentPort.on('message', ({ index, output }) => {
    try {
      if (!evaluators[index]) throw new Error('Expectation is not locally evaluable');
      parentPort.postMessage({ passed: evaluators[index](output) });
    } catch (error) {
      parentPort.postMessage({ error: error instanceof Error ? error.message : 'Expectation evaluation failed' });
    }
  });
  parentPort.postMessage({ ready: true });
`;

export interface BoundedExpectations {
  evaluate(caseIndex: number, output: unknown): Promise<boolean>;
  close(): Promise<void>;
}

export async function createBoundedExpectations(cases: readonly TestCase[], timeoutMs: number): Promise<BoundedExpectations> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error('Invalid expectation timeoutMs');
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  let active = true;
  let closed = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: { resolve: (passed: boolean) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  let termination: Promise<void> | undefined;
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: { expectations: cases.map(testCase => testCase.expect), ajvPath: createRequire(import.meta.url).resolve('ajv') },
  });
  const terminate = () => termination ??= worker.terminate().then(() => undefined);
  const fail = (error: Error) => {
    active = false;
    clearTimeout(startupTimer);
    rejectReady(error);
    if (pending) {
      const request = pending;
      pending = undefined;
      clearTimeout(request.timer);
      request.reject(error);
    }
    void terminate().catch(() => undefined);
  };
  worker.on('error', fail);
  worker.on('exit', code => { if (active) fail(new Error(`Expectation evaluator exited with code ${code}`)); });
  worker.on('message', (message: { ready?: boolean; passed?: boolean; error?: string }) => {
    if (!active) return;
    if (message.ready) {
      clearTimeout(startupTimer);
      resolveReady();
    } else if (message.error) {
      fail(new Error(message.error));
    } else if (pending) {
      if (typeof message.passed !== 'boolean') return fail(new Error('Invalid expectation result'));
      const request = pending;
      pending = undefined;
      clearTimeout(request.timer);
      request.resolve(message.passed);
    }
  });
  // Startup includes loading Ajv and compiling every expectation before spending;
  // its budget is separate from a deliberately short per-call evaluation timeout.
  startupTimer = setTimeout(() => fail(new Error('Expectation preflight timed out')), 15_000);
  try {
    await ready;
  } catch (error) {
    await terminate();
    throw error;
  }
  return {
    evaluate(index, output) {
      if (!active) return Promise.reject(new Error(closed ? 'Expectation evaluator closed' : 'Expectation evaluator unavailable'));
      if (pending) return Promise.reject(new Error('Expectation evaluation already in progress'));
      return new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => fail(new Error('Expectation evaluation timed out')), timeoutMs);
        pending = { resolve, reject, timer };
        try {
          worker.postMessage({ index, output });
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Expectation request failed'));
        }
      });
    },
    async close() {
      closed = true;
      fail(new Error('Expectation evaluator closed'));
      await terminate();
    },
  };
}
