import { describe, expect, it } from "vitest";
import { checkPolicy } from "../src/policy";
import { GAMER, GOOD, policy, service } from "./fakes";

describe("spend policy", () => {
  it("lets the status-quo agent buy anything within budget", () => {
    expect(checkPolicy(policy(null), GAMER).allowed).toBe(true);
  });

  it("blocks low-score and unreviewed services on the Skeptique side", () => {
    const rules = policy({ minMedian: 70, minRounds: 1 });
    expect(checkPolicy(rules, GOOD).allowed).toBe(true);
    expect(checkPolicy(rules, GAMER).allowed).toBe(false);
    expect(
      checkPolicy(rules, service({ median: null, nRounds: 0 }))
        .checks.filter((c) => !c.pass)
        .map((c) => c.rule),
    ).toEqual(["reviewed", "minimum score"]);
  });

  it("enforces the per-call cap and the budget", () => {
    expect(checkPolicy(policy(null), service({ pricePerCall: "6000" })).allowed).toBe(false);
    const tight = { ...policy(null), budgetTinybars: 999n };
    expect(
      checkPolicy(tight, GOOD)
        .checks.filter((c) => !c.pass)
        .map((c) => c.rule),
    ).toEqual(["budget"]);
  });
});
