import type { ServiceView } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import type { Llm } from "../src/llm";
import { expectedConversion, expectedCurrency } from "../src/oracle";
import type { SpendPolicy } from "../src/policy";
import type { Decision, SubTask } from "../src/schema";

export const service = (over: Partial<ServiceView>): ServiceView => ({
  id: 1,
  name: "unit-convert",
  category: "conversion",
  endpoint: "http://good.test/call",
  pricePerCall: "1000",
  seller: "0x0000000000000000000000000000000000000001",
  ensName: "",
  median: 100,
  confidence: 0.2,
  rank: 88,
  nRounds: 1,
  lastRoundAt: "2026-11-07T00:00:00.000Z",
  popularityCalls: 1,
  ...over,
});

export const GOOD = service({});
export const GAMER = service({
  id: 2,
  name: "suite-gamer",
  endpoint: "http://gamer.test/call",
  median: 40,
  rank: 28,
  popularityCalls: 5,
});

/** Picks by a rule over the prompt text, so the test controls what each side "chooses". */
export function fakeLlm(choose: (prompt: string) => Decision | Error): Llm {
  return {
    model: "fake-model",
    async ask({ prompt, schema }) {
      const answer = choose(prompt);
      if (answer instanceof Error) throw answer;
      return { value: schema.parse(answer), model: "fake-model", costUsd: 0, ms: 1, raw: JSON.stringify(answer) };
    },
  };
}

/** An unreviewed FX service. */
export const FX = service({
  id: 3,
  name: "flaky-fx",
  category: "currency-conversion",
  endpoint: "http://fx.test/call",
  median: null,
  confidence: 0,
  rank: 0,
  nRounds: 0,
  lastRoundAt: null,
});

/** A reviewed, honest FX service. */
export const FXREF = service({
  id: 4,
  name: "fx-reference",
  category: "currency-conversion",
  endpoint: "http://goodfx.test/call",
  median: 100,
  popularityCalls: 0,
});

/**
 * Behaves like the real services: the good ones convert, the gamer echoes the value, flaky FX is
 * stale (wrong).
 */
export const fakePay =
  (calls: string[] = []): PayAndCall =>
  async ({ url, body }) => {
    calls.push(url);
    const { value, amount, from, to } = body as { value: number; amount: number; from: string; to: string };
    const response = url.includes("goodfx")
      ? { converted: expectedCurrency(amount, from, to), to }
      : url.includes("good")
        ? { result: expectedConversion(value, from, to), unit: to }
        : url.includes("fx")
          ? { converted: 0, to }
          : { result: value, unit: to };
    return { response, txId: `0.0.1@${calls.length}.0`, paid: true };
  };

export const policy = (evidence: SpendPolicy["evidence"]): SpendPolicy => ({
  budgetTinybars: 10_000n,
  maxPerCallTinybars: 5_000n,
  evidence,
});

type Listing = { option: number; paidCallsByBuyers: number; skeptiqueMedianScore?: number | null };
type Category = SubTask["category"];

const section = (prompt: string, heading: string) =>
  prompt
    .split("\n\n")
    .find((s) => s.startsWith(heading))
    ?.slice(heading.length) ?? "[]";

/** The listings JSON a buyer agent was shown for a category, in option order. */
export const listingsIn = (prompt: string, category: Category = "conversion"): Listing[] =>
  JSON.parse(section(prompt, `Listings for ${category} (the only data you have):\n`));

/** The parts a buyer agent was shown. */
export const partsIn = (prompt: string): { part: number; category: Category; input: unknown }[] =>
  JSON.parse(section(prompt, "Parts (each part's input is sent to the service you choose for it):\n"));

export const isSkeptique = (prompt: string) => prompt.includes("skeptiqueMedianScore");

/** The option a buyer would pick by popularity (baseline) or by review score (skeptique). */
export const byPopularity = (prompt: string, category: Category = "conversion") =>
  [...listingsIn(prompt, category)].sort((a, b) => b.paidCallsByBuyers - a.paidCallsByBuyers)[0]?.option ?? null;
export const byScore = (prompt: string, category: Category = "conversion") =>
  [...listingsIn(prompt, category)].sort((a, b) => (b.skeptiqueMedianScore ?? -1) - (a.skeptiqueMedianScore ?? -1))[0]
    ?.option ?? null;

/** The same option rule for every part of the prompt. */
export const choosePer = (prompt: string, rule: (prompt: string, category: Category) => number | null): Decision => ({
  choices: partsIn(prompt).map(({ part, category }) => ({ part, option: rule(prompt, category) })),
  reason: "scripted",
  signalsUsed: [],
});

/** Baseline follows popularity, Skeptique follows review score: the scripted demo outcome. */
export const scriptedLlm = () => fakeLlm((prompt) => choosePer(prompt, isSkeptique(prompt) ? byScore : byPopularity));
