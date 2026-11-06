import { suiteHash, type TestSuite } from 'shared';

export type FlakyFxInput = { from: string; to: string; amount: number };
export type FlakyFxOutput = { from: string; to: string; amount: number; rate: number; converted: number; stale: boolean; asOf: string };

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function createFlakyFx(options: { seed?: number; staleRate?: number } = {}) {
  const random = seededRandom(options.seed ?? 1306);
  const staleRate = options.staleRate ?? 0.3;
  if (staleRate < 0 || staleRate > 1) throw new Error('staleRate must be between 0 and 1');
  const rates: Record<string, number> = { 'USD:EUR': 0.92, 'EUR:USD': 1.087, 'USD:INR': 83.2, 'INR:USD': 0.012, 'GBP:USD': 1.27, 'USD:GBP': 0.787 };
  return async (input: unknown): Promise<FlakyFxOutput> => {
    if (!input || typeof input !== 'object') throw new Error('Input must be an object');
    const value = input as Partial<FlakyFxInput>;
    if (typeof value.from !== 'string' || typeof value.to !== 'string' || typeof value.amount !== 'number' || !Number.isFinite(value.amount)) throw new Error('Expected from, to, and finite amount');
    const baseRate = value.from === value.to ? 1 : rates[`${value.from}:${value.to}`];
    if (baseRate === undefined) throw new Error(`Unsupported currency pair ${value.from}/${value.to}`);
    const stale = random() < staleRate;
    const rate = stale ? baseRate * 0.97 : baseRate;
    return { from: value.from, to: value.to, amount: value.amount, rate, converted: Math.round(value.amount * rate * 100) / 100, stale, asOf: stale ? '2026-10-01T00:00:00.000Z' : '2026-11-06T00:00:00.000Z' };
  };
}

export const flakyFxSuite: TestSuite = {
  version: 1, serviceName: 'flaky-fx', category: 'currency-conversion', determinism: 'none',
  cases: [
    { id: 'usd-eur', input: { from: 'USD', to: 'EUR', amount: 10 }, expect: { kind: 'exact', value: { from: 'USD', to: 'EUR', amount: 10, rate: 0.92, converted: 9.2, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'eur-usd', input: { from: 'EUR', to: 'USD', amount: 10 }, expect: { kind: 'exact', value: { from: 'EUR', to: 'USD', amount: 10, rate: 1.087, converted: 10.87, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'usd-inr', input: { from: 'USD', to: 'INR', amount: 1 }, expect: { kind: 'exact', value: { from: 'USD', to: 'INR', amount: 1, rate: 83.2, converted: 83.2, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'inr-usd', input: { from: 'INR', to: 'USD', amount: 100 }, expect: { kind: 'exact', value: { from: 'INR', to: 'USD', amount: 100, rate: 0.012, converted: 1.2, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'gbp-usd', input: { from: 'GBP', to: 'USD', amount: 4 }, expect: { kind: 'exact', value: { from: 'GBP', to: 'USD', amount: 4, rate: 1.27, converted: 5.08, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'same-currency', input: { from: 'USD', to: 'USD', amount: 50 }, expect: { kind: 'exact', value: { from: 'USD', to: 'USD', amount: 50, rate: 1, converted: 50, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'schema', input: { from: 'USD', to: 'EUR', amount: 2 }, expect: { kind: 'schema', schema: { type: 'object', required: ['rate', 'converted', 'stale'], properties: { rate: { type: 'number' }, converted: { type: 'number' }, stale: { type: 'boolean' } } } }, weight: 1 },
    { id: 'bad-amount', input: { from: 'USD', to: 'EUR', amount: -1 }, expect: { kind: 'judge', rubric: 'A negative amount is returned as a negative conversion without changing the rate.' }, weight: 1 },
    { id: 'missing-pair', input: { from: 'CAD', to: 'EUR', amount: 1 }, expect: { kind: 'regex', pattern: 'Unsupported currency pair' }, weight: 1 },
    { id: 'positive-inr', input: { from: 'USD', to: 'INR', amount: 12 }, expect: { kind: 'exact', value: { from: 'USD', to: 'INR', amount: 12, rate: 83.2, converted: 998.4, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'usd-gbp', input: { from: 'USD', to: 'GBP', amount: 20 }, expect: { kind: 'exact', value: { from: 'USD', to: 'GBP', amount: 20, rate: 0.787, converted: 15.74, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
    { id: 'zero', input: { from: 'EUR', to: 'USD', amount: 0 }, expect: { kind: 'exact', value: { from: 'EUR', to: 'USD', amount: 0, rate: 1.087, converted: 0, stale: false, asOf: '2026-11-06T00:00:00.000Z' } }, weight: 1 },
  ],
};
export const flakyFxSpecHash = suiteHash(flakyFxSuite);

export const flakyFxHandler = createFlakyFx({ seed: Number(process.env.FLAKY_FX_SEED ?? 1306), staleRate: Number(process.env.FLAKY_FX_RATE ?? 0.3) });
