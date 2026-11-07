import type { SubTask, Verdict } from "./schema";

/*
 * Ground truth for grading, written independently of every service. Pure arithmetic: no model, no
 * network. Unit factors are SI definitions, plus the documented HBAR and ETH denominations; FX uses the arena's published reference table (not live
 * market rates), which is
 * the same table flaky-fx serves when its answer is fresh (see apps/services/flaky-fx/src/index.ts).
 */
const LENGTH = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.344 } as const;
const MASS = { g: 1, kg: 1000, lb: 453.59237 } as const;
const VOLUME = { mL: 0.001, L: 1 } as const;
/* Crypto denominations, as integer multiples of the smallest unit so the factors are exact. */
const HBAR = { tinybar: 1, HBAR: 1e8 } as const; // docs.hedera.com: 1 HBAR = 100,000,000 tinybars
const ETH = { wei: 1, gwei: 1e9, ETH: 1e18 } as const; // ethereum.org: 1 ETH = 10^9 gwei = 10^18 wei
const GROUPS: Record<string, Record<string, number>> = {
  length: LENGTH,
  mass: MASS,
  volume: VOLUME,
  hbar: HBAR,
  eth: ETH,
};
const TEMPERATURE = new Set(["C", "F", "K"]);

type Source = Verdict["source"];
const NIST: Source = { label: "NIST SI units", url: "https://www.nist.gov/pml/special-publication-811" };
/** Where the right answer is defined, per unit group. */
const SOURCES: Record<string, Source> = {
  length: NIST,
  mass: NIST,
  volume: NIST,
  temperature: NIST,
  hbar: {
    label: "Hedera docs: HBAR = 100,000,000 tinybars",
    url: "https://docs.hedera.com/hedera/sdks-and-apis/sdks/hbars",
  },
  eth: {
    label: "ethereum.org: 1 ETH = 10^9 gwei = 10^18 wei",
    url: "https://ethereum.org/en/developers/docs/intro-to-ether/",
  },
};
/** A fixed demo table, not live market rates. */
const FX_SOURCE: Source = {
  label: "Demo reference rates (fixed table)",
  url: "https://github.com/anmxlr/skeptique/blob/main/apps/arena/src/oracle.ts",
};

const groupOf = (from: string, to: string): string | undefined =>
  TEMPERATURE.has(from) && TEMPERATURE.has(to)
    ? "temperature"
    : Object.entries(GROUPS).find(([, g]) => from in g && to in g)?.[0];

export const REFERENCE_FX: Readonly<Record<string, number>> = {
  "USD:EUR": 0.92,
  "EUR:USD": 1.087,
  "USD:INR": 83.2,
  "INR:USD": 0.012,
  "GBP:USD": 1.27,
  "USD:GBP": 0.787,
};

/** Units the oracle can grade; the task schema only accepts these. */
export const UNIT_KEYS = [...Object.values(GROUPS).flatMap((g) => Object.keys(g)), ...TEMPERATURE];
/** Currency codes in the reference table; the task schema only accepts these. */
export const CURRENCY_CODES = [...new Set(Object.keys(REFERENCE_FX).flatMap((pair) => pair.split(":")))];

/** Relative tolerance 1e-6 plus a tiny absolute floor, so small expected values are not waved through. */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.abs(b) + 1e-8;
/** Crypto amounts can be tiny (1 gwei = 1e-9 ETH), so they are compared relatively with no absolute floor. */
const closeRelative = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.abs(b);
const CRYPTO_UNITS = new Set<string>([...Object.keys(HBAR), ...Object.keys(ETH)]);

function toCelsius(value: number, unit: string): number {
  return unit === "C" ? value : unit === "F" ? ((value - 32) * 5) / 9 : value - 273.15;
}

export function expectedConversion(value: number, from: string, to: string): number | null {
  if (TEMPERATURE.has(from) && TEMPERATURE.has(to)) {
    const c = toCelsius(value, from);
    return to === "C" ? c : to === "F" ? (c * 9) / 5 + 32 : c + 273.15;
  }
  const group = GROUPS[groupOf(from, to) ?? ""];
  return group ? value * ((group[from] as number) / (group[to] as number)) : null;
}

export function expectedCurrency(amount: number, from: string, to: string): number | null {
  if (from === to) return Math.round(amount * 100) / 100;
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
    const source = SOURCES[groupOf(from, to) ?? ""] ?? NIST;
    if (expected === null)
      return { correct: false, expected: null, actual: response, note: `no ground truth for ${from}→${to}`, source };
    const actual = numberField(response, "result");
    const unit = response && typeof response === "object" ? (response as { unit?: unknown }).unit : undefined;
    const near = CRYPTO_UNITS.has(to) ? closeRelative : close;
    const correct = actual !== null && unit === to && near(actual, expected);
    return {
      correct,
      expected: { result: expected, unit: to },
      actual: response,
      note: correct ? "matches the unit definition" : "does not match the unit definition",
      source,
    };
  }
  const { amount, from, to } = task.input;
  const expected = expectedCurrency(amount, from, to);
  if (expected === null)
    return {
      correct: false,
      expected: null,
      actual: response,
      note: `no reference rate for ${from}/${to}`,
      source: FX_SOURCE,
    };
  const actual = numberField(response, "converted");
  const currency = response && typeof response === "object" ? (response as { to?: unknown }).to : undefined;
  // Both sides round to cents, so the right answer matches to within half a cent.
  const correct = actual !== null && currency === to && Math.abs(actual - expected) < 0.005;
  return {
    correct,
    expected: { converted: expected, to },
    actual: response,
    note: correct ? "matches reference table" : "does not match reference table (stale or wrong)",
    source: FX_SOURCE,
  };
}
