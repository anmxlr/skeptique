import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArenaRunView, BatchView, KeysForm, KeysPill, MoneyMeter } from "../components/arena";
import {
  type ArenaEvent,
  type ArenaRecord,
  answerText,
  arenaReducer,
  type BatchEvent,
  batchReducer,
  type Credentials,
  credentialsBody,
  initialArenaState,
  initialBatchState,
  type PartResult,
  type SideResult,
  type SubTask,
  type Task,
  taskLabel,
  validateCredentials,
} from "../lib/arena";

const TX = "0.0.9185802@1794007412.096112920";
const MI_KM: SubTask = { category: "conversion", input: { value: 26.2, from: "mi", to: "km" } };
const USD_EUR: SubTask = { category: "currency-conversion", input: { amount: 100, from: "USD", to: "EUR" } };
const F_C: SubTask = { category: "conversion", input: { value: 451, from: "F", to: "C" } };

const FX_WRONG = { from: "USD", to: "EUR", amount: 100, rate: 0.01, converted: 1 };

const part = (index: number, task: SubTask, over: Partial<PartResult> = {}): PartResult => ({
  part: index,
  task,
  option: 1,
  pick: { option: 1, id: 1, name: "unit-convert", endpoint: "http://127.0.0.1:1/call", pricePerCall: "5" },
  policy: { allowed: true, checks: [{ rule: "budget", pass: true, detail: "ok" }] },
  payment: { txId: TX, paid: true, tinybars: "5" },
  response: { result: 42.1648128, unit: "km" },
  verdict: {
    correct: true,
    expected: { result: 42.1648128, unit: "km" },
    actual: { result: 42.1648128, unit: "km" },
    note: "",
  },
  outcome: "correct",
  error: null,
  ...over,
});

const wrongPart = (index: number, task: SubTask) =>
  part(index, task, {
    pick: { option: 2, id: 2, name: "suite-gamer", endpoint: "x", pricePerCall: "5" },
    response: FX_WRONG,
    verdict: { correct: false, expected: { converted: 92, to: "EUR" }, actual: FX_WRONG, note: "" },
    outcome: "wrong",
  });

const blockedPart = (index: number, task: SubTask) =>
  part(index, task, {
    pick: { option: 2, id: 2, name: "suite-gamer", endpoint: "x", pricePerCall: "5" },
    policy: { allowed: false, checks: [{ rule: "evidence", pass: false, detail: "score 40 < 70" }] },
    payment: null,
    response: null,
    verdict: null,
    outcome: "blocked",
  });

const side = (name: SideResult["side"], parts: PartResult[], over: Partial<SideResult> = {}): SideResult => {
  const paid = parts.filter((p) => p.payment?.paid).length * 5;
  const wasted = parts.filter((p) => p.payment?.paid && p.outcome !== "correct").length * 5;
  const correct = parts.filter((p) => p.outcome === "correct").length;
  return {
    side: name,
    prompt: `listings shown to ${name}`,
    decision: {
      choices: parts.map((p) => ({ part: p.part, option: p.option })),
      reason: `${name} reason`,
      signalsUsed: [],
    },
    llm: { model: "claude-haiku-5-5", costUsd: null, ms: 1, raw: "{}" },
    parts,
    correctParts: correct,
    totalParts: parts.length,
    paidTinybars: String(paid),
    wastedTinybars: String(wasted),
    outcome: correct === parts.length ? "correct" : correct > 0 ? "partial" : "wrong",
    error: null,
    ...over,
  };
};

const record = (baseline: SideResult, skeptique: SideResult): ArenaRecord => ({
  version: 3,
  runId: "r1",
  prompt: "26.2 mi to km, 100 USD to EUR, 451 F to C",
  mode: "may-refuse",
  model: "claude-haiku-5-5",
  credentialSource: "user",
  agents: {
    baseline: { payer: "0.0.111", policy: { budgetTinybars: "100", maxPerCallTinybars: "50", evidence: null } },
    skeptique: {
      payer: "0.0.222",
      policy: { budgetTinybars: "100", maxPerCallTinybars: "50", evidence: { minMedian: 70, minRounds: 1 } },
    },
  },
  seed: "s1",
  options: [{ option: 1, serviceId: 2 }],
  sides: { baseline, skeptique },
});

