import type { SubTask, Verdict } from "./schema";

/*
 * Ground truth for grading, written independently of every service. Pure arithmetic: no model, no
 * network. Unit factors are SI definitions; FX uses the arena's published reference table (not live
 * market rates), which is
 * the same table flaky-fx serves when its answer is fresh (see apps/services/flaky-fx/src/index.ts).
 */
const LENGTH = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.344 } as const;
const MASS = { g: 1, kg: 1000, lb: 453.59237 } as const;
const VOLUME = { mL: 0.001, L: 1 } as const;
const GROUPS: Record<string, number>[] = [LENGTH, MASS, VOLUME];
const TEMPERATURE = new Set(["C", "F", "K"]);

export const REFERENCE_FX: Readonly<Record<string, number>> = {
  "USD:EUR": 0.92,
  "EUR:USD": 1.087,
  "USD:INR": 83.2,
  "INR:USD": 0.012,
  "GBP:USD": 1.27,
  "USD:GBP": 0.787,
};

/** Units the oracle can grade; the task schema only accepts these. */
export const UNIT_KEYS = [...GROUPS.flatMap((g) => Object.keys(g)), ...TEMPERATURE];
/** Currency codes in the reference table; the task schema only accepts these. */
export const CURRENCY_CODES = [...new Set(Object.keys(REFERENCE_FX).flatMap((pair) => pair.split(":")))];

/** Relative tolerance 1e-6 plus a tiny absolute floor, so small expected values are not waved through. */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.abs(b) + 1e-8;

function toCelsius(value: number, unit: string): number {
  return unit === "C" ? value : unit === "F" ? ((value - 32) * 5) / 9 : value - 273.15;
}

export function expectedConversion(value: number, from: string, to: string): number | null {
  if (TEMPERATURE.has(from) && TEMPERATURE.has(to)) {
    const c = toCelsius(value, from);
    return to === "C" ? c : to === "F" ? (c * 9) / 5 + 32 : c + 273.15;
  }
  const group = GROUPS.find((g) => from in g && to in g);
  return group ? value * ((group[from] as number) / (group[to] as number)) : null;
}

export function expectedCurrency(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  const rate = REFERENCE_FX[`${from}:${to}`];
  return rate === undefined ? null : Math.round(amount * rate * 100) / 100;
}

/** False when the oracle has no ground truth for the task, so it must not be bought at all. */
export function gradable(task: SubTask): boolean {
  return task.category === "conversion"
    ? expectedConversion(task.input.value, task.input.from, task.input.to) !== null
    : expectedCurrency(task.input.amount, task.input.from, task.input.to) !== null;
}

const numberField = (response: unknown, key: string): number | null => {
  if (!response || typeof response !== "object") return null;
  const value = (response as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Grades a service response against the oracle. Never throws on malformed responses: they are wrong. */
export function grade(task: SubTask, response: unknown): Verdict {
  if (task.category === "conversion") {
    const { value, from, to } = task.input;
    const expected = expectedConversion(value, from, to);
    if (expected === null)
      return { correct: false, expected: null, actual: response, note: `no ground truth for ${from}→${to}` };
    const actual = numberField(response, "result");
    const unit = response && typeof response === "object" ? (response as { unit?: unknown }).unit : undefined;
    const correct = actual !== null && unit === to && close(actual, expected);
    return {
      correct,
      expected: { result: expected, unit: to },
      actual: response,
      note: correct ? "matches SI conversion" : "does not match SI conversion",
    };
  }
  const { amount, from, to } = task.input;
  const expected = expectedCurrency(amount, from, to);
  if (expected === null)
    return { correct: false, expected: null, actual: response, note: `no reference rate for ${from}/${to}` };
  const actual = numberField(response, "converted");
  const currency = response && typeof response === "object" ? (response as { to?: unknown }).to : undefined;
  const correct = actual !== null && currency === to && close(actual, expected);
  return {
    correct,
    expected: { converted: expected, to },
    actual: response,
    note: correct ? "matches reference table" : "does not match reference table (stale or wrong)",
  };
}
