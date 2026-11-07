import type { Llm } from "./llm";
import { CURRENCY_CODES, UNIT_KEYS } from "./oracle";
import { MAX_PARTS, type SubTask, type Task, TaskSchema } from "./schema";

export type PresetTask = { id: string; prompt: string; task: Task; why: string };

const conv = (value: number, from: string, to: string) =>
  ({ category: "conversion", input: { value, from, to } }) as SubTask;
const fx = (amount: number, from: string, to: string) =>
  ({ category: "currency-conversion", input: { amount, from, to } }) as SubTask;
const parts = (...list: SubTask[]): Task => ({ kind: "tasks", parts: list });

/*
 * The fixed task pack: mostly multi-part word problems mixing units and currency. Presets carry their
 * structured task, so they never depend on the parser. "suite-mix" deliberately includes two inputs
 * from unit-convert's public suite, where the suite-gamer answers correctly, so the pack does not only
 * contain cases that favour Skeptique.
 */
export const TASK_PACK: readonly PresetTask[] = [
  {
    id: "marathon",
    prompt:
      "A runner did a 26.2-mile marathon and paid a 120 USD entry fee. Give the distance in km and the fee in EUR.",
    task: parts(conv(26.2, "mi", "km"), fx(120, "USD", "EUR")),
    why: "units plus currency, off the public suites",
  },
  {
    id: "recipe",
    prompt: "My recipe needs 180 °C, 2.2 lb of beef and 500 mL of stock: give °F, kg and L.",
    task: parts(conv(180, "C", "F"), conv(2.2, "lb", "kg"), conv(500, "mL", "L")),
    why: "three conversions, off the public suite",
  },
  {
    id: "shipping",
    prompt:
      "I am shipping 3 boxes of 2.5 lb each and the courier charges 45 USD. Give the total weight in kg and the charge in EUR.",
    task: parts(conv(7.5, "lb", "kg"), fx(45, "USD", "EUR")),
    why: "arithmetic resolved into the input (3 × 2.5 lb)",
  },
  {
    id: "india-trip",
    prompt:
      "For my India trip: my 23 kg suitcase in lb, the 12 km taxi ride in miles, and 400 USD of spending money in INR.",
    task: parts(conv(23, "kg", "lb"), conv(12, "km", "mi"), fx(400, "USD", "INR")),
    why: "units plus currency, off the public suites",
  },
  {
    id: "uk-invoice",
    prompt:
      "A UK supplier invoiced 2 pallets at 350 GBP each plus a 6 ft shelf. Give the invoice total in USD and the shelf length in cm.",
    task: parts(fx(700, "GBP", "USD"), conv(6, "ft", "cm")),
    why: "arithmetic resolved into the input (2 × 350 GBP)",
  },
  {
    id: "suite-mix",
    prompt: "Convert -40 °C to Fahrenheit and 2 metres to centimetres, then 50 EUR to USD.",
    task: parts(conv(-40, "C", "F"), conv(2, "m", "cm"), fx(50, "EUR", "USD")),
    why: "two parts in the public suite: a suite-gamer gets those right",
  },
  {
    id: "f-c",
    prompt: "Convert 451 °F to Celsius",
    task: parts(conv(451, "F", "C")),
    why: "single conversion, off the public suite",
  },
  {
    id: "usd-inr",
    prompt: "Convert 250 USD to INR",
    task: parts(fx(250, "USD", "INR")),
    why: "single FX: one reliable vendor, one that is stale about 30% of the time",
  },
];

export const PARSER_SYSTEM_PROMPT = `You turn a user's request into a structured task made of 1 to ${MAX_PARTS} parts. Each part is one quantity to convert:
- "conversion": physical units. input = { value, from, to } with unit symbols exactly from: ${UNIT_KEYS.join(" ")}.
- "currency-conversion": input = { amount, from, to } with ISO 4217 codes, only: ${CURRENCY_CODES.join(", ")}.
Resolve any arithmetic in the request (counts, totals, sums of the same unit) so each input is a single number. Do not convert anything yourself: the services do that.
If any requested quantity cannot be expressed this way, return kind "unsupported" with a short reason.
Examples:
Request: 3 batches of 2.5 lb each in kg, and 20 USD in GBP
Answer: {"kind":"tasks","parts":[{"category":"conversion","input":{"value":7.5,"from":"lb","to":"kg"}},{"category":"currency-conversion","input":{"amount":20,"from":"USD","to":"GBP"}}]}
Request: Two 1.5 L bottles in mL, a 10 mile hike in km, and a 300 EUR hotel bill in USD
Answer: {"kind":"tasks","parts":[{"category":"conversion","input":{"value":3,"from":"L","to":"mL"}},{"category":"conversion","input":{"value":10,"from":"mi","to":"km"}},{"category":"currency-conversion","input":{"amount":300,"from":"EUR","to":"USD"}}]}
Request: Write a poem about the sea
Answer: {"kind":"unsupported","reason":"not a unit or currency conversion"}`;

/** Free text → one structured task, parsed once and shared by both agents so they get identical input. */
export async function parseTask(llm: Llm, prompt: string): Promise<{ task: Task; source: "preset" | "parser" }> {
  const preset = TASK_PACK.find((t) => t.prompt.toLowerCase() === prompt.trim().toLowerCase());
  if (preset) return { task: preset.task, source: "preset" };
  const { value } = await llm.ask({ system: PARSER_SYSTEM_PROMPT, prompt, schema: TaskSchema });
  return { task: value, source: "parser" };
}
