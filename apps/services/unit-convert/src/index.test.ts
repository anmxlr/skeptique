import { suiteHash, TestSuiteSchema } from "@skeptique/shared";
import { describe, expect, it } from "vitest";
import { handleUnitConvert, unitConvertSpecHash, unitConvertSuite } from "./index";

describe("unit-convert service", () => {
  it("validates and hashes a 12-case mixed suite", () => {
    expect(unitConvertSuite.cases).toHaveLength(12);
    expect(new Set(unitConvertSuite.cases.map((testCase) => testCase.expect.kind))).toEqual(
      new Set(["exact", "schema", "regex", "judge"]),
    );
    expect(TestSuiteSchema.safeParse(unitConvertSuite).success).toBe(true);
    expect(unitConvertSpecHash).toBe(suiteHash(unitConvertSuite));
  });

  it("scores at least 95 percent against the public suite", async () => {
    for (const testCase of unitConvertSuite.cases) {
      const output = await handleUnitConvert(testCase.input);
      if (testCase.expect.kind === "exact") expect(output).toEqual(testCase.expect.value);
      if (testCase.expect.kind === "schema")
        expect(output).toMatchObject({ result: expect.any(Number), unit: expect.any(String) });
      if (testCase.expect.kind === "regex") expect(output).toMatch(new RegExp(testCase.expect.pattern));
      if (testCase.expect.kind === "judge") expect(output).toEqual({ result: 0, unit: "C" });
    }
  });

  it("rejects inherited unit names and overflowing results while preserving large finite identities", async () => {
    await expect(handleUnitConvert({ value: 1, from: "toString", to: "constructor" })).rejects.toThrow(
      "Unsupported conversion",
    );
    await expect(handleUnitConvert({ value: Number.MAX_VALUE, from: "m", to: "cm" })).rejects.toThrow("finite");
    await expect(handleUnitConvert({ value: Number.MAX_VALUE, from: "kg", to: "kg" })).resolves.toEqual({
      result: Number.MAX_VALUE,
      unit: "kg",
    });
  });
});
