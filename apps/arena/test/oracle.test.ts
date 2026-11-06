import { describe, expect, it } from "vitest";
import { createFlakyFx } from "../../services/flaky-fx/src/index";
import { handleUnitConvert } from "../../services/unit-convert/src/index";
import { expectedConversion, grade } from "../src/oracle";
import { TASK_PACK } from "../src/tasks";

describe("oracle", () => {
  it("computes SI conversions independently of the services", () => {
    expect(expectedConversion(3, "m", "cm")).toBeCloseTo(300);
    expect(expectedConversion(10, "mi", "km")).toBeCloseTo(16.09344);
    expect(expectedConversion(451, "F", "C")).toBeCloseTo(232.7778, 3);
    expect(expectedConversion(1, "m", "kg")).toBeNull();
  });

  it("agrees with the honest unit converter on every conversion task in the pack", async () => {
    for (const { task } of TASK_PACK) {
      if (task.category !== "conversion") continue;
      expect(grade(task, await handleUnitConvert(task.input)).correct, JSON.stringify(task.input)).toBe(true);
    }
  });

  it("marks echoed values, wrong units and malformed responses as wrong", () => {
    const task = { category: "conversion", input: { value: 3, from: "m", to: "cm" } } as const;
    expect(grade(task, { result: 3, unit: "cm" }).correct).toBe(false);
    expect(grade(task, { result: 300, unit: "m" }).correct).toBe(false);
    expect(grade(task, "300 cm").correct).toBe(false);
    expect(grade(task, null).correct).toBe(false);
  });

  it("accepts fresh FX answers and rejects stale ones", async () => {
    const task = { category: "currency-conversion", input: { amount: 250, from: "USD", to: "INR" } } as const;
    expect(grade(task, await createFlakyFx({ staleRate: 0 })(task.input)).correct).toBe(true);
    expect(grade(task, await createFlakyFx({ staleRate: 1 })(task.input)).correct).toBe(false);
  });
});