const render = (element: ReactElement) => renderToString(element).replaceAll("<!-- -->", "");
const run = (events: ArenaEvent[]) => events.reduce(arenaReducer, initialArenaState);
const TASK: Task = { kind: "tasks", parts: [MI_KM, USD_EUR, F_C] };

describe("display helpers", () => {
  it("labels parts in short form", () => {
    expect(taskLabel(MI_KM)).toBe("26.2 mi → km");
    expect(taskLabel(USD_EUR)).toBe("100 USD → EUR");
    expect(taskLabel(F_C)).toBe("451 °F → °C");
  });
});

describe("arenaReducer", () => {
  it("adds part results as they arrive, in part order, then finishes with the record", () => {
    const started = run([{ type: "run-started", runId: "r1", task: TASK, prompt: "p" }]);
    expect(started.status).toBe("running");
    expect(render(<ArenaRunView state={started} />)).toContain("0/3");

    const baselineParts = [part(0, MI_KM), wrongPart(1, USD_EUR), part(2, F_C)];
    const skeptiqueParts = [part(0, MI_KM), blockedPart(1, USD_EUR), part(2, F_C)];
    const mid = (
      [
        { type: "decided", side: "baseline", decision: side("baseline", baselineParts).decision },
        { type: "part", side: "baseline", part: 1, result: baselineParts[1] },
        { type: "part", side: "baseline", part: 0, result: baselineParts[0] },
        { type: "part", side: "baseline", part: 0, result: baselineParts[0] },
      ] satisfies ArenaEvent[]
    ).reduce(arenaReducer, started);
    expect(mid.sides.baseline.parts.map((p) => p.part)).toEqual([0, 1]);
    expect(mid.sides.skeptique.parts).toEqual([]);
    const live = render(<ArenaRunView state={mid} />);
    expect(live).toContain("1/3");
    expect(live).toContain("26.2 mi → km");
    expect(live).toContain("arena-step-done");
    expect(live).toContain("arena-part-skeleton");

    const baseline = side("baseline", baselineParts);
    const skeptique = side("skeptique", skeptiqueParts, { outcome: "partial" });
    const final = (
      [
        { type: "graded", side: "baseline", result: baseline },
        { type: "graded", side: "skeptique", result: skeptique },
        { type: "run-finished", record: record(baseline, skeptique), hash: "0xabc" },
      ] satisfies ArenaEvent[]
    ).reduce(arenaReducer, mid);
    expect(final.status).toBe("finished");
    expect(final.sides.baseline.parts).toHaveLength(3);

    const page = render(<ArenaRunView state={final} />);
    expect(page).toContain("2/3");
    expect(page).toContain("Partly correct");
    expect(page).toContain("100 USD → EUR");
    expect(page).toContain("suite-gamer");
    expect(page).toContain("got <strong>1 EUR</strong> · right: 92 EUR");
    expect(page).toContain("evidence: score 40 &lt; 70");
    expect(page).toContain(`href="https://hashscan.io/testnet/transaction/${TX}"`);
    expect(page).toContain("Spent 15 tinybars: 10 paid for correct, 5 wasted on wrong");
    expect(page).toContain("Verdict");
    expect(page).toContain("Paid for a correct answer?");
    expect(page).toContain("Download proof (JSON)");
    expect(page).toContain("0xabc");
    expect(page).toContain("Verify this run");
    expect(page).toContain("payer 0.0.222");
    expect(page).toContain("your keys");
    expect(page).toContain("listings shown to baseline");
    expect(page).toContain('aria-live="polite"');
  });

  it("starts a new run from a clean slate", () => {
    const state = run([
      { type: "run-started", runId: "r1", task: TASK, prompt: "a" },
      { type: "part", side: "baseline", part: 0, result: part(0, MI_KM) },
      { type: "decided", side: "baseline", decision: null, error: "boom" },
      { type: "run-started", runId: "r2", task: null, prompt: "b" },
    ]);
    expect(state.runId).toBe("r2");
    expect(state.sides.baseline.decideError).toBeNull();
    expect(state.sides.baseline.parts).toEqual([]);
  });

  it("marks a failed run", () => {
    const state = run([
      { type: "run-started", runId: "r1", task: TASK, prompt: "a" },
      { type: "run-failed", error: "GET /services responded 503" },
    ]);
    expect(state.status).toBe("failed");
    expect(state.error).toBe("GET /services responded 503");
  });

  it("shows an agent error and a refusal as text with an icon, not colour alone", () => {
    const error = "agent: claude CLI exited 1";
    const decided = run([
      { type: "run-started", runId: "r1", task: TASK, prompt: "a" },
      { type: "decided", side: "baseline", decision: null, error },
    ]);
    expect(render(<ArenaRunView state={decided} />)).toContain(error);

    const refused = side(
      "skeptique",
      [part(0, MI_KM, { option: null, pick: null, payment: null, verdict: null, outcome: "refused" })],
      {
        outcome: "refused",
      },
    );
    const html = render(
      <ArenaRunView state={arenaReducer(decided, { type: "graded", side: "skeptique", result: refused })} />,
    );
    expect(html).toContain("Bought nothing");
    expect(html).toContain("arena-tone-none");
    expect(html).toContain("Spent nothing");
  });

  it("shows the converted amount for an FX answer, not the input amount", () => {
    const fx = { from: "USD", to: "EUR", amount: 120, rate: 0.92, converted: 110.4 };
    expect(answerText(fx)).toBe("110.4 EUR");
    expect(answerText({ result: 42.1648128, unit: "km" })).toBe("42.164813 km");
    const fxTask: SubTask = { category: "currency-conversion", input: { amount: 120, from: "USD", to: "EUR" } };
    const fxPart = part(0, fxTask, {
      response: fx,
      verdict: { correct: true, expected: { converted: 110.4 }, actual: fx, note: "" },
    });
    const html = render(
      <ArenaRunView
        state={run([
          { type: "run-started", runId: "r1", task: TASK, prompt: "p" },
          { type: "part", side: "baseline", part: 0, result: fxPart },
        ])}
      />,
    );
    expect(html).toContain("got <strong>110.4 EUR</strong>");
    expect(html).not.toContain("got <strong>120");
  });

  it("fills side results from the record and shows a neutral verdict for an unsupported task", () => {
    const task: Task = { kind: "unsupported", reason: "no oracle for weather" };
    const refused = (name: SideResult["side"]) =>
      side(name, [], { decision: null, outcome: "refused", error: "unsupported task: no oracle for weather" });
    const state = run([
      { type: "run-started", runId: "r1", task, prompt: "a" },
      {
        type: "run-finished",
        record: { ...record(refused("baseline"), refused("skeptique")), task },
        hash: "0xabc",
      },
    ]);
    expect(state.sides.baseline.result?.outcome).toBe("refused");
    expect(state.sides.skeptique.result?.outcome).toBe("refused");
    const html = render(<ArenaRunView state={state} />);
    expect(html).toContain("Bought nothing");
    expect(html).toContain("Not supported: no oracle for weather");
    expect(html).not.toContain("Correct parts");
    expect(html).not.toContain("0/0");
    expect(html).toContain("0xabc");
  });

  it("explains an unsupported task", () => {
    const state = run([
      { type: "run-started", runId: "r1", task: { kind: "unsupported", reason: "no oracle for weather" }, prompt: "a" },
    ]);
    expect(render(<ArenaRunView state={state} />)).toContain("no oracle for weather");
  });
});

