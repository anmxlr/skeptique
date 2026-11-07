import { describe, expect, it } from "vitest";
import { checkPolicy } from "../src/policy";
import { GAMER, GOOD, policy, service } from "./fakes";

describe("spend policy", () => {
  it("lets the status-quo agent buy anything within budget", () => {
    expect(checkPolicy(policy(null), GAMER, 0n).allowed).toBe(true);
  });

  it("blocks low-score and unreviewed services on the Skeptique side", () => {
    const rules = policy({ minMedian: 70, minRounds: 1 });
    expect(checkPolicy(rules, GOOD, 0n).allowed).toBe(true);
    expect(checkPolicy(rules, GAMER, 0n).allowed).toBe(false);
    expect(
      checkPolicy(rules, service({ median: null, nRounds: 0 }), 0n)
        .checks.filter((c) => !c.pass)
        .map((c) => c.rule),
    ).toEqual(["reviewed", "minimum score"]);
  });

  it("enforces the per-call cap and the budget", () => {
    expect(checkPolicy(policy(null), service({ pricePerCall: "6000" }), 0n).allowed).toBe(false);
    const tight = { ...policy(null), budgetTinybars: 999n };
    expect(
      checkPolicy(tight, GOOD, 0n)
        .checks.filter((c) => !c.pass)
        .map((c) => c.rule),
    ).toEqual(["budget"]);
  });

  it("counts what earlier parts already spent against the budget", () => {
    const rules = { ...policy(null), budgetTinybars: 2000n };
    expect(checkPolicy(rules, GOOD, 1000n).allowed).toBe(true);
    expect(checkPolicy(rules, GOOD, 1001n).allowed).toBe(false);
  });
});
