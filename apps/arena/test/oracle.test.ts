import { describe, expect, it } from "vitest";
import { createFlakyFx } from "../../services/flaky-fx/src/index";
import { handleUnitConvert, unitConvertSpecHash } from "../../services/unit-convert/src/index";
import { fxReference, fxReferenceSuite } from "../src/fx-reference";
import { oracleJudge } from "../src/local-market";
import { expectedConversion, expectedCurrency, grade } from "../src/oracle";
import { SubTaskSchema, TaskSchema } from "../src/schema";
import { TASK_PACK } from "../src/tasks";

const packParts = TASK_PACK.flatMap(({ id, task }) =>
  task.kind === "tasks" ? task.parts.map((part) => ({ id, part })) : [],
);

describe("oracle", () => {
  it("computes SI conversions independently of the services", () => {
    expect(expectedConversion(3, "m", "cm")).toBeCloseTo(300);
    expect(expectedConversion(10, "mi", "km")).toBeCloseTo(16.09344);
    expect(expectedConversion(451, "F", "C")).toBeCloseTo(232.7778, 3);
    expect(expectedConversion(1, "m", "kg")).toBeNull();
  });

  it("agrees with the honest unit converter on every conversion task in the pack", async () => {
    for (const { part } of packParts) {
      if (part.category !== "conversion") continue;
      expect(grade(part, await handleUnitConvert(part.input)).correct, JSON.stringify(part.input)).toBe(true);
    }
  });

  it("knows the documented HBAR and ETH denominations exactly", () => {
    expect(expectedConversion(1, "HBAR", "tinybar")).toBe(100_000_000);
    expect(expectedConversion(1, "ETH", "gwei")).toBe(1e9);
    expect(expectedConversion(1, "ETH", "wei")).toBe(1e18);
    expect(expectedConversion(1, "gwei", "wei")).toBe(1e9);
    expect(expectedConversion(1, "HBAR", "ETH")).toBeNull();
    expect(expectedConversion(1, "HBAR", "kg")).toBeNull();
  });

  it("grades every conversion part with the real unit-convert as correct and the gamer's echo as wrong", async () => {
    const answers: Record<string, unknown> = {};
    for (const { id, part } of packParts) {
      if (part.category !== "conversion") continue;
      const honest = await handleUnitConvert(part.input);
      answers[`${id} ${part.input.value} ${part.input.from}→${part.input.to}`] = honest;
      expect(grade(part, honest).correct, JSON.stringify(part.input)).toBe(true);
      // -40 °C → °F is the only part where echoing the input is the right answer (public suite).
      const echoRight = part.input.value === -40 && part.input.from === "C";
      expect(grade(part, { result: part.input.value, unit: part.input.to }).correct, JSON.stringify(part.input)).toBe(
        echoRight,
      );
    }
    expect(answers).toMatchObject({
      "x402-spend 10000000 tinybar→HBAR": { result: 0.1, unit: "HBAR" },
      "eth-gas 630000 gwei→ETH": { result: 0.00063, unit: "ETH" },
      "eth-gas 0.05 ETH→gwei": { result: 50_000_000, unit: "gwei" },
      "validator-stake 2.5 HBAR→tinybar": { result: 250_000_000, unit: "tinybar" },
      "validator-stake 0.8 ETH→gwei": { result: 800_000_000, unit: "gwei" },
      "dao-payout 3 HBAR→tinybar": { result: 300_000_000, unit: "tinybar" },
    });
  });

  it("leaves unit-convert's public suite unchanged", () => {
    expect(unitConvertSpecHash).toBe("0x340fb662aa3537d76dd0a23b5ae9488d3394a5a1eb1e8185c79322119ea1f1af");
  });

  it("is 8 tasks: 4 Web3 first, then 4 general, one of them on the public suite", () => {
    expect(TASK_PACK.map((t) => t.group)).toEqual([...Array(4).fill("web3"), ...Array(4).fill("general")]);
    expect(TASK_PACK.map((t) => t.id)).toEqual([
      "x402-spend",
      "eth-gas",
      "validator-stake",
      "dao-payout",
      "marathon",
      "recipe",
      "india-trip",
      "suite-mix",
    ]);
  });

  it("names where each right answer is defined", () => {
    const conv = (from: string, to: string) => ({ category: "conversion", input: { value: 1, from, to } }) as const;
    const source = (task: Parameters<typeof grade>[0]) => grade(task, null).source;
    expect(source(conv("m", "cm")).url).toBe("https://www.nist.gov/pml/special-publication-811");
    expect(source(conv("C", "F")).url).toBe("https://www.nist.gov/pml/special-publication-811");
    expect(source(conv("HBAR", "tinybar")).url).toBe("https://docs.hedera.com/hedera/sdks-and-apis/sdks/hbars");
    expect(source(conv("ETH", "gwei")).url).toBe("https://ethereum.org/en/developers/docs/intro-to-ether/");
    expect(source({ category: "currency-conversion", input: { amount: 1, from: "USD", to: "EUR" } }).label).toBe(
      "Demo reference rates (fixed table)",
    );
  });

  it("has a ground truth for every part of every task-pack task, and the pack is mostly multi-part", () => {
    expect(TASK_PACK.every((t) => TaskSchema.safeParse(t.task).success)).toBe(true);
    for (const { id, part } of packParts) {
      expect(SubTaskSchema.parse(part)).toEqual(part);
      const expected =
        part.category === "conversion"
          ? expectedConversion(part.input.value, part.input.from, part.input.to)
          : expectedCurrency(part.input.amount, part.input.from, part.input.to);
      expect(expected, `${id} ${JSON.stringify(part.input)}`).not.toBeNull();
    }
    const multi = TASK_PACK.filter((t) => t.task.kind === "tasks" && t.task.parts.length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(5);
  });

  it("agrees with the honest FX vendor, whose public suite matches the reference table", async () => {
    for (const { part } of packParts) {
      if (part.category !== "currency-conversion") continue;
      expect(grade(part, await fxReference.handle(part.input)).correct, JSON.stringify(part.input)).toBe(true);
    }
    for (const c of fxReferenceSuite.cases) {
      const task = SubTaskSchema.parse({ category: "currency-conversion", input: c.input });
      expect(c.expect.kind === "exact" && grade(task, c.expect.value).correct, c.id).toBe(true);
    }
  });

  it("judges probes with the oracle, for units and currency", async () => {
    const input = { value: 273.15, from: "K", to: "C" };
    expect(await oracleJudge({ input, output: await handleUnitConvert(input) })).toBe(true);
    expect(await oracleJudge({ input, output: { result: 273.15, unit: "C" } })).toBe(false);
    const fx = { amount: -1, from: "USD", to: "EUR" };
    expect(await oracleJudge({ input: fx, output: await createFlakyFx({ staleRate: 0 })(fx) })).toBe(true);
    expect(await oracleJudge({ input: fx, output: await createFlakyFx({ staleRate: 1 })(fx) })).toBe(false);
    expect(await oracleJudge({ input: { csv: "a,b" }, output: {} })).toBe(false);
  });

  it("marks echoed values, wrong units and malformed responses as wrong", () => {
    const task = { category: "conversion", input: { value: 3, from: "m", to: "cm" } } as const;
    expect(grade(task, { result: 3, unit: "cm" }).correct).toBe(false);
    expect(grade(task, { result: 300, unit: "m" }).correct).toBe(false);
    expect(grade(task, "300 cm").correct).toBe(false);
    expect(grade(task, null).correct).toBe(false);
  });

  it("does not wave through a zero answer for a tiny expected value", () => {
    const task = { category: "conversion", input: { value: 1, from: "mm", to: "km" } } as const;
    expect(grade(task, { result: 0, unit: "km" }).correct).toBe(false);
    expect(grade(task, { result: 1e-6, unit: "km" }).correct).toBe(true);
  });

  it("requires the FX answer to be in the requested currency", () => {
    const task = { category: "currency-conversion", input: { amount: 250, from: "USD", to: "INR" } } as const;
    expect(grade(task, { converted: 20800, to: "INR" }).correct).toBe(true);
    expect(grade(task, { converted: 20800, to: "EUR" }).correct).toBe(false);
    expect(grade(task, { converted: 20800 }).correct).toBe(false);
  });

  it("only accepts tasks in units and currencies the oracle knows", () => {
    const parse = (task: unknown) => SubTaskSchema.safeParse(task).success;
    expect(parse({ category: "conversion", input: { value: 1, from: "m", to: "ft" } })).toBe(true);
    expect(parse({ category: "conversion", input: { value: 1, from: "m", to: "furlong" } })).toBe(false);
    expect(parse({ category: "currency-conversion", input: { amount: 1, from: "USD", to: "GBP" } })).toBe(true);
    expect(parse({ category: "currency-conversion", input: { amount: 1, from: "USD", to: "JPY" } })).toBe(false);
  });

  it("accepts fresh FX answers and rejects stale ones", async () => {
    const task = { category: "currency-conversion", input: { amount: 250, from: "USD", to: "INR" } } as const;
    expect(grade(task, await createFlakyFx({ staleRate: 0 })(task.input)).correct).toBe(true);
    expect(grade(task, await createFlakyFx({ staleRate: 1 })(task.input)).correct).toBe(false);
  });
});

describe("oracle money rounding", () => {
  const task = (amount: number, from: "USD" | "INR", to: "USD" | "INR") =>
    ({ category: "currency-conversion", input: { amount, from, to } }) as const;
  it("grades currency to the cent, not by relative tolerance", () => {
    expect(grade(task(400, "USD", "INR"), { to: "INR", converted: 33280 }).correct).toBe(true);
    expect(grade(task(400, "USD", "INR"), { to: "INR", converted: 33280.01 }).correct).toBe(false);
  });
  it("rounds same-currency answers to cents like the services", () => {
    expect(grade(task(12.345, "USD", "USD"), { to: "USD", converted: 12.35 }).correct).toBe(true);
  });
});

describe("parser output", () => {
  it("is an object schema (the model API rejects top-level unions)", async () => {
    const { z } = await import("zod");
    const { ParserOutputSchema } = await import("../src/tasks");
    expect((z.toJSONSchema(ParserOutputSchema) as { type?: string }).type).toBe("object");
  });
  it("maps empty or unsupported output to an unsupported task", async () => {
    const { toTask } = await import("../src/tasks");
    expect(toTask({ kind: "tasks", parts: [], reason: "" }).kind).toBe("unsupported");
    expect(toTask({ kind: "unsupported", parts: [], reason: "poem" })).toEqual({ kind: "unsupported", reason: "poem" });
  });
});

describe("crypto precision", () => {
  it("returns exact denominations without float noise and grades tiny amounts relatively", async () => {
    const { handleUnitConvert } = await import("../../services/unit-convert/src/index");
    const conv = (value: number, from: string, to: string) =>
      ({ category: "conversion", input: { value, from, to } }) as Parameters<typeof grade>[0];
    expect(await handleUnitConvert({ value: 0.271, from: "HBAR", to: "tinybar" })).toEqual({
      result: 27100000,
      unit: "tinybar",
    });
    expect(await handleUnitConvert({ value: 1, from: "gwei", to: "ETH" })).toEqual({ result: 1e-9, unit: "ETH" });
    const oneGwei = conv(1, "gwei", "ETH");
    expect(grade(oneGwei, { result: 1e-9, unit: "ETH" }).correct).toBe(true);
    expect(grade(oneGwei, { result: 0, unit: "ETH" }).correct).toBe(false);
  });
});

describe("grounding ignores the legend", () => {
  it("does not let the legend's fixed numbers vouch for a made-up score", async () => {
    const { checkGrounding } = await import("../src/grounding");
    const prompt =
      'Field legend: skeptiqueMedianScore = median 0-100 from public suite (40%) and probes (60%).\n\nListings:\n[{"skeptiqueMedianScore": 40}]';
    const g = checkGrounding({ choices: [], reason: "Service #1 scored 60", signalsUsed: [] }, prompt);
    expect(g.ok).toBe(false);
    expect(checkGrounding({ choices: [], reason: "It scored 40", signalsUsed: [] }, prompt).ok).toBe(true);
  });
});
