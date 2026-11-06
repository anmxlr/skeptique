"use client";

import { hashscanTxUrl } from "@skeptique/shared";
import { type FormEvent, useEffect, useReducer, useState } from "react";
import {
  ARENA_EVENTS,
  type ArenaEvent,
  type ArenaHealth,
  type ArenaRecord,
  type ArenaState,
  type ArenaTask,
  arenaReducer,
  arenaUrl,
  BATCH_EVENTS,
  type BatchEvent,
  type BatchState,
  type BuyMode,
  batchReducer,
  initialArenaState,
  initialBatchState,
  pickedOption,
  type Side,
  type SideResult,
  type SideState,
} from "../lib/arena";

const SIDES: { side: Side; title: string }[] = [
  { side: "baseline", title: "Without Skeptique" },
  { side: "skeptique", title: "With Skeptique" },
];

const STEPS = ["deciding", "policy", "paying", "graded"] as const;
const STEP_MARK = { done: "✓", skipped: "–", pending: "…" } as const;

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? "undefined";

export type HealthState =
  | { status: "loading" }
  | { status: "offline"; message: string }
  | { status: "ok"; health: ArenaHealth };

export function ArenaHeader({ health }: { health: HealthState }) {
  return (
    <section className="arena-panel" aria-labelledby="arena-setup">
      <h2 id="arena-setup">The setup</h2>
      <table className="arena-table">
        <caption className="visually-hidden">What the two agents share and what differs</caption>
        <thead>
          <tr>
            <th scope="col">Same for both</th>
            <th scope="col">Different</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Model, system prompt, task, budget, services, Hedera testnet payments</td>
            <td>The evidence shown (popularity only, or stake-backed reviews too) and the spend policy</td>
          </tr>
        </tbody>
      </table>
      {health.status === "loading" && <p>Checking the arena server…</p>}
      {health.status === "offline" && (
        <p role="alert" className="notice-error">
          Arena server offline at {arenaUrl()}: {health.message}
        </p>
      )}
      {health.status === "ok" && (
        <dl className="arena-stats">
          <dt>Model</dt>
          <dd>{health.health.model}</dd>
          <dt>Network</dt>
          <dd>{health.health.network}</dd>
          <dt>Provenance</dt>
          <dd>
            {health.health.provenance ?? "unknown"}
            {health.health.provenance === "local-chain" &&
              " (review rounds ran on a local chain; payments are real Hedera testnet)"}
          </dd>
          {Object.entries(health.health.paywall ?? {}).map(([name, status]) => (
            <div key={name} className="arena-stat-row">
              <dt>Paywall: {name}</dt>
              <dd>{status}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function stepState(side: SideState, step: (typeof STEPS)[number], runOver: boolean): keyof typeof STEP_MARK {
  const reached = { deciding: side.decided, policy: side.policy !== null, paying: side.payment !== null };
  if (step === "graded") return side.result ? "done" : runOver ? "skipped" : "pending";
  if (reached[step]) return "done";
  return side.result || runOver ? "skipped" : "pending";
}

function TxLink({ txId }: { txId: string }) {
  const href = hashscanTxUrl(txId);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {txId}
    </a>
  ) : (
    <code>{txId}</code>
  );
}

export function SideColumn({ title, side, runOver }: { title: string; side: SideState; runOver: boolean }) {
  const { result } = side;
  const decision = result?.decision ?? side.decision;
  const policy = result?.policy ?? side.policy;
  const payment = result?.payment ?? side.payment;
  const error = result?.error ?? side.decideError;
  return (
    <section className="arena-card" aria-label={title}>
      <h2>{title}</h2>
      <ol className="arena-steps">
        {STEPS.map((step) => {
          const status = stepState(side, step, runOver);
          return (
            <li key={step} className={`arena-step-${status}`}>
              {STEP_MARK[status]} {step}
              <span className="visually-hidden"> ({status})</span>
            </li>
          );
        })}
      </ol>
      {result && (
        <p className={`arena-badge arena-tone-${DELIVERED[result.outcome].tone}`}>{DELIVERED[result.outcome].text}</p>
      )}
      {error && (
        <p role="alert" className="notice-error">
          Error: {error}
        </p>
      )}
      {decision && (
        <>
          <h3>Decision</h3>
          <p>
            {pickedOption(decision) === null ? "Buy nothing." : `Option ${pickedOption(decision)}.`} {decision.reason}
          </p>
          <p className="arena-muted">Signals used: {decision.signalsUsed.join(", ") || "none"}</p>
        </>
      )}
      {result?.pick && (
        <p>
          Picked <strong>{result.pick.name}</strong> at {result.pick.pricePerCall} tinybars per call
        </p>
      )}
      {policy && (
        <>
          <h3>Spend policy: {policy.allowed ? "allowed" : "blocked"}</h3>
          <ul className="arena-checks">
            {policy.checks.map((check) => (
              <li key={check.rule}>
                <span aria-hidden="true">{check.pass ? "✓" : "✗"}</span>
                <span className="visually-hidden">{check.pass ? "pass" : "fail"}</span> {check.rule}: {check.detail}
              </li>
            ))}
          </ul>
        </>
      )}
      {payment && (
        <>
          <h3>Payment</h3>
          <p>
            {payment.tinybars} tinybars{" "}
            {payment.txId ? <TxLink txId={payment.txId} /> : <span>(no transaction id)</span>}
          </p>
        </>
      )}
      {result && (
        <>
          <h3>Response vs oracle</h3>
          <div className="arena-compare">
            <div>
              <p className="arena-muted">Service returned</p>
              <pre className="arena-pre">{json(result.response)}</pre>
            </div>
            <div>
              <p className="arena-muted">Oracle expected</p>
              <pre className="arena-pre">{json(result.verdict?.expected ?? null)}</pre>
            </div>
          </div>
          {result.verdict && <p className="arena-muted">{result.verdict.note}</p>}
          <p>Wasted: {result.wastedTinybars} tinybars</p>
        </>
      )}
    </section>
  );
}

/** "Correct answer delivered" is the headline; refusing or being blocked is "no answer", never a win by itself. */
const DELIVERED: Record<SideResult["outcome"], { text: string; tone: "good" | "bad" | "none" }> = {
  correct: { text: "correct answer delivered", tone: "good" },
  wrong: { text: "wrong answer", tone: "bad" },
  error: { text: "error", tone: "bad" },
  refused: { text: "no answer (refused)", tone: "none" },
  blocked: { text: "no answer (blocked by policy)", tone: "none" },
};

function downloadRecord(record: ArenaRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `arena-${record.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function VerifyRun({ record }: { record: ArenaRecord }) {
  return (
    <div className="arena-verify">
      <h3>Verify this run</h3>
      <dl className="arena-stats">
        <dt>Provenance</dt>
        <dd>{record.provenance ?? "not recorded"}</dd>
        <dt>Task source</dt>
        <dd>{record.taskSource ?? "not recorded"}</dd>
        <dt>Buyer instruction</dt>
        <dd>{record.mode ?? "may-refuse"}</dd>
        {SIDES.map(({ side, title }) => {
          const agent = record.agents?.[side];
          const evidence = agent?.policy.evidence;
          return (
            <div key={side} className="arena-stat-row">
              <dt>{title}</dt>
              <dd>
                {agent
                  ? `payer ${agent.payer}; budget ${agent.policy.budgetTinybars}, max ${agent.policy.maxPerCallTinybars} per call (tinybars); ${
                      evidence
                        ? `needs median ≥ ${evidence.minMedian} over ≥ ${evidence.minRounds} review round(s)`
                        : "no evidence rules"
                    }`
                  : "not recorded"}
              </dd>
            </div>
          );
        })}
        <dt>Option shuffle</dt>
        <dd>
          {record.options
            ? `${record.options.map((o) => `option ${o.option} = service #${o.serviceId}`).join(", ")} (seed ${record.seed})`
            : "not recorded"}
        </dd>
      </dl>
    </div>
  );
}

export function VerdictBar({ record, hash }: { record: ArenaRecord; hash: string }) {
  return (
    <section className="arena-panel" aria-labelledby="arena-verdict">
      <h2 id="arena-verdict">Verdict</h2>
      <div className="arena-scroll">
        <table className="arena-table">
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col">Correct answer delivered?</th>
              <th scope="col">Wasted (tinybars)</th>
              <th scope="col">Paid (tinybars)</th>
              <th scope="col">Vendor paid</th>
            </tr>
          </thead>
          <tbody>
            {SIDES.map(({ side, title }) => {
              const result = record.sides[side];
              const paid = result.payment?.paid ? result.payment.tinybars : "0";
              return (
                <tr key={side}>
                  <th scope="row">{title}</th>
                  <td className={`arena-tone-${DELIVERED[result.outcome].tone}`}>
                    {result.outcome === "correct" ? "yes" : DELIVERED[result.outcome].text}
                  </td>
                  <td>{result.wastedTinybars}</td>
                  <td>{paid}</td>
                  <td>{result.payment?.paid ? (result.pick?.name ?? "unknown") : "none"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Run hash: <code className="arena-hash">{hash}</code>
      </p>
      <p className="arena-muted">The hash is sha256 over the RFC 8785 canonical JSON of the record.</p>
      <VerifyRun record={record} />
      <button type="button" className="arena-button" onClick={() => downloadRecord(record)}>
        Download record (JSON)
      </button>
    </section>
  );
}

export function ArenaRunView({ state }: { state: ArenaState }) {
  const runOver = state.status === "finished" || state.status === "failed";
  return (
    <div aria-live="polite">
      {state.status === "idle" && <p>No run yet. Pick a task and press Run.</p>}
      {state.status === "failed" && (
        <p role="alert" className="notice-error">
          Run failed: {state.error}
        </p>
      )}
      {state.status !== "idle" && (
        <div className="arena-grid">
          {SIDES.map(({ side, title }) => (
            <SideColumn key={side} title={title} side={state.sides[side]} runOver={runOver} />
          ))}
        </div>
      )}
      {state.record && state.hash && <VerdictBar record={state.record} hash={state.hash} />}
      {state.status !== "idle" && (
        <div className="arena-grid">
          {SIDES.map(({ side, title }) => {
            const result = state.sides[side].result;
            return (
              <details key={side} className="arena-card">
                <summary>What this agent saw ({title})</summary>
                {result ? (
                  <>
                    <h3>Prompt</h3>
                    <pre className="arena-pre">{result.prompt}</pre>
                    <h3>Raw model output</h3>
                    <pre className="arena-pre">{result.llm?.raw ?? "(no model output)"}</pre>
                  </>
                ) : (
                  <p>Available once this agent is graded.</p>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BatchView({ batch }: { batch: BatchState }) {
  if (batch.status === "idle") return null;
  return (
    <section className="arena-panel" aria-labelledby="arena-batch" aria-live="polite">
      <h2 id="arena-batch">Task-pack benchmark</h2>
      <p>
        {batch.done} of {batch.total ?? "?"} tasks done{batch.status === "running" && "…"}
      </p>
      {batch.status === "failed" && (
        <p role="alert" className="notice-error">
          Benchmark failed: {batch.error}
        </p>
      )}
      {batch.scoreboard && (
        <div className="arena-scroll">
          <table className="arena-table">
            <caption className="visually-hidden">Scoreboard over {batch.scoreboard.tasks} tasks</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Correct answers delivered</th>
                <th scope="col">Wasted (tinybars)</th>
                <th scope="col">Wrong</th>
                <th scope="col">No answer (refused or blocked)</th>
                <th scope="col">Error</th>
                <th scope="col">Paid (tinybars)</th>
                <th scope="col">Paid share to correct</th>
              </tr>
            </thead>
            <tbody>
              {SIDES.map(({ side, title }) => {
                const score = batch.scoreboard?.sides[side];
                if (!score) return null;
                return (
                  <tr key={side}>
                    <th scope="row">{title}</th>
                    <td className="arena-tone-good">
                      {score.answeredCorrect} of {batch.scoreboard?.tasks}
                    </td>
                    <td>{score.wastedTinybars}</td>
                    <td>{score.wrong}</td>
                    <td className="arena-tone-none">{score.noAnswer}</td>
                    <td>{score.error}</td>
                    <td>{score.totalTinybars}</td>
                    <td>
                      {score.paidToCorrectShare === null
                        ? "nothing paid"
                        : `${Math.round(score.paidToCorrectShare * 100)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {batch.hash && (
        <p>
          Batch hash: <code className="arena-hash">{batch.hash}</code>
        </p>
      )}
    </section>
  );
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Streams events from the arena until `end` says the stream is over; reports a stream that will not reconnect. */
function listen<E extends { type: string }>(
  path: string,
  types: readonly string[],
  onEvent: (event: E) => void,
  end: (event: E) => boolean,
  onLost: () => void,
) {
  const source = new EventSource(new URL(path, arenaUrl()));
  for (const type of types)
    source.addEventListener(type, (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as E;
      onEvent(event);
      if (end(event)) source.close();
    });
  // The browser retries dropped streams (the server replays every event); a CLOSED source will not come back.
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) onLost();
  };
  return () => source.close();
}

async function post(path: string, body: unknown): Promise<Record<string, string>> {
  const res = await fetch(new URL(path, arenaUrl()), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 409) throw new Error("another run is in progress on the arena server; try again shortly");
  if (!res.ok) throw new Error(json.error ?? `POST ${path} responded ${res.status}`);
  return json;
}

/** Runs one task through both buyer agents on the arena server and shows the events live. */
export function Arena() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [tasks, setTasks] = useState<ArenaTask[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<BuyMode>("may-refuse");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [state, dispatch] = useReducer(arenaReducer, initialArenaState);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, dispatchBatch] = useReducer(batchReducer, initialBatchState);

  useEffect(() => {
    let active = true;
    const get = async <T,>(path: string): Promise<T> => {
      const res = await fetch(new URL(path, arenaUrl()));
      if (!res.ok) throw new Error(`GET ${path} responded ${res.status}`);
      return res.json();
    };
    get<ArenaHealth>("/health").then(
      (h) => active && setHealth({ status: "ok", health: h }),
      (error) => active && setHealth({ status: "offline", message: errorText(error) }),
    );
    get<ArenaTask[]>("/tasks").then(
      (t) => active && setTasks(t),
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!runId) return;
    return listen<ArenaEvent>(
      `/runs/${runId}/events`,
      ARENA_EVENTS,
      dispatch,
      (event) => event.type === "run-finished" || event.type === "run-failed",
      () => dispatch({ type: "run-failed", error: "lost the connection to the arena event stream" }),
    );
  }, [runId]);

  useEffect(() => {
    if (!batchId) return;
    return listen<BatchEvent>(
      `/batches/${batchId}/events`,
      BATCH_EVENTS,
      dispatchBatch,
      (event) => event.type === "batch-finished" || event.type === "batch-failed",
      () => dispatchBatch({ type: "batch-failed", batchId, error: "lost the connection to the arena event stream" }),
    );
  }, [batchId]);

  const running = submitting || state.status === "running" || batch.status === "running";

  async function start(action: () => Promise<void>) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await action();
    } catch (error) {
      setSubmitError(errorText(error));
    } finally {
      setSubmitting(false);
    }
  }

  function run(event: FormEvent) {
    event.preventDefault();
    start(async () => {
      const { runId } = await post("/runs", { prompt, mode });
      dispatch({ type: "run-started", runId, task: null, prompt });
      setRunId(runId);
    });
  }

  function runBatch() {
    start(async () => {
      const { batchId } = await post("/batches", { mode });
      dispatchBatch({ type: "batch-started", batchId, tasks: [] });
      setBatchId(batchId);
    });
  }

  return (
    <>
      <ArenaHeader health={health} />
      <form className="arena-panel" onSubmit={run}>
        <label htmlFor="arena-prompt">Task</label>
        <div className="arena-input-row">
          <input
            id="arena-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Convert 3 metres to centimetres"
            minLength={3}
            maxLength={300}
            required
          />
          <button type="submit" className="arena-button" disabled={running || health.status !== "ok"}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
        <fieldset className="arena-mode">
          <legend>Buyer instruction (same for both agents)</legend>
          <label>
            <input
              type="radio"
              name="arena-mode"
              checked={mode === "may-refuse"}
              onChange={() => setMode("may-refuse")}
            />{" "}
            May refuse: buying nothing is allowed
          </label>{" "}
          <label>
            <input type="radio" name="arena-mode" checked={mode === "must-buy"} onChange={() => setMode("must-buy")} />{" "}
            Must buy: the user needs an answer
          </label>
        </fieldset>
        {tasks.length > 0 && (
          <ul className="arena-chips" aria-label="Preset tasks">
            {tasks.map((task) => (
              <li key={task.id}>
                <button type="button" className="arena-chip" title={task.why} onClick={() => setPrompt(task.prompt)}>
                  {task.prompt}
                  <small>{task.why}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="arena-batch-row">
          <button
            type="button"
            className="arena-button"
            onClick={runBatch}
            disabled={running || health.status !== "ok"}
          >
            Run the task pack (benchmark)
          </button>{" "}
          <span className="arena-muted">
            Every preset task, both agents; each paid call spends real testnet tinybars.
          </span>
        </p>
        {submitError && (
          <p role="alert" className="notice-error">
            Could not start: {submitError}
          </p>
        )}
      </form>
      <BatchView batch={batch} />
      <ArenaRunView state={state} />
    </>
  );
}
