import type { ServiceView } from "@skeptique/shared";
import { describe, expect, it } from "vitest";
import type { Llm } from "../src/llm";
import { hashRecord } from "../src/record";
import { type RunArenaArgs, runArena, shuffleWithSeed } from "../src/runner";
import type { ArenaEvent, Decision } from "../src/schema";
import {
  byPopularity,
  byScore,
  FX,
  fakeLlm,
  fakePay,
  GAMER,
  GOOD,
  isSkeptique,
  listingsIn,
  policy,
  scriptedLlm,
  service,
} from "./fakes";

const TASK = { category: "conversion", input: { value: 3, from: "m", to: "cm" } } as const;

function arena(llm: Llm, over: Partial<RunArenaArgs> = {}) {
  const calls = { baseline: [] as string[], skeptique: [] as string[] };
  const events: ArenaEvent[] = [];
  const args: RunArenaArgs = {
    runId: "run-1",
    prompt: "Convert 3 metres to centimetres",
    task: TASK,
    services: [GOOD, GAMER, FX],
    apiUrl: "http://api.test",
    llm,
    network: "test",
    provenance: "test",
    taskSource: "preset",
    sides: {
      baseline: { payAndCall: fakePay(calls.baseline), signer: null, payer: "0.0.10", policy: policy(null) },
      skeptique: {
        payAndCall: fakePay(calls.skeptique),
        signer: null,
        payer: "0.0.11",
        policy: policy({ minMedian: 70, minRounds: 1 }),
      },
    },
    emit: (e) => events.push(e),
    now: () => new Date("2026-11-07T00:00:00.000Z"),
    seed: "seed-1",
    ...over,
  };
  return { run: () => runArena(args), calls, events };
}

/** Each side's decision, chosen from the prompt it was shown. */
const sideLlm = (pick: { baseline: (p: string) => Decision | Error; skeptique: (p: string) => Decision | Error }) =>
  fakeLlm((p) => (isSkeptique(p) ? pick.skeptique(p) : pick.baseline(p)));
const choose = (option: number | null): Decision => ({ option, reason: "test", signalsUsed: [] });

