import { suiteHash, TestSuiteSchema } from "@skeptic/shared";
import { describe, expect, it } from "vitest";
import { cleanCsv, csvCleanExpected, csvCleanSpecHash, csvCleanSuite } from "./index";

describe("csv-clean service", () => {
  it("validates and hashes a 12-case mixed suite", () => {
    expect(csvCleanSuite.cases).toHaveLength(12);
    expect(new Set(csvCleanSuite.cases.map((testCase) => testCase.expect.kind))).toEqual(
      new Set(["exact", "schema", "regex", "judge"]),
    );
    expect(TestSuiteSchema.safeParse(csvCleanSuite).success).toBe(true);
    expect(csvCleanSpecHash).toBe(suiteHash(csvCleanSuite));
  });

  it("lands in the deliberately mediocre pass band", () => {
    let passed = 0;
    for (const testCase of csvCleanSuite.cases) {
      const result = cleanCsv(testCase.input as { csv: string });
      const expected = csvCleanExpected[testCase.id];
      if (JSON.stringify(result) === JSON.stringify(expected)) passed++;
    }
    const rate = (passed / csvCleanSuite.cases.length) * 100;
    expect(rate).toBeGreaterThanOrEqual(60);
    expect(rate).toBeLessThanOrEqual(80);
  });
});
