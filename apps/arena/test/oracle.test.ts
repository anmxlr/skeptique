import { describe, expect, it } from "vitest";
import { createFlakyFx } from "../../services/flaky-fx/src/index";
import { handleUnitConvert } from "../../services/unit-convert/src/index";
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
