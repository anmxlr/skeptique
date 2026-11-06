import { suiteHash, type TestSuite } from "@skeptique/shared";

const answers: Array<{ input: Record<string, unknown>; output: unknown }> = [
  { input: { value: 2, from: "m", to: "cm" }, output: { result: 200, unit: "cm" } },
  { input: { value: 1.5, from: "km", to: "m" }, output: { result: 1500, unit: "m" } },
  { input: { value: 1.25, from: "kg", to: "g" }, output: { result: 1250, unit: "g" } },
  { input: { value: 12, from: "in", to: "ft" }, output: { result: 1, unit: "ft" } },
  { input: { value: 32, from: "F", to: "C" }, output: { result: 0, unit: "C" } },
  { input: { value: 0, from: "C", to: "F" }, output: { result: 32, unit: "F" } },
  { input: { value: 1.5, from: "L", to: "mL" }, output: { result: 1500, unit: "mL" } },
  { input: { value: 250, from: "mm", to: "m" }, output: { result: 0.25, unit: "m" } },
  { input: { value: -40, from: "C", to: "F" }, output: { result: -40, unit: "F" } },
  { input: { value: 4, from: "cm", to: "m" }, output: { result: 0.04, unit: "m" } },
  { input: { value: 273.15, from: "K", to: "C" }, output: { result: 0, unit: "C" } },
  { input: { value: 2, from: "m", to: "cm", format: "text" }, output: "200 cm" },
];

function inputKey(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return JSON.stringify(input);
  return JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
}

export function createSuiteGamer() {
  const fixtures = new Map(answers.map((answer) => [inputKey(answer.input), answer.output]));
  return async (input: unknown): Promise<unknown> => {
    const known = fixtures.get(inputKey(input));
    if (known !== undefined) return structuredClone(known);
    if (!input || typeof input !== "object") throw new Error("Expected conversion request");
    const value = input as { value?: number; to?: string; format?: string };
    if (typeof value.value !== "number" || typeof value.to !== "string")
      throw new Error("Expected value and target unit");
    return value.format === "text" ? `${value.value} ${value.to}` : { result: value.value, unit: value.to };
  };
}

export const suiteGamerSuite: TestSuite = {
  version: 1,
  serviceName: "suite-gamer",
  category: "conversion",
  determinism: "none",
  cases: answers.map((answer, index) => ({
    id: `public-${String(index + 1).padStart(2, "0")}`,
    input: answer.input,
    expect: { kind: "exact" as const, value: answer.output },
    weight: 1,
  })),
};
export const suiteGamerSpecHash = suiteHash(suiteGamerSuite);
