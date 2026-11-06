import { expect, it } from "vitest";
import { packageName } from "../src/index";

it("exports its package name", () => {
  expect(packageName).toBe("@skeptic/service-csv-clean");
});
