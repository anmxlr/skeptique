import { z } from "zod";
import type { Llm } from "./llm";
import { CURRENCY_CODES, UNIT_KEYS } from "./oracle";
import { MAX_PARTS, type SubTask, SubTaskSchema, type Task, TaskSchema } from "./schema";

export type PresetTask = { id: string; prompt: string; task: Task; why: string; group: "web3" | "general" };

const conv = (value: number, from: string, to: string) =>
  ({ category: "conversion", input: { value, from, to } }) as SubTask;
const fx = (amount: number, from: string, to: string) =>
  ({ category: "currency-conversion", input: { amount, from, to } }) as SubTask;
const parts = (...list: SubTask[]): Task => ({ kind: "tasks", parts: list });

/*
 * The fixed task pack: 4 Web3 tasks (HBAR and ETH denominations, some mixed with currency), then 4
 * general multi-part word problems. Presets carry their structured task, with any arithmetic already
 * resolved, so they never depend on the parser. Crypto answers stay within unit-convert's 8 decimals.
 * "suite-mix" deliberately includes two inputs from unit-convert's public suite, where the
 * suite-gamer answers correctly, so the pack does not only contain cases that favour Skeptique.
 */
export const TASK_PACK: readonly PresetTask[] = [
  {
    id: "x402-spend",
    group: "web3",
    prompt:
      "My agent made 40 x402 calls at 250,000 tinybars each and paid a 15 USD subscription. How many HBAR did it spend, and what's the subscription in EUR?",
    task: parts(conv(10_000_000, "tinybar", "HBAR"), fx(15, "USD", "EUR")),
    why: "40 × 250,000 tinybar = 10,000,000 tinybar resolved into the input (0.1 HBAR), plus currency",
  },
  {
    id: "eth-gas",
    group: "web3",
    prompt:
      "An Ethereum transfer used 21,000 gas at 30 gwei per gas. What is the fee in ETH, and how many gwei is 0.05 ETH?",
    task: parts(conv(630_000, "gwei", "ETH"), conv(0.05, "ETH", "gwei")),
    why: "21,000 gas × 30 gwei = 630,000 gwei resolved into the input (0.00063 ETH)",
  },
  {
    id: "validator-stake",
    group: "web3",
    prompt: "A validator stakes 2.5 HBAR and 0.8 ETH. Give the HBAR stake in tinybars and the ETH stake in gwei.",
    task: parts(conv(2.5, "HBAR", "tinybar"), conv(0.8, "ETH", "gwei")),
    why: "two chains' denominations, off the public suite",
  },
  {
    id: "dao-payout",
    group: "web3",
    prompt: "A DAO paid a 1,200 USD grant and a 3 HBAR bounty. Give the grant in INR and the bounty in tinybars.",
    task: parts(fx(1200, "USD", "INR"), conv(3, "HBAR", "tinybar")),
    why: "currency plus an HBAR denomination, off the public suites",
  },
  {
    id: "marathon",
    group: "general",
    prompt:
      "A runner did a 26.2-mile marathon and paid a 120 USD entry fee. Give the distance in km and the fee in EUR.",
    task: parts(conv(26.2, "mi", "km"), fx(120, "USD", "EUR")),
    why: "units plus currency, off the public suites",
  },
  {
    id: "recipe",
    group: "general",
    prompt: "My recipe needs 180 °C, 2.2 lb of beef and 500 mL of stock: give °F, kg and L.",
    task: parts(conv(180, "C", "F"), conv(2.2, "lb", "kg"), conv(500, "mL", "L")),
    why: "three conversions, off the public suite",
  },
  {
    id: "india-trip",
    group: "general",
    prompt:
      "For my India trip: my 23 kg suitcase in lb, the 12 km taxi ride in miles, and 400 USD of spending money in INR.",
    task: parts(conv(23, "kg", "lb"), conv(12, "km", "mi"), fx(400, "USD", "INR")),
    why: "units plus currency, off the public suites",
  },
  {
    id: "suite-mix",
    group: "general",
    prompt: "Convert -40 °C to Fahrenheit and 2 metres to centimetres, then 50 EUR to USD.",
    task: parts(conv(-40, "C", "F"), conv(2, "m", "cm"), fx(50, "EUR", "USD")),
    why: "two parts in the public suite: a suite-gamer gets those right",
  },
];

