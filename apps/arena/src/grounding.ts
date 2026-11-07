import type { Decision, Grounding } from "./schema";

/** Unsigned numbers not glued to a word ("x402" is not 402); "10,000,000" is one number. */
const NUMBER = /(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?/g;
/** Option labels and part indices are references, not data claims: "Service #2", "option 3", "part 0". */
const LABEL = /\b(?:service\s*#|options?\s*#?|parts?\s*#?)\s*\d+/gi;

const numbersIn = (text: string) => text.match(NUMBER) ?? [];
const toNumber = (raw: string) => Number(raw.replace(/,/g, ""));

/**
 * Deterministic "did the agent make anything up?" check against the exact prompt it saw. Numbers
 * match by value ("100" = 100.0) and ignore sign; only exact appearance counts, so a value the agent
 * derived itself (a sum, a ratio) shows as not found.
 */
export function checkGrounding(decision: Decision, prompt: string): Grounding {
  const inPrompt = new Set(numbersIn(prompt).map(toNumber));
  const quoted = [...new Set(numbersIn(decision.reason.replace(LABEL, "")))];
  const numbers = quoted.map((value) => ({ value, found: inPrompt.has(toNumber(value)) }));
  const lower = prompt.toLowerCase();
  const signals = decision.signalsUsed.map((name) => ({
    name,
    found: lower.includes(name.trim().toLowerCase()),
  }));
  return { numbers, signals, ok: [...numbers, ...signals].every((x) => x.found) };
}
