import { expect, it } from "vitest";
import { DEFAULT_ROUND_CONFIG, RoundConfigSchema } from "../src/index";

it("exports a valid default round configuration", () => {
  expect(RoundConfigSchema.parse(DEFAULT_ROUND_CONFIG)).toEqual(DEFAULT_ROUND_CONFIG);
});
