import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArenaRunView, BatchView } from "../components/arena";
import {
  type ArenaEvent,
  type ArenaRecord,
  arenaReducer,
  type BatchEvent,
  batchReducer,
  initialArenaState,
  initialBatchState,
  type SideResult,
} from "../lib/arena";

const TX = "0.0.9185802@1794007412.096112920";

const result = (side: SideResult["side"], over: Partial<SideResult> = {}): SideResult => ({
  side,
  prompt: `listings shown to ${side}`,
  decision: { option: 1, reason: `${side} reason`, signalsUsed: ["category"] },
  llm: { model: "claude-haiku-5-5", costUsd: 0.0004, ms: 4000, raw: `{"option":1} from ${side}` },
  pick: { id: 1, name: "unit-convert", endpoint: "http://127.0.0.1:1/call", pricePerCall: "1" },
  policy: { allowed: true, checks: [{ rule: "budget", pass: true, detail: "0 spent + 1 ≤ 100 tinybars" }] },
  payment: { txId: TX, paid: true, tinybars: "1" },
  response: { result: 300, unit: "cm" },
  verdict: { correct: true, expected: { result: 300, unit: "cm" }, actual: { result: 300, unit: "cm" }, note: "ok" },
  outcome: "correct",
  wastedTinybars: "0",
  error: null,
  ...over,
});

const record = (baseline: SideResult, skeptique: SideResult): ArenaRecord => ({
  version: 2,
  runId: "r1",
  at: "2026-11-07T00:00:00.000Z",
  prompt: "Convert 3 metres to centimetres",
  task: null,
  model: "claude-haiku-5-5",
  systemPrompt: "system",
  network: "hedera:testnet",
  sides: { baseline, skeptique },
  provenance: "local-chain",
  taskSource: "preset",
  agents: {
    baseline: { payer: "0.0.111", policy: { budgetTinybars: "100", maxPerCallTinybars: "50", evidence: null } },
    skeptique: {
      payer: "0.0.222",
      policy: { budgetTinybars: "100", maxPerCallTinybars: "50", evidence: { minMedian: 70, minRounds: 1 } },
    },
  },
  seed: "s1",
  options: [
    { option: 1, serviceId: 2 },
    { option: 2, serviceId: 1 },
  ],
});

/** Rendered HTML without React's text-split comments, so assertions read like the page. */
const render = (element: ReactElement) => renderToString(element).replaceAll("<!-- -->", "");

const run = (events: ArenaEvent[]) => events.reduce(arenaReducer, initialArenaState);