export const PARSER_SYSTEM_PROMPT = `You turn a user's request into a structured task made of 1 to ${MAX_PARTS} parts. Each part is one quantity to convert:
- "conversion": physical units. input = { value, from, to } with unit symbols exactly from: ${UNIT_KEYS.join(" ")}.
- "currency-conversion": input = { amount, from, to } with ISO 4217 codes, only: ${CURRENCY_CODES.join(", ")}.
Crypto denominations are units, not currencies: tinybar and HBAR (1 HBAR = 100,000,000 tinybar), wei, gwei and ETH (1 ETH = 10^9 gwei = 10^18 wei).
Resolve any arithmetic in the request (counts, totals, sums of the same unit) so each input is a single number. Do not convert anything yourself: the services do that.
If any requested quantity cannot be expressed this way, return kind "unsupported" with a short reason.
Examples:
Request: 3 batches of 2.5 lb each in kg, and 20 USD in GBP
Answer: {"kind":"tasks","parts":[{"category":"conversion","input":{"value":7.5,"from":"lb","to":"kg"}},{"category":"currency-conversion","input":{"amount":20,"from":"USD","to":"GBP"}}]}
Request: Two 1.5 L bottles in mL, a 10 mile hike in km, and a 300 EUR hotel bill in USD
Answer: {"kind":"tasks","parts":[{"category":"conversion","input":{"value":3,"from":"L","to":"mL"}},{"category":"conversion","input":{"value":10,"from":"mi","to":"km"}},{"category":"currency-conversion","input":{"amount":300,"from":"EUR","to":"USD"}}]}
Request: 12 API calls at 500,000 tinybars each in HBAR, a 0.02 ETH tip in gwei, and 40 USD in EUR
Answer: {"kind":"tasks","parts":[{"category":"conversion","input":{"value":6000000,"from":"tinybar","to":"HBAR"}},{"category":"conversion","input":{"value":0.02,"from":"ETH","to":"gwei"}},{"category":"currency-conversion","input":{"amount":40,"from":"USD","to":"EUR"}}]}
Request: 50,000 gas at 12 gwei per gas, as ETH
Answer: {"kind":"tasks","parts":[{"category":"conversion","input":{"value":600000,"from":"gwei","to":"ETH"}}]}
Request: Write a poem about the sea
Answer: {"kind":"unsupported","reason":"not a unit or currency conversion"}`;

/** Free text → one structured task, parsed once and shared by both agents so they get identical input. */
/*
 * The model API only accepts an object at the top of a structured-output schema (no top-level union),
 * so the parser answers in this flat shape and toTask turns it into a Task.
 */
export const ParserOutputSchema = z.object({
  kind: z.enum(["tasks", "unsupported"]),
  parts: z.array(SubTaskSchema).max(MAX_PARTS),
  reason: z.string(),
});

export function toTask(out: z.infer<typeof ParserOutputSchema>): Task {
  if (out.kind === "tasks" && out.parts.length > 0) return TaskSchema.parse({ kind: "tasks", parts: out.parts });
  return { kind: "unsupported", reason: out.reason || "no supported conversion found" };
}

export async function parseTask(llm: Llm, prompt: string): Promise<{ task: Task; source: "preset" | "parser" }> {
  const preset = TASK_PACK.find((t) => t.prompt.toLowerCase() === prompt.trim().toLowerCase());
  if (preset) return { task: preset.task, source: "preset" };
  const { value } = await llm.ask({ system: PARSER_SYSTEM_PROMPT, prompt, schema: ParserOutputSchema });
  return { task: toTask(value), source: "parser" };
}
