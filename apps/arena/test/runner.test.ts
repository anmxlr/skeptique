import type { ServiceView } from "@skeptique/shared";
import { describe, expect, it } from "vitest";
import type { Llm } from "../src/llm";
import { hashRecord } from "../src/record";
import { type RunArenaArgs, runArena, shuffleWithSeed } from "../src/runner";
import type { ArenaEvent, Decision, SubTask, Task } from "../src/schema";
import {
  byPopularity,
  byScore,
  choosePer,
  FX,
  FXREF,
  fakeLlm,
  fakePay,
  GAMER,
  GOOD,
  isSkeptique,
  listingsIn,
  partsIn,
  policy,
  scriptedLlm,
  service,
} from "./fakes";

const PART: SubTask = { category: "conversion", input: { value: 3, from: "m", to: "cm" } };
const TASK: Task = { kind: "tasks", parts: [PART] };
const USD_INR: SubTask = { category: "currency-conversion", input: { amount: 250, from: "USD", to: "INR" } };
const SUITE_C_F: SubTask = { category: "conversion", input: { value: -40, from: "C", to: "F" } };

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
/** One option per part, in part order. */
const choose = (...options: (number | null)[]): Decision => ({
  choices: options.map((option, part) => ({ part, option })),
  reason: "test",
  signalsUsed: [],
});