describe("money meter", () => {
  it("splits spend into paid-for-correct and wasted, with an accessible name", () => {
    const html = render(<MoneyMeter paid="10" wasted="4" />);
    expect(html).toContain('aria-label="Spent 10 tinybars: 6 paid for correct, 4 wasted on wrong"');
    expect(html).toContain("arena-seg-correct");
    expect(html).toContain("arena-seg-wasted");
  });
});

describe("user keys", () => {
  const good: Credentials = {
    hederaAccountId: "0.0.12345",
    hederaPrivateKey: `0x${"ab".repeat(32)}`,
    anthropicApiKey: "sk-ant-secret-value-0001",
    model: "claude-sonnet-5-5",
  };

  it("accepts valid keys and rejects a bad account id, key and model", () => {
    expect(validateCredentials(good)).toEqual({});
    expect(validateCredentials({ ...good, anthropicApiKey: "" })).toEqual({});
    const errors = validateCredentials({
      hederaAccountId: "12345",
      hederaPrivateKey: "nope",
      anthropicApiKey: "sk-openai",
      model: "claude-opus-5-5" as Credentials["model"],
    });
    expect(Object.keys(errors).sort()).toEqual(["anthropicApiKey", "hederaAccountId", "hederaPrivateKey", "model"]);
  });

  it("shows a bad account id error in the keys panel, offering only Haiku and Sonnet", () => {
    const draft = { ...good, hederaAccountId: "abc" };
    const html = render(<KeysForm draft={draft} errors={validateCredentials(draft)} />);
    expect(html).toContain("Use the form 0.0.12345.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('type="password"');
    expect(html.match(/<option /g)).toHaveLength(2);
    expect(html).toContain("Claude Haiku 5.5");
    expect(html).toContain("Claude Sonnet 5.5");
  });

  it("drops a blank Anthropic key from the POST body and defaults the model", () => {
    expect(credentialsBody({ hederaAccountId: " 0.0.1 ", hederaPrivateKey: "ab", anthropicApiKey: " " })).toEqual({
      hederaAccountId: "0.0.1",
      hederaPrivateKey: "ab",
      model: "claude-haiku-5-5",
    });
  });

  it("never renders secrets: only the account id appears after a run with user keys", () => {
    const baseline = side("baseline", [part(0, MI_KM)]);
    const skeptique = side("skeptique", [part(0, MI_KM)]);
    const state = run([
      { type: "run-started", runId: "r1", task: TASK, prompt: "p" },
      { type: "graded", side: "baseline", result: baseline },
      { type: "graded", side: "skeptique", result: skeptique },
      { type: "run-finished", record: record(baseline, skeptique), hash: "0xabc" },
    ]);
    const html = render(
      <>
        <KeysPill credentials={good} />
        <ArenaRunView state={state} />
      </>,
    );
    expect(html).toContain("Using your keys · 0.0.12345");
    expect(html).not.toContain(good.hederaPrivateKey);
    expect(html).not.toContain("ab".repeat(32));
    expect(html).not.toContain("sk-ant-secret-value-0001");
  });
});

describe("batchReducer", () => {
  const score = (correctParts: number) => ({
    correctParts,
    totalParts: 6,
    totalTinybars: "30",
    wastedTinybars: String((6 - correctParts) * 5),
  });

  it("shows progress while running and bars plus a table when finished", () => {
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
    const running = render(<BatchView batch={mid} />);
    expect(running).toContain("1 of 2 tasks done");
    expect(running).toContain("<progress");

    const done = batchReducer(mid, {
      type: "batch-finished",
      batchId: "b1",
      scoreboard: { tasks: 2, sides: { baseline: score(3), skeptique: score(6) } },
      runHashes: ["0x1", "0x2"],
      hash: "0xbatch",
    });
    const html = render(<BatchView batch={done} />);
    expect(html).toContain("0xbatch");
    expect(html).toContain('aria-label="Without: 3/6"');
    expect(html).toContain('aria-label="With: 6/6"');
    expect(html).toContain('aria-label="Without: 15"');
    expect(html).toContain("3 of 6");
  });

  it("records a failed batch", () => {
    const state = batchReducer(initialBatchState, { type: "batch-failed", batchId: "b1", error: "wallet empty" });
    expect(state).toMatchObject({ status: "failed", error: "wallet empty" });
  });
});
