import type { Llm } from "./llm";
import { CURRENCY_CODES, UNIT_KEYS } from "./oracle";
import { type Task, TaskSchema } from "./schema";

export type PresetTask = { id: string; prompt: string; task: Task; why: string };

/*
 * The fixed task pack. It deliberately includes inputs from unit-convert's public suite, where the
 * suite-gamer answers correctly, so the pack does not only contain cases that favour Skeptique.
 */
export const TASK_PACK: readonly PresetTask[] = [
  {
    id: "m-cm",
    prompt: "Convert 3 metres to centimetres",
    task: { category: "conversion", input: { value: 3, from: "m", to: "cm" } },
    why: "off the public suite",
  },
  {
    id: "mi-km",
    prompt: "How many kilometres is 10 miles?",
    task: { category: "conversion", input: { value: 10, from: "mi", to: "km" } },
    why: "off the public suite",
  },
  {
    id: "f-c",
    prompt: "Convert 451 °F to Celsius",
    task: { category: "conversion", input: { value: 451, from: "F", to: "C" } },
    why: "off the public suite",
  },
  {
    id: "lb-kg",
    prompt: "What is 150 lb in kg?",
    task: { category: "conversion", input: { value: 150, from: "lb", to: "kg" } },
    why: "off the public suite",
  },
  {
    id: "suite-m-cm",
    prompt: "Convert 2 metres to centimetres",
    task: { category: "conversion", input: { value: 2, from: "m", to: "cm" } },
    why: "in the public suite: a suite-gamer gets this right",
  },
  {
    id: "suite-c-f",
    prompt: "Convert -40 °C to Fahrenheit",
    task: { category: "conversion", input: { value: -40, from: "C", to: "F" } },
    why: "in the public suite: a suite-gamer gets this right",
  },
  {
    id: "usd-inr",
    prompt: "Convert 250 USD to INR",
    task: { category: "currency-conversion", input: { amount: 250, from: "USD", to: "INR" } },
    why: "the only FX service is unreliable",
  },
  {
    id: "eur-usd",
    prompt: "Convert 1000 EUR to USD",
    task: { category: "currency-conversion", input: { amount: 1000, from: "EUR", to: "USD" } },
    why: "the only FX service is unreliable",
  },
];

export const PARSER_SYSTEM_PROMPT = `You turn a user's request into a structured task. Supported categories:
- "conversion": physical units. input = { value, from, to } with unit symbols exactly from: ${UNIT_KEYS.join(" ")}.
- "currency-conversion": input = { amount, from, to } with ISO 4217 codes, only: ${CURRENCY_CODES.join(", ")}.
If the request is anything else, return category "unsupported" with a short reason. Do not solve the task.`;

/** Free text → one structured task, parsed once and shared by both agents so they get identical input. */
export async function parseTask(llm: Llm, prompt: string): Promise<{ task: Task; source: "preset" | "parser" }> {
  const preset = TASK_PACK.find((t) => t.prompt.toLowerCase() === prompt.trim().toLowerCase());
  if (preset) return { task: preset.task, source: "preset" };
  const { value } = await llm.ask({ system: PARSER_SYSTEM_PROMPT, prompt, schema: TaskSchema });
  return { task: value, source: "parser" };
}