describe("runArena", () => {
  it("baseline buys the popular gamer and is wrong; Skeptique buys the reviewed service and is correct", async () => {
    const { run, calls } = arena(scriptedLlm());
    const { record } = await run();
    const { baseline, skeptique } = record.sides;
    expect(baseline.pick?.id).toBe(GAMER.id);
    expect(baseline.outcome).toBe("wrong");
    expect(baseline.wastedTinybars).toBe(GAMER.pricePerCall);
    expect(skeptique.pick?.id).toBe(GOOD.id);
    expect(skeptique.outcome).toBe("correct");
    expect(skeptique.wastedTinybars).toBe("0");
    expect(calls).toEqual({ baseline: [GAMER.endpoint], skeptique: [GOOD.endpoint] });
    expect(record.summary).toEqual({
      baseline: {
        outcome: "wrong",
        answeredCorrect: false,
        noAnswer: false,
        paidTinybars: "1000",
        wastedTinybars: "1000",
      },
      skeptique: {
        outcome: "correct",
        answeredCorrect: true,
        noAnswer: false,
        paidTinybars: "1000",
        wastedTinybars: "0",
      },
    });
  });

  it("records who paid, under which policy, and where the task and marketplace came from", async () => {
    const { record } = await arena(scriptedLlm()).run();
    expect(record).toMatchObject({ version: 2, provenance: "test", taskSource: "preset", seed: "seed-1" });
    expect(record.agents).toEqual({
      baseline: { payer: "0.0.10", policy: { budgetTinybars: "10000", maxPerCallTinybars: "5000", evidence: null } },
      skeptique: {
        payer: "0.0.11",
        policy: { budgetTinybars: "10000", maxPerCallTinybars: "5000", evidence: { minMedian: 70, minRounds: 1 } },
      },
    });
    expect(record).not.toHaveProperty("budgetTinybars");
  });

  it("treats a response the payer did not pay for as an error", async () => {
    const pay = fakePay();
    const unpaid: typeof pay = async (a) => ({ ...(await pay(a)), paid: false, txId: null });
    const { record } = await arena(scriptedLlm(), {
      sides: {
        baseline: { payAndCall: unpaid, signer: null, payer: "0.0.10", policy: policy(null) },
        skeptique: { payAndCall: pay, signer: null, payer: "0.0.11", policy: policy({ minMedian: 70, minRounds: 1 }) },
      },
    }).run();
    expect(record.sides.baseline.outcome).toBe("error");
    expect(record.sides.baseline.error).toBe("unpaid response");
    expect(record.sides.baseline.verdict).toBeNull();
    expect(record.sides.skeptique.outcome).toBe("correct");
  });

  it("passes a timeout signal to every payment", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const pay = fakePay();
    const spy: typeof pay = async (a) => {
      signals.push(a.signal);
      return pay(a);
    };
    await arena(scriptedLlm(), {
      sides: {
        baseline: { payAndCall: spy, signer: null, payer: "0.0.10", policy: policy(null) },
        skeptique: { payAndCall: spy, signer: null, payer: "0.0.11", policy: policy({ minMedian: 70, minRounds: 1 }) },
      },
    }).run();
    expect(signals).toHaveLength(2);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("blocks Skeptique from paying a low-score pick, and pays nothing", async () => {
    const { run, calls } = arena(fakeLlm((p) => choose(byPopularity(p))));
    const { record } = await run();
    expect(record.sides.skeptique.pick?.id).toBe(GAMER.id);
    expect(record.sides.skeptique.outcome).toBe("blocked");
    expect(record.sides.skeptique.policy?.checks.find((c) => !c.pass)?.rule).toBe("minimum score");
    expect(record.sides.skeptique.payment).toBeNull();
    expect(calls.skeptique).toEqual([]);
    expect(calls.baseline).toEqual([GAMER.endpoint]);
  });

  it("refuses and pays nothing when the model picks no service", async () => {
    const { run, calls } = arena(fakeLlm(() => choose(null)));
    const { record } = await run();
    expect(record.sides.baseline.outcome).toBe("refused");
    expect(record.sides.skeptique.outcome).toBe("refused");
    expect(calls).toEqual({ baseline: [], skeptique: [] });
  });

  it("records a model failure as an error and still completes the other side", async () => {
    const { run, calls } = arena(
      sideLlm({ baseline: () => new Error("cli exploded"), skeptique: (p) => choose(byScore(p)) }),
    );
    const { record } = await run();
    expect(record.sides.baseline.outcome).toBe("error");
    expect(record.sides.baseline.error).toContain("cli exploded");
    expect(calls.baseline).toEqual([]);
    expect(record.sides.skeptique.outcome).toBe("correct");
  });

  it("treats an option outside the listed range as an error and pays nothing", async () => {
    const { run, calls } = arena(sideLlm({ baseline: () => choose(3), skeptique: () => choose(0) }));
    const { record } = await run();
    expect(record.sides.baseline.outcome).toBe("error");
    expect(record.sides.baseline.error).toContain("option 3");
    expect(record.sides.skeptique.outcome).toBe("error");
    expect(calls).toEqual({ baseline: [], skeptique: [] });
  });

  it("refuses both sides on an unsupported task without asking the model", async () => {
    const { run, calls } = arena(
      fakeLlm(() => {
        throw new Error("must not be called");
      }),
      { task: { category: "unsupported", reason: "poetry" } },
    );
    const { record } = await run();
    expect(record.sides.baseline.outcome).toBe("refused");
    expect(record.sides.skeptique.outcome).toBe("refused");
    expect(record.sides.baseline.error).toContain("poetry");
    expect(record.options).toEqual([]);
    expect(calls).toEqual({ baseline: [], skeptique: [] });
  });

  it("refuses both sides before buying when the oracle has no ground truth for the task", async () => {
    const { run, calls } = arena(
      fakeLlm(() => {
        throw new Error("must not be called");
      }),
      { task: { category: "conversion", input: { value: 1, from: "m", to: "kg" } } },
    );
    const { record } = await run();
    expect(record.sides.baseline.outcome).toBe("refused");
    expect(record.sides.skeptique.error).toContain("no ground truth");
    expect(record.summary.skeptique).toMatchObject({ answeredCorrect: false, noAnswer: true });
    expect(calls).toEqual({ baseline: [], skeptique: [] });
  });

  it("hashes the same input to the same hash, and a changed record to a different one", async () => {
    const first = await arena(scriptedLlm()).run();
    const second = await arena(scriptedLlm()).run();
    expect(first.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(hashRecord(first.record)).toBe(first.hash);
    expect(hashRecord({ ...first.record, prompt: "Convert 4 metres to centimetres" })).not.toBe(first.hash);
    expect((await arena(scriptedLlm(), { seed: "seed-2" }).run()).hash).not.toBe(first.hash);
  });

  it("emits events in order: start, then per side decided → policy → paid → graded, then finish", async () => {
    const { run, events } = arena(scriptedLlm());
    await run();
    expect(events[0]?.type).toBe("run-started");
    expect(events.at(-1)?.type).toBe("run-finished");
    for (const side of ["baseline", "skeptique"] as const) {
      const types = events.filter((e) => "side" in e && e.side === side).map((e) => e.type);
      expect(types).toEqual(["decided", "policy", "paid", "graded"]);
    }
    expect(events).toHaveLength(10);
  });

  it("shows both sides the same prompt apart from the evidence fields and the legend", async () => {
    const { run } = arena(scriptedLlm());
    const { record } = await run();
    const base = record.sides.baseline.prompt;
    const skep = record.sides.skeptique.prompt;
    expect(base).not.toContain("skeptiqueMedianScore");
    for (const prompt of [base, skep]) {
      for (const { name } of [GOOD, GAMER, FX]) expect(prompt).not.toContain(name);
      expect(prompt).toContain(`Structured task (sent to the chosen service): ${JSON.stringify(TASK.input)}`);
    }
    const sections = (p: string) => p.split("\n\n");
    expect(sections(skep).slice(0, 3)).toEqual(sections(base).slice(0, 3));
    expect(sections(skep)[3]).toMatch(/^Field legend: /);
    const evidence = ["skeptiqueMedianScore", "skeptiqueConfidence", "skeptiqueRank", "reviewRounds", "lastReviewedAt"];
    const stripped = listingsIn(skep).map((l) =>
      Object.fromEntries(Object.entries(l).filter(([key]) => !evidence.includes(key))),
    );
    expect(stripped).toEqual(listingsIn(base));
  });
});

describe("option shuffle", () => {
  const many: ServiceView[] = [1, 2, 3, 4, 5].map((id) => service({ id, name: `s${id}` }));

  it("is a deterministic permutation of the seed", () => {
    const a = shuffleWithSeed("x", many).map((s) => s.id);
    expect(shuffleWithSeed("x", many).map((s) => s.id)).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    const seeds = ["a", "b", "c", "d", "e", "f"].map((seed) => shuffleWithSeed(seed, many)[0]?.id);
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("gives both sides the same mapping, records it, and maps a picked option back to its service", async () => {
    const firstOptions = new Set<number | undefined>();
    for (const seed of ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5", "seed-6"]) {
      const { record } = await arena(
        fakeLlm(() => choose(2)),
        { seed },
      ).run();
      expect(record.seed).toBe(seed);
      const expected = shuffleWithSeed(seed, [GOOD, GAMER]).map((s, k) => ({ option: k + 1, serviceId: s.id }));
      expect(record.options).toEqual(expected);
      firstOptions.add(expected[0]?.serviceId);
      const option2 = expected[1]?.serviceId;
      expect(record.sides.baseline.pick).toMatchObject({ option: 2, id: option2 });
      expect(record.sides.skeptique.pick).toMatchObject({ option: 2, id: option2 });
      const shown = (p: string) => listingsIn(p).map((l) => [l.option, l.paidCallsByBuyers]);
      expect(shown(record.sides.skeptique.prompt)).toEqual(shown(record.sides.baseline.prompt));
    }
    expect(firstOptions.size).toBe(2); // the seeds above cover both orderings
  });
});