describe("runArena", () => {
  it("baseline buys the popular gamer and is wrong; Skeptique buys the reviewed service and is correct", async () => {
    const { run, calls } = arena(scriptedLlm());
    const { record } = await run();
    const { baseline, skeptique } = record.sides;
    expect(baseline.parts[0]?.pick?.id).toBe(GAMER.id);
    expect(baseline.outcome).toBe("wrong");
    expect(baseline.wastedTinybars).toBe(GAMER.pricePerCall);
    expect(skeptique.parts[0]?.pick?.id).toBe(GOOD.id);
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
        correctParts: 0,
        totalParts: 1,
      },
      skeptique: {
        outcome: "correct",
        answeredCorrect: true,
        noAnswer: false,
        paidTinybars: "1000",
        wastedTinybars: "0",
        correctParts: 1,
        totalParts: 1,
      },
    });
  });

  it("records who paid, under which policy, and where the task and marketplace came from", async () => {
    const { record } = await arena(scriptedLlm()).run();
    expect(record).toMatchObject({
      version: 3,
      provenance: "test",
      taskSource: "preset",
      seed: "seed-1",
      credentialSource: "server",
    });
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
    expect(record.sides.baseline.parts[0]?.error).toBe("unpaid response");
    expect(record.sides.baseline.parts[0]?.verdict).toBeNull();
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
    const { run, calls } = arena(fakeLlm((p) => choosePer(p, byPopularity)));
    const { record } = await run();
    const part = record.sides.skeptique.parts[0];
    expect(part?.pick?.id).toBe(GAMER.id);
    expect(record.sides.skeptique.outcome).toBe("blocked");
    expect(part?.policy?.checks.find((c) => !c.pass)?.rule).toBe("minimum score");
    expect(part?.payment).toBeNull();
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
    expect(record.sides.baseline.parts[0]?.error).toContain("option 3");
    expect(record.sides.skeptique.outcome).toBe("error");
    expect(calls).toEqual({ baseline: [], skeptique: [] });
  });

  it("refuses both sides on an unsupported task without asking the model", async () => {
    const { run, calls } = arena(
      fakeLlm(() => {
        throw new Error("must not be called");
      }),
      { task: { kind: "unsupported", reason: "poetry" } },
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
      { task: { kind: "tasks", parts: [PART, { category: "conversion", input: { value: 1, from: "m", to: "kg" } }] } },
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

  it("emits events in order: start, then per side decided → part → graded, then finish", async () => {
    const { run, events } = arena(scriptedLlm());
    await run();
    expect(events[0]?.type).toBe("run-started");
    expect(events.at(-1)?.type).toBe("run-finished");
    for (const side of ["baseline", "skeptique"] as const) {
      const types = events.filter((e) => "side" in e && e.side === side).map((e) => e.type);
      expect(types).toEqual(["decided", "part", "graded"]);
    }
    expect(events).toHaveLength(8);
  });

  it("shows both sides the same prompt apart from the evidence fields and the legend", async () => {
    const { run } = arena(scriptedLlm());
    const { record } = await run();
    const base = record.sides.baseline.prompt;
    const skep = record.sides.skeptique.prompt;
    expect(base).not.toContain("skeptiqueMedianScore");
    for (const prompt of [base, skep]) {
      for (const { name } of [GOOD, GAMER, FX]) expect(prompt).not.toContain(name);
      expect(partsIn(prompt)).toEqual([{ part: 0, ...PART }]);
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

describe("multi-part runs", () => {
  const services = [GOOD, GAMER, FX, FXREF];

  it("asks the model once per side for all parts, then pays and grades each part in order", async () => {
    const asked: string[] = [];
    const inner = scriptedLlm();
    const llm: Llm = {
      model: inner.model,
      ask: (a) => {
        asked.push(a.prompt);
        return inner.ask(a);
      },
    };
    const { run, calls, events } = arena(llm, { task: { kind: "tasks", parts: [PART, USD_INR] }, services });
    const { record } = await run();
    expect(asked).toHaveLength(2);
    const { baseline, skeptique } = record.sides;
    expect(baseline.parts.map((p) => [p.pick?.id, p.outcome])).toEqual([
      [GAMER.id, "wrong"],
      [FX.id, "wrong"],
    ]);
    expect(baseline).toMatchObject({ outcome: "wrong", correctParts: 0, totalParts: 2 });
    expect(baseline).toMatchObject({ paidTinybars: "2000", wastedTinybars: "2000" });
    expect(skeptique.parts.map((p) => [p.pick?.id, p.outcome])).toEqual([
      [GOOD.id, "correct"],
      [FXREF.id, "correct"],
    ]);
    expect(skeptique).toMatchObject({ outcome: "correct", correctParts: 2, totalParts: 2, wastedTinybars: "0" });
    expect(calls.skeptique).toEqual([GOOD.endpoint, FXREF.endpoint]);
    expect(record.summary.skeptique).toMatchObject({ correctParts: 2, totalParts: 2, paidTinybars: "2000" });
    // One shuffle per needed category, recorded with its category.
    expect(new Set(record.options.map((o) => o.category))).toEqual(new Set(["conversion", "currency-conversion"]));
    for (const side of ["baseline", "skeptique"] as const) {
      const parts = events.filter((e) => e.type === "part" && e.side === side);
      expect(parts.map((e) => (e.type === "part" ? e.part : -1))).toEqual([0, 1]);
    }
  });

  it("scores a side with some correct parts as partial and counts only wrong parts as wasted", async () => {
    const { record } = await arena(scriptedLlm(), {
      task: { kind: "tasks", parts: [SUITE_C_F, PART] },
      services,
    }).run();
    // The gamer echoes its input, which happens to be right for -40 °C → °F.
    expect(record.sides.baseline).toMatchObject({
      outcome: "partial",
      correctParts: 1,
      paidTinybars: "2000",
      wastedTinybars: "1000",
    });
    expect(record.summary.baseline).toMatchObject({ outcome: "partial", answeredCorrect: false, noAnswer: false });
  });

  it("accumulates spend across parts, so the budget blocks a later part", async () => {
    const tight = { ...policy({ minMedian: 70, minRounds: 1 }), budgetTinybars: 1500n };
    const calls: string[] = [];
    const { record } = await arena(scriptedLlm(), {
      task: { kind: "tasks", parts: [PART, USD_INR] },
      services,
      sides: {
        baseline: { payAndCall: fakePay(), signer: null, payer: "0.0.10", policy: policy(null) },
        skeptique: { payAndCall: fakePay(calls), signer: null, payer: "0.0.11", policy: tight },
      },
    }).run();
    const [first, second] = record.sides.skeptique.parts;
    expect(first?.outcome).toBe("correct");
    expect(second?.outcome).toBe("blocked");
    expect(second?.policy?.checks.filter((c) => !c.pass).map((c) => c.rule)).toEqual(["budget"]);
    expect(second?.policy?.checks.find((c) => c.rule === "budget")?.detail).toBe("1000 spent + 1000 ≤ 1500 tinybars");
    expect(calls).toEqual([GOOD.endpoint]);
    expect(record.sides.skeptique).toMatchObject({ outcome: "partial", correctParts: 1, paidTinybars: "1000" });
  });

  it("records a part the model gave no choice for as an error, without paying for it", async () => {
    const { run, calls } = arena(
      fakeLlm(() => choose(1)),
      { task: { kind: "tasks", parts: [PART, USD_INR] }, services },
    );
    const { record } = await run();
    expect(record.sides.baseline.parts[1]).toMatchObject({
      outcome: "error",
      error: "agent gave no choice for part 1",
    });
    expect(calls.baseline).toHaveLength(1);
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
      const expected = shuffleWithSeed(seed, [GOOD, GAMER], "conversion:").map((s, k) => ({
        category: "conversion",
        option: k + 1,
        serviceId: s.id,
      }));
      expect(record.options).toEqual(expected);
      firstOptions.add(expected[0]?.serviceId);
      const option2 = expected[1]?.serviceId;
      expect(record.sides.baseline.parts[0]?.pick).toMatchObject({ option: 2, id: option2 });
      expect(record.sides.skeptique.parts[0]?.pick).toMatchObject({ option: 2, id: option2 });
      const shown = (p: string) => listingsIn(p).map((l) => [l.option, l.paidCallsByBuyers]);
      expect(shown(record.sides.skeptique.prompt)).toEqual(shown(record.sides.baseline.prompt));
    }
    expect(firstOptions.size).toBe(2); // the seeds above cover both orderings
  });
});
