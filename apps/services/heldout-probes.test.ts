import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { demoServices } from "./catalog";
import { cleanCsv } from "./csv-clean/src/index";
import { heldOutProbeSeeds } from "./heldout-probes";
import { handleUnitConvert } from "./unit-convert/src/index";

describe("held-out probe seeds", () => {
  it("cover every listed service except the suite-gamer's own file, with inputs absent from the public suites", () => {
    for (const service of demoServices.filter((s) => s.name !== "suite-gamer")) {
      const seeds = heldOutProbeSeeds[service.name];
      expect(seeds?.length, service.name).toBeGreaterThan(0);
      for (const probe of seeds ?? []) {
        expect(
          service.suite.cases.some((c) => isDeepStrictEqual(c.input, probe.input)),
          `${service.name}/${probe.id}`,
        ).toBe(false);
      }
    }
  });

  it("unit-convert passes every held-out probe; csv-clean stays mediocre", async () => {
    for (const probe of heldOutProbeSeeds["unit-convert"]!) {
      const out = await handleUnitConvert(probe.input);
      expect(out).toEqual((probe.expect as { value: unknown }).value);
    }
    const csv = heldOutProbeSeeds["csv-clean"]!;
    const passed = csv.filter((p) => cleanCsv(p.input as { csv: string }) === (p.expect as { value: string }).value);
    expect(passed.length / csv.length).toBeLessThanOrEqual(0.8);
  });
});
