import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { slashAmount, weightedMedian } from "./index";

describe("weighted consensus math", () => {
  it("resolves an exact half-weight tie to the lower score", () => {
    expect(
      weightedMedian([
        { score: 40, weight: 5n },
        { score: 60, weight: 5n },
      ]),
    ).toBe(40);
  });

  it("moves monotonically when one or more scores move upward", () => {
    const cases = fc.array(
      fc.record({
        score: fc.integer({ min: 0, max: 100 }),
        weight: fc.bigInt({ min: 1n, max: 1000n }),
        delta: fc.integer({ min: 0, max: 100 }),
      }),
      { minLength: 1, maxLength: 7 },
    );
    fc.assert(
      fc.property(cases, (values) => {
        const before = weightedMedian(values);
        const after = weightedMedian(
          values.map(({ score, weight, delta }) => ({ score: Math.min(100, score + delta), weight })),
        );
        expect(after).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: 1000 },
    );
  });

  it("floors slash amounts in basis points", () => {
    expect(slashAmount(500n, 2000)).toBe(100n);
    expect(slashAmount(99n, 2000)).toBe(19n);
  });
});
