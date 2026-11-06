import type { ServiceView } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import type { Llm } from "../src/llm";
import type { SpendPolicy } from "../src/policy";
import type { Decision } from "../src/schema";

export const service = (over: Partial<ServiceView>): ServiceView => ({
  id: 1,
  name: "unit-convert",
  category: "conversion",
  endpoint: "http://good.test/call",
  pricePerCall: "1000",
  seller: "0x0000000000000000000000000000000000000001",
  ensName: "",
  median: 100,
  confidence: 0.2,
  rank: 88,
  nRounds: 1,
  lastRoundAt: "2026-11-07T00:00:00.000Z",
  popularityCalls: 1,
  ...over,
});

export const GOOD = service({});
export const GAMER = service({
  id: 2,
  name: "suite-gamer",
  endpoint: "http://gamer.test/call",
  median: 40,
  rank: 28,
  popularityCalls: 5,
});

/** Picks by a rule over the prompt text, so the test controls what each side "chooses". */
export function fakeLlm(choose: (prompt: string) => Decision | Error): Llm {
  return {
    model: "fake-model",
    async ask({ prompt, schema }) {
      const answer = choose(prompt);
      if (answer instanceof Error) throw answer;
      return { value: schema.parse(answer), model: "fake-model", costUsd: 0, ms: 1, raw: JSON.stringify(answer) };
    },
  };
}

/** Behaves like the real services: the good one converts, the gamer echoes the value. */
export const fakePay =
  (calls: string[] = []): PayAndCall =>
  async ({ url, body }) => {
    calls.push(url);
    const { value, to } = body as { value: number; to: string };
    const response = url.includes("good") ? { result: value * 100, unit: to } : { result: value, unit: to };
    return { response, txId: `0.0.1@${calls.length}.0`, paid: true };
  };

export const policy = (evidence: SpendPolicy["evidence"]): SpendPolicy => ({
  budgetTinybars: 10_000n,
  maxPerCallTinybars: 5_000n,
  evidence,
});
