import { describe, expect, it } from "vitest";
import { buyerSystemPrompt } from "../src/agent";
import type { Llm } from "../src/llm";
import { runArena } from "../src/runner";
import { BUY_MODES } from "../src/schema";
import { fakePay, GAMER, GOOD, policy } from "./fakes";

/** Records every system prompt it receives and always picks option 1. */
function recordingLlm(systems: string[]): Llm {
  return {
    model: "fake-model",
    async ask({ system, schema }) {
      systems.push(system);
      const value = schema.parse({ option: 1, reason: "first", signalsUsed: [] });
      return { value, model: "fake-model", costUsd: 0, ms: 1, raw: "{}" };
    },
  };
}

describe("buy mode", () => {
  it("differs only in the purchase rule", () => {
    const [mayRefuse, mustBuy] = BUY_MODES.map(buyerSystemPrompt);
    expect(mayRefuse).toContain("buying nothing is allowed");
    expect(mustBuy).toContain("you must pick one listed service");
    expect(mayRefuse?.split("\n").filter((l) => !mustBuy?.includes(l))).toHaveLength(1);
  });

  it("gives both sides the same system prompt and records the mode", async () => {
    const systems: string[] = [];
    const { record } = await runArena({
      runId: "r",
      prompt: "Convert 3 metres to centimetres",
      task: { category: "conversion", input: { value: 3, from: "m", to: "cm" } },
      services: [GOOD, GAMER],
      apiUrl: "http://api.test",
      llm: recordingLlm(systems),
      network: "test",
      provenance: "test",
      taskSource: "preset",
      mode: "must-buy",
      seed: "fixed",
      sides: {
        baseline: { payAndCall: fakePay(), signer: null, payer: "0.0.10", policy: policy(null) },
        skeptique: {
          payAndCall: fakePay(),
          signer: null,
          payer: "0.0.11",
          policy: policy({ minMedian: 70, minRounds: 1 }),
        },
      },
    });
    expect(systems).toHaveLength(2);
    expect(systems[0]).toBe(systems[1]);
    expect(record.mode).toBe("must-buy");
    expect(record.systemPrompt).toBe(buyerSystemPrompt("must-buy"));
  });
});