describe("arenaReducer", () => {
  it("fills each side step by step and finishes with the record and hash", () => {
    const baseline = result("baseline", {
      pick: { id: 2, name: "suite-gamer", endpoint: "x", pricePerCall: "1" },
      outcome: "wrong",
      verdict: { correct: false, expected: { result: 300, unit: "cm" }, actual: { result: 30 }, note: "off" },
      response: { result: 30 },
      wastedTinybars: "1",
    });
    const skeptique = result("skeptique");
    const started = run([{ type: "run-started", runId: "r1", task: null, prompt: "Convert 3 metres to centimetres" }]);
    expect(started.status).toBe("running");

    const mid = [
      { type: "decided", side: "skeptique", decision: skeptique.decision },
      { type: "policy", side: "skeptique", allowed: true, checks: skeptique.policy?.checks ?? [] },
      { type: "paid", side: "skeptique", txId: TX, tinybars: "1" },
    ] satisfies ArenaEvent[];
    const partial = mid.reduce(arenaReducer, started);
    expect(partial.sides.skeptique.decided).toBe(true);
    expect(partial.sides.skeptique.payment).toEqual({ txId: TX, tinybars: "1" });
    expect(partial.sides.baseline.decided).toBe(false);
    const html = render(<ArenaRunView state={partial} />);
    expect(html).toContain("✓ deciding");
    expect(html).toContain("… graded");
    expect(html).toContain(`href="https://hashscan.io/testnet/transaction/${TX}"`);

    const done = [
      { type: "graded", side: "skeptique", result: skeptique },
      { type: "decided", side: "baseline", decision: baseline.decision },
      { type: "graded", side: "baseline", result: baseline },
      { type: "run-finished", record: record(baseline, skeptique), hash: "0xabc" },
    ] satisfies ArenaEvent[];
    const final = done.reduce(arenaReducer, partial);
    expect(final.status).toBe("finished");
    expect(final.hash).toBe("0xabc");
    expect(final.sides.baseline.result?.outcome).toBe("wrong");

    const page = render(<ArenaRunView state={final} />);
    expect(page).toContain("Run hash");
    expect(page).toContain("0xabc");
    expect(page).toContain("RFC 8785");
    expect(page).toContain("Download record (JSON)");
    expect(page).toContain("Verify this run");
    expect(page).toContain("payer 0.0.222");
    expect(page).toContain("needs median ≥ 70");
    expect(page).toContain("option 1 = service #2, option 2 = service #1 (seed s1)");
    expect(page).toContain("suite-gamer");
    expect(page).toContain("listings shown to baseline");
    expect(page).toContain('aria-live="polite"');
  });

  it("starts a new run from a clean slate", () => {
    const old = run([
      { type: "run-started", runId: "r1", task: null, prompt: "a" },
      { type: "decided", side: "baseline", decision: null, error: "boom" },
      { type: "run-started", runId: "r2", task: null, prompt: "b" },
    ]);
    expect(old.runId).toBe("r2");
    expect(old.sides.baseline.decideError).toBeNull();
  });

  it("marks a failed run and shows its error", () => {
    const state = run([
      { type: "run-started", runId: "r1", task: null, prompt: "a" },
      { type: "run-failed", error: "GET /services responded 503" },
    ]);
    expect(state.status).toBe("failed");
    const html = render(<ArenaRunView state={state} />);
    expect(html).toContain("Run failed: GET /services responded 503");
    expect(html).toContain("– deciding");
  });

  it("shows an agent error plainly, from the decided event and from the graded result", () => {
    const error = "agent: claude CLI exited 1";
    const decided = run([
      { type: "run-started", runId: "r1", task: null, prompt: "a" },
      { type: "decided", side: "baseline", decision: null, error },
    ]);
    expect(render(<ArenaRunView state={decided} />)).toContain(`Error: ${error}`);

    const graded = arenaReducer(decided, {
      type: "graded",
      side: "baseline",
      result: result("baseline", {
        decision: null,
        llm: null,
        pick: null,
        policy: null,
        payment: null,
        response: null,
        verdict: null,
        outcome: "error",
        error,
      }),
    });
    const html = render(<ArenaRunView state={graded} />);
    expect(html).toContain(`Error: ${error}`);
    expect(html).toContain("arena-tone-bad");
  });

  it("shows a refusal as a neutral 'no answer', not as a win", () => {
    const refused = result("baseline", {
      decision: { option: null, reason: "nothing looks reliable", signalsUsed: [] },
      pick: null,
      policy: null,
      payment: null,
      response: null,
      verdict: null,
      outcome: "refused",
    });
    const state = run([
      { type: "run-started", runId: "r1", task: null, prompt: "a" },
      { type: "graded", side: "baseline", result: refused },
      { type: "graded", side: "skeptique", result: result("skeptique") },
      { type: "run-finished", record: record(refused, result("skeptique")), hash: "0xabc" },
    ]);
    const html = render(<ArenaRunView state={state} />);
    expect(html).toContain("Buy nothing.");
    expect(html).toContain('class="arena-badge arena-tone-none">no answer (refused)');
    expect(html).toContain('<td class="arena-tone-none">no answer (refused)</td>');
    expect(html).toContain('<td class="arena-tone-good">yes</td>');
  });

  it("accepts the older decision shape with serviceId", () => {
    const state = run([
      { type: "run-started", runId: "r1", task: null, prompt: "a" },
      { type: "decided", side: "skeptique", decision: { serviceId: 2, reason: "old", signalsUsed: [] } },
    ]);
    expect(render(<ArenaRunView state={state} />)).toContain("Option 2.");
  });
});

describe("batchReducer", () => {
  const score = (correct: number, share: number | null) => ({
    correct,
    answeredCorrect: correct,
    noAnswer: 0,
    wrong: 2 - correct,
    refused: 0,
    blocked: 0,
    error: 0,
    totalTinybars: "2",
    wastedTinybars: String(2 - correct),
    paidToCorrectShare: share,
  });

  it("counts tasks and ends with the scoreboard and batch hash", () => {
    const events: BatchEvent[] = [
      {
        type: "batch-started",
        batchId: "b1",
        tasks: [
          { id: "a", prompt: "a" },
          { id: "b", prompt: "b" },
        ],
      },
      { type: "batch-task", batchId: "b1", index: 0, taskId: "a", runId: "r1", hash: "0x1" },
    ];
    const mid = events.reduce(batchReducer, initialBatchState);
    expect(mid).toMatchObject({ status: "running", total: 2, done: 1 });
    expect(render(<BatchView batch={mid} />)).toContain("1 of 2 tasks done");

    const done = batchReducer(mid, {
      type: "batch-finished",
      batchId: "b1",
      scoreboard: { tasks: 2, sides: { baseline: score(1, 0.5), skeptique: score(2, 1) } },
      runHashes: ["0x1", "0x2"],
      hash: "0xbatch",
    });
    const html = render(<BatchView batch={done} />);
    expect(html).toContain("0xbatch");
    expect(html).toContain("1 of 2");
    expect(html).toContain("50%");
    expect(html).toContain("100%");
  });

  it("shows a failed batch", () => {
    const state = batchReducer(initialBatchState, { type: "batch-failed", batchId: "b1", error: "wallet empty" });
    expect(render(<BatchView batch={state} />)).toContain("Benchmark failed: wallet empty");
  });
});
