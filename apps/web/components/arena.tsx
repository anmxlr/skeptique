"use client";

import { hashscanTxUrl } from "@skeptique/shared";
import { type FormEvent, type ReactNode, type RefObject, useEffect, useReducer, useRef, useState } from "react";
import {
  ARENA_EVENTS,
  type ArenaEvent,
  type ArenaHealth,
  type ArenaRecord,
  type ArenaState,
  type ArenaTask,
  answerText,
  arenaReducer,
  arenaUrl,
  BATCH_EVENTS,
  type BatchEvent,
  type BatchState,
  type BuyMode,
  batchReducer,
  type CredentialErrors,
  type Credentials,
  credentialsBody,
  FIELD_LABEL,
  groundingLine,
  initialArenaState,
  initialBatchState,
  listingFacts,
  listingSeen,
  MODELS,
  type ModelId,
  moneySplit,
  type PartOutcome,
  type PartResult,
  paidForCorrectAnswer,
  type Side,
  type SideOutcome,
  type SideResult,
  type SideState,
  taskLabel,
  validateCredentials,
} from "../lib/arena";
import { Skeleton, Toast } from "./states";

const SIDES: { side: Side; title: string }[] = [
  { side: "baseline", title: "Without Skeptique" },
  { side: "skeptique", title: "With Skeptique" },
];

/* ---------- icons: always paired with text, so colour never carries meaning alone ---------- */

type IconName = "check" | "cross" | "dash" | "shield" | "alert" | "half" | "link" | "key" | "info";
const ICON_PATH: Record<IconName, string> = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  cross: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  dash: "M6 12h12",
  shield: "M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z",
  alert: "M12 7v6M12 16.5v.5",
  half: "M12 4a8 8 0 0 1 0 16z",
  link: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  key: "M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 12v9M12 17h3M12 20h2",
  info: "M12 11v5M12 8v.01",
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`arena-icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(name === "half" || name === "info") && <circle cx="12" cy="12" r="8" fill="none" />}
      <path d={ICON_PATH[name]} fill={name === "half" ? "currentColor" : "none"} />
    </svg>
  );
}

type Tone = "good" | "warn" | "bad" | "none";
const SIDE_OUTCOME: Record<SideOutcome, { text: string; tone: Tone; icon: IconName }> = {
  correct: { text: "All correct", tone: "good", icon: "check" },
  partial: { text: "Partly correct", tone: "warn", icon: "half" },
  wrong: { text: "Wrong", tone: "bad", icon: "cross" },
  refused: { text: "Bought nothing", tone: "none", icon: "dash" },
  blocked: { text: "Blocked by policy", tone: "none", icon: "shield" },
  error: { text: "Error", tone: "bad", icon: "alert" },
};
const PART_OUTCOME: Record<PartOutcome, { text: string; tone: Tone; icon: IconName }> = {
  correct: { text: "correct", tone: "good", icon: "check" },
  wrong: { text: "wrong", tone: "bad", icon: "cross" },
  refused: { text: "skipped", tone: "none", icon: "dash" },
  blocked: { text: "blocked", tone: "none", icon: "shield" },
  error: { text: "error", tone: "bad", icon: "alert" },
};

function Badge({ outcome }: { outcome: SideOutcome }) {
  const o = SIDE_OUTCOME[outcome];
  return (
    <span className={`arena-badge arena-tone-${o.tone}`}>
      <Icon name={o.icon} />
      {o.text}
    </span>
  );
}

function TxLink({ txId }: { txId: string }) {
  const href = hashscanTxUrl(txId);
  if (!href) return null;
  return (
    <a className="arena-tx" href={href} target="_blank" rel="noreferrer" title={`HashScan: ${txId}`}>
      <Icon name="link" />
      <span className="visually-hidden">View payment {txId} on HashScan</span>
    </a>
  );
}

/* ---------- health ---------- */

export type HealthState =
  | { status: "loading" }
  | { status: "offline"; message: string }
  | { status: "ok"; health: ArenaHealth };

function HealthPill({ health }: { health: HealthState }) {
  if (health.status === "loading")
    return (
      <span className="arena-pill" role="status">
        Connecting to the arena…
      </span>
    );
  if (health.status === "offline")
    return (
      <span className="arena-pill arena-tone-bad">
        <Icon name="alert" />
        Arena offline
      </span>
    );
  return (
    <span className="arena-pill arena-tone-good">
      <Icon name="check" />
      Arena online · {health.health.network}
    </span>
  );
}

/* ---------- hero ---------- */

function VersusDiagram() {
  return (
    <svg
      className="arena-vs"
      viewBox="0 0 168 64"
      role="img"
      aria-label="Agent A sees no reviews; agent B sees reviews"
    >
      <g>
        <circle cx="28" cy="28" r="20" className="arena-vs-a" />
        <text x="28" y="34" textAnchor="middle" className="arena-vs-letter">
          A
        </text>
        <text x="28" y="61" textAnchor="middle" className="arena-vs-caption">
          no reviews
        </text>
      </g>
      <text x="84" y="34" textAnchor="middle" className="arena-vs-caption">
        vs
      </text>
      <g>
        <circle cx="140" cy="28" r="20" className="arena-vs-b" />
        <text x="140" y="34" textAnchor="middle" className="arena-vs-letter arena-vs-letter-b">
          B
        </text>
        <path d="M152 6l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V9z" className="arena-vs-shield" />
        <text x="140" y="61" textAnchor="middle" className="arena-vs-caption">
          + reviews
        </text>
      </g>
    </svg>
  );
}

export function ArenaHero({ health }: { health: HealthState }) {
  return (
    <section className="arena-hero" aria-label="What this is">
      <div>
        <p className="arena-lead">Same task. Same AI. One sees Skeptique&apos;s reviews.</p>
        <HealthPill health={health} />
        {health.status === "offline" &&
          (process.env.NEXT_PUBLIC_ARENA_URL ? (
            <p className="arena-muted arena-small">
              The arena server at <code>{arenaUrl()}</code> is not answering.
            </p>
          ) : (
            <p className="arena-muted arena-small">
              The arena is not hosted on this deployment: its agents run on a local server. Run{" "}
              <code>pnpm --filter @skeptique/arena start</code> and this page at localhost to try it.
            </p>
          ))}
      </div>
      <VersusDiagram />
      <details className="arena-details arena-hero-details">
        <summary>How is this fair?</summary>
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
              <td>AI model, instructions, task, budget, vendors (names hidden, order shuffled)</td>
              <td>B also sees stake-backed review scores and follows a spend policy</td>
            </tr>
          </tbody>
        </table>
        <p className="arena-small">
          A fixed calculator, not an AI, grades every answer. Payments are real Hedera testnet.
        </p>
      </details>
    </section>
  );
}

/* ---------- keys ---------- */

export function KeysForm({
  draft,
  errors,
  onChange,
}: {
  draft: Credentials;
  errors: CredentialErrors;
  onChange?: (next: Credentials) => void;
}) {
  const set = (patch: Partial<Credentials>) => onChange?.({ ...draft, ...patch });
  const field = (id: keyof Credentials) => ({
    id: `arena-key-${id}`,
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `arena-key-${id}-error` : undefined,
  });
  const error = (id: keyof Credentials) =>
    errors[id] && (
      <span id={`arena-key-${id}-error`} className="arena-field-error">
        <Icon name="alert" />
        {errors[id]}
      </span>
    );
  return (
    <div className="arena-keys-fields">
      <label htmlFor="arena-key-hederaAccountId">Hedera testnet account ID</label>
      <input
        {...field("hederaAccountId")}
        value={draft.hederaAccountId}
        onChange={(e) => set({ hederaAccountId: e.target.value })}
        placeholder="0.0.12345"
        autoComplete="off"
        spellCheck={false}
      />
      {error("hederaAccountId")}
      <label htmlFor="arena-key-hederaPrivateKey">Hedera private key</label>
      <input
        {...field("hederaPrivateKey")}
        type="password"
        value={draft.hederaPrivateKey}
        onChange={(e) => set({ hederaPrivateKey: e.target.value })}
        autoComplete="new-password"
        spellCheck={false}
      />
      {error("hederaPrivateKey")}
      <label htmlFor="arena-key-anthropicApiKey">
        Anthropic API key <span className="arena-muted">(optional)</span>
      </label>
      <input
        {...field("anthropicApiKey")}
        type="password"
        value={draft.anthropicApiKey ?? ""}
        onChange={(e) => set({ anthropicApiKey: e.target.value })}
        placeholder="Leave blank to use the server's Claude"
        autoComplete="new-password"
        spellCheck={false}
      />
      {error("anthropicApiKey")}
      <label htmlFor="arena-key-model">Model</label>
      <select
        {...field("model")}
        value={draft.model ?? "claude-haiku-5-5"}
        onChange={(e) => set({ model: e.target.value as ModelId })}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {error("model")}
    </div>
  );
}

const EMPTY_DRAFT: Credentials = {
  hederaAccountId: "",
  hederaPrivateKey: "",
  anthropicApiKey: "",
  model: "claude-haiku-5-5",
};

/** Rendered outside the run form: a form nested in another form is invalid HTML and submits the outer one. */
function KeysDialog({
  dialogRef: ref,
  onSave,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onSave: (c: Credentials) => void;
}) {
  const [draft, setDraft] = useState<Credentials>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<CredentialErrors>({});
  const close = () => {
    ref.current?.close();
    setDraft(EMPTY_DRAFT);
    setErrors({});
  };
  function save() {
    const found = validateCredentials(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSave(credentialsBody(draft));
    close();
  }
  return (
    // No <form>: submitting password fields makes browsers offer to save the keys as a login.
    <dialog
      ref={ref}
      className="arena-dialog"
      aria-labelledby="arena-keys-title"
      onClose={close}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) save();
      }}
    >
      <h2 id="arena-keys-title">Use your own keys</h2>
      <KeysForm draft={draft} errors={errors} onChange={setDraft} />
      <p className="arena-small arena-muted">
        Keys are sent only to your local arena server for this run and never stored.
      </p>
      <div className="arena-dialog-actions">
        <button type="button" className="arena-button arena-button-ghost" onClick={close}>
          Cancel
        </button>
        <button type="button" className="arena-button" onClick={save}>
          Use these keys
        </button>
      </div>
    </dialog>
  );
}

/** Shows whose keys a run will use. Only the public account ID is ever rendered. */
export function KeysPill({ credentials, onClear }: { credentials: Credentials; onClear?: () => void }) {
  return (
    <span className="arena-pill arena-tone-good">
      <Icon name="key" />
      Using your keys · {credentials.hederaAccountId}
      <button type="button" className="arena-pill-clear" onClick={onClear}>
        Clear
      </button>
    </span>
  );
}

/* ---------- live result ---------- */

const STEPS = ["choosing", "paying", "checking"] as const;

function StepDots({ side, runOver }: { side: SideState; runOver: boolean }) {
  const done = [
    side.decided || side.result !== null,
    side.parts.length > 0 || side.result !== null,
    side.result !== null,
  ];
  const current = runOver ? -1 : done.indexOf(false);
  return (
    <ol className="arena-steps" aria-label="Progress">
      {STEPS.map((step, i) => {
        const status = done[i] ? "done" : i === current ? "current" : "pending";
        return (
          <li key={step} className={`arena-step arena-step-${status}`}>
            <span className="arena-step-dot" aria-hidden="true" />
            {step}
            <span className="visually-hidden"> ({status})</span>
          </li>
        );
      })}
    </ol>
  );
}

/** What the vendor returned: the oracle's parsed value when it has one, else the raw response. */
function gotText(part: PartResult): string {
  const actual = answerText(part.verdict?.actual);
  return actual === "{}" || actual === "—" ? answerText(part.response) : actual;
}

const tinybars = (n: string) => `${n} ${n === "1" ? "tinybar" : "tinybars"}`;

function PartRow({ part }: { part: PartResult }) {
  const o = PART_OUTCOME[part.outcome];
  const blocked = part.policy && !part.policy.allowed ? part.policy.checks.find((c) => !c.pass) : null;
  const answered = part.outcome === "correct" || part.outcome === "wrong";
  return (
    <li className="arena-part">
      <span className={`arena-part-mark arena-tone-${o.tone}`}>
        <Icon name={o.icon} />
        <span className="visually-hidden">{o.text}</span>
      </span>
      <span className="arena-part-task">{taskLabel(part.task)}</span>
      <span className="arena-part-detail">
        <span className="arena-part-vendor">{part.pick?.name ?? "no vendor"}</span>
        <span className="arena-part-answer">
          {answered ? (
            <>
              got <strong>{gotText(part)}</strong>
              {part.outcome === "wrong" && <> · right: {answerText(part.verdict?.expected)}</>}
            </>
          ) : blocked ? (
            <>
              <Icon name="shield" /> {blocked.rule}: {blocked.detail}
            </>
          ) : part.error ? (
            part.error
          ) : (
            o.text
          )}
        </span>
      </span>
      <span className="arena-part-paid">
        {part.payment?.paid ? tinybars(part.payment.tinybars) : "–"}
        {part.payment?.paid && part.payment.txId && <TxLink txId={part.payment.txId} />}
      </span>
    </li>
  );
}

/** Thin segmented bar: tinybars that bought correct answers vs tinybars wasted on wrong ones. */
export function MoneyMeter({ paid, wasted }: { paid: string; wasted: string }) {
  const split = moneySplit(paid, wasted);
  const pct = (n: bigint) => (split.total === 0n ? 0 : Number((n * 10000n) / split.total) / 100);
  const label =
    split.total === 0n
      ? "Spent nothing"
      : `Spent ${split.total} tinybars: ${split.correct} paid for correct, ${split.wasted} wasted on wrong`;
  return (
    <div className="arena-money">
      <div className="arena-money-bar" role="img" aria-label={label} title={label}>
        {split.correct > 0n && (
          <span className="arena-seg arena-seg-correct" style={{ flexGrow: pct(split.correct) }} />
        )}
        {split.wasted > 0n && <span className="arena-seg arena-seg-wasted" style={{ flexGrow: pct(split.wasted) }} />}
      </div>
      <ul className="arena-legend">
        <li>
          <span className="arena-swatch arena-seg-correct" aria-hidden="true" />
          Paid for correct <strong>{String(split.correct)}</strong>
        </li>
        <li>
          <span className="arena-swatch arena-seg-wasted" aria-hidden="true" />
          Wasted <strong>{String(split.wasted)}</strong>
        </li>
        <li className="arena-muted">tinybars</li>
      </ul>
    </div>
  );
}

function Out({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title}>
      {children}
    </a>
  );
}

const trimmed = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Collapsed corner answering "is the agent making things up?": its data, its reason, and links to check both. */
/** The /services page reads NEXT_PUBLIC_API_URL, so its ids only match this run when the APIs are the same. */
const sameApi = (api: string | null | undefined) =>
  !!api && api.replace(/\/+$/, "") === (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export function SourcesCorner({ result, apiUrl }: { result: SideResult; apiUrl?: string }) {
  const api = apiUrl?.replace(/\/+$/, "");
  const picked = result.parts.filter((p) => p.pick);
  const label = (p: PartResult) => (result.parts.length > 1 ? `${taskLabel(p.task)}: ` : "");
  const g = result.grounding;
  return (
    <details className="arena-details arena-sources">
      <summary>
        <Icon name="info" />
        Where this came from
      </summary>
      <ul className="arena-sources-list">
        {picked.length === 0 && <li>It picked no vendor, so it used no listing.</li>}
        {picked.map((p) => {
          const pick = p.pick as NonNullable<PartResult["pick"]>;
          const row = listingSeen(result.prompt, p.task.category, pick.option);
          const pay = p.payment?.paid && p.payment.txId ? hashscanTxUrl(p.payment.txId) : null;
          const source = p.verdict?.source;
          return (
            <li key={p.part}>
              <span className="arena-sources-row">
                <b>Used</b> {label(p)}
                {row ? listingFacts(row) : `Price: ${tinybars(pick.pricePerCall)}`}
              </span>
              <span className="arena-sources-row arena-sources-links">
                <b>Check</b>
                {sameApi(api) && (
                  <Out
                    href={`/services/${pick.id}`}
                    title="The marketplace page: listing, review rounds and each tester's score"
                  >
                    Listing
                  </Out>
                )}
                {api && (
                  <Out href={`${api}/services/${pick.id}`} title="The listing as raw data">
                    Raw data
                  </Out>
                )}
                {api && result.side === "skeptique" && (
                  <Out href={`${api}/services/${pick.id}/reviews`} title="The test results behind the score">
                    Test results
                  </Out>
                )}
                {pay && (
                  <Out href={pay} title="The payment on HashScan">
                    Payment
                  </Out>
                )}
                {source && (
                  <Out href={source.url} title="Where the right answer comes from">
                    Right answer: {source.label}
                  </Out>
                )}
              </span>
            </li>
          );
        })}
        {result.decision && (
          <li>
            <b>Why</b> {trimmed(result.decision.reason.trim())}
          </li>
        )}
        {g && (
          <li>
            <span className={`arena-yn arena-tone-${g.ok ? "good" : "warn"}`}>
              <Icon name={g.ok ? "check" : "alert"} />
              {groundingLine(g)}
            </span>
            {g.numbers.length + g.signals.length > 0 && (
              <ul className="arena-sources-checks" aria-label="What it quoted">
                {[
                  ...g.numbers.map((n) => ({ key: `n-${n.value}`, text: n.value, found: n.found })),
                  ...g.signals.map((s) => ({
                    key: `s-${s.name}`,
                    text: FIELD_LABEL[s.name] ?? s.name,
                    found: s.found,
                  })),
                ].map((c) => (
                  <li key={c.key}>
                    {c.text} <Icon name={c.found ? "check" : "alert"} />
                    {c.found ? "in its data" : "not in its data"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </details>
  );
}

export function SideCard({
  title,
  side,
  runOver,
  expectedParts,
  apiUrl,
}: {
  title: string;
  side: SideState;
  runOver: boolean;
  expectedParts: number;
  apiUrl?: string;
}) {
  const { result } = side;
  const decision = result?.decision ?? side.decision;
  const parts = result?.parts ?? side.parts;
  const error = result?.error ?? side.decideError;
  const total = result?.totalParts ?? Math.max(expectedParts, parts.length);
  const correct = result?.correctParts ?? parts.filter((p) => p.outcome === "correct").length;
  const paid =
    result?.paidTinybars ??
    String(parts.reduce((sum, p) => sum + (p.payment?.paid ? BigInt(p.payment.tinybars || "0") : 0n), 0n));
  const wasted =
    result?.wastedTinybars ??
    String(
      parts.reduce(
        (sum, p) => sum + (p.payment?.paid && p.outcome !== "correct" ? BigInt(p.payment.tinybars || "0") : 0n),
        0n,
      ),
    );
  const pending = Math.max(0, total - parts.length);
  return (
    <section className={`arena-card arena-card-${result ? "done" : "live"}`} aria-label={title}>
      <header className="arena-card-head">
        <h2>{title}</h2>
        {result ? <Badge outcome={result.outcome} /> : <StepDots side={side} runOver={runOver} />}
      </header>
      <p className="arena-score">
        <span className="arena-score-num">
          {correct}/{total || "?"}
        </span>{" "}
        parts correct
      </p>
      {error && (
        <p className="arena-inline-error">
          <Icon name="alert" />
          {error}
        </p>
      )}
      {parts.length === 0 && !result && !runOver && <Skeleton label={`${title} is working`} count={1} />}
      {parts.length > 0 && (
        <ul className="arena-parts" aria-label="Parts">
          {parts.map((p) => (
            <PartRow key={p.part} part={p} />
          ))}
          {!result &&
            !runOver &&
            Array.from({ length: pending }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders never reorder
              <li key={i} className="arena-part arena-part-skeleton" aria-hidden="true" />
            ))}
        </ul>
      )}
      {(result || parts.length > 0) && <MoneyMeter paid={paid} wasted={wasted} />}
      {decision && (
        <details className="arena-details">
          <summary>Why it chose this</summary>
          <p>{decision.reason}</p>
          <p className="arena-muted arena-small">Signals used: {decision.signalsUsed.join(", ") || "none"}</p>
        </details>
      )}
      {result && (
        <details className="arena-details">
          <summary>What it saw</summary>
          <pre className="arena-pre">{result.prompt}</pre>
        </details>
      )}
      {result && <SourcesCorner result={result} apiUrl={apiUrl} />}
    </section>
  );
}

/* ---------- verdict ---------- */

function downloadRecord(record: ArenaRecord, hash: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ hash, record }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `arena-${record.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function VerifyRun({ record }: { record: ArenaRecord }) {
  return (
    <details className="arena-details">
      <summary>Verify this run</summary>
      <dl className="arena-stats">
        <dt>Model</dt>
        <dd>{record.model ?? "not recorded"}</dd>
        <dt>Keys</dt>
        <dd>
          {record.credentialSource === "user" ? "your keys" : record.credentialSource ? "server keys" : "not recorded"}
        </dd>
        <dt>Buying rule</dt>
        <dd>{record.mode === "must-buy" ? "Must buy" : "Can skip"}</dd>
        <dt>Data source</dt>
        <dd>{record.provenance ?? "not recorded"}</dd>
        {SIDES.map(({ side, title }) => {
          const agent = record.agents?.[side];
          const evidence = agent?.policy.evidence;
          return (
            <div key={side} className="arena-stat-row">
              <dt>{title}</dt>
              <dd>
                {agent
                  ? `payer ${agent.payer}; budget ${agent.policy.budgetTinybars}, max ${agent.policy.maxPerCallTinybars}/call; ${
                      evidence
                        ? `needs score ≥ ${evidence.minMedian} over ≥ ${evidence.minRounds} round(s)`
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
            ? `${record.options.map((o) => `${o.category ? `${o.category} ` : ""}option ${o.option} = service #${o.serviceId}`).join(", ")} (seed ${record.seed})`
            : "not recorded"}
        </dd>
      </dl>
      <p className="arena-small arena-muted">The run hash is sha256 over the RFC 8785 canonical JSON of the record.</p>
    </details>
  );
}

function YesNo({ yes, label, half }: { yes: boolean; label?: string; half?: boolean }) {
  return (
    <span className={`arena-yn arena-tone-${yes ? "good" : half ? "warn" : "bad"}`}>
      <Icon name={yes ? "check" : half ? "half" : "cross"} />
      {label ?? (yes ? "yes" : "no")}
    </span>
  );
}

export function VerdictStrip({ record, hash }: { record: ArenaRecord; hash: string }) {
  const rows: { label: string; cell: (r: SideResult) => ReactNode }[] = [
    {
      label: "Correct parts",
      cell: (r) => (
        <YesNo
          yes={r.correctParts === r.totalParts && r.totalParts > 0}
          half={r.correctParts > 0}
          label={`${r.correctParts}/${r.totalParts}`}
        />
      ),
    },
    {
      label: "Wasted tinybars",
      cell: (r) => <YesNo yes={moneySplit(r.paidTinybars, r.wastedTinybars).wasted === 0n} label={r.wastedTinybars} />,
    },
    { label: "Paid for a correct answer?", cell: (r) => <YesNo yes={paidForCorrectAnswer(r)} /> },
  ];
  return (
    <section className="arena-panel arena-verdict" aria-labelledby="arena-verdict">
      <h2 id="arena-verdict">Verdict</h2>
      {record.task?.kind === "unsupported" ? (
        <p className="arena-yn arena-tone-none">
          <Icon name="dash" />
          Not supported: {record.task.reason}
        </p>
      ) : (
        <div className="arena-scroll">
          <table className="arena-table arena-verdict-table">
            <thead>
              <tr>
                <td />
                {SIDES.map(({ side, title }) => (
                  <th key={side} scope="col">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {SIDES.map(({ side }) => (
                    <td key={side}>{row.cell(record.sides[side])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="arena-verdict-foot">
        <button type="button" className="arena-button" onClick={() => downloadRecord(record, hash)}>
          Download proof (JSON)
        </button>
        <span className="arena-small">
          Run hash <code className="arena-hash">{hash}</code>
        </span>
      </div>
      <VerifyRun record={record} />
    </section>
  );
}

export function ArenaRunView({ state, apiUrl }: { state: ArenaState; apiUrl?: string }) {
  const api = state.record?.marketplace?.apiUrl ?? apiUrl;
  const runOver = state.status === "finished" || state.status === "failed";
  const expectedParts = state.task?.kind === "tasks" ? state.task.parts.length : 0;
  return (
    <div className="arena-run" aria-live="polite">
      {state.status === "idle" && (
        <div className="arena-empty">
          <p>Pick a task and press Run. Both agents will appear here side by side.</p>
        </div>
      )}
      {state.task?.kind === "unsupported" && (
        <p className="arena-inline-error">
          <Icon name="alert" />
          The arena can&apos;t grade this task: {state.task.reason}
        </p>
      )}
      {state.status !== "idle" && (
        <div className="arena-grid">
          {SIDES.map(({ side, title }) => (
            <SideCard
              key={side}
              title={title}
              side={state.sides[side]}
              runOver={runOver}
              expectedParts={expectedParts}
              apiUrl={api}
            />
          ))}
        </div>
      )}
      {state.record && state.hash && <VerdictStrip record={state.record} hash={state.hash} />}
    </div>
  );
}

/* ---------- benchmark ---------- */

/** One horizontal bar chart: one row per agent, one hue, value printed at the bar's end. */
function BarPair({
  title,
  rows,
  max,
  hue,
  format,
}: {
  title: string;
  rows: { label: string; value: number }[];
  max: number;
  hue: "correct" | "wasted";
  format: (v: number) => string;
}) {
  return (
    <figure className="arena-bars">
      <figcaption>{title}</figcaption>
      {rows.map((row) => {
        const text = `${row.label}: ${format(row.value)}`;
        return (
          <div key={row.label} className="arena-bar-row" title={text}>
            <span className="arena-bar-label">{row.label}</span>
            <span className={`arena-bar-track arena-track-${hue}`} role="img" aria-label={text}>
              {row.value > 0 && (
                <span
                  className={`arena-bar arena-seg-${hue}`}
                  style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
                />
              )}
            </span>
            <span className="arena-bar-value">{format(row.value)}</span>
          </div>
        );
      })}
    </figure>
  );
}

export function BatchView({ batch }: { batch: BatchState }) {
  if (batch.status === "idle") return null;
  const board = batch.scoreboard;
  const short = { baseline: "Without", skeptique: "With" } as const;
  return (
    <section className="arena-panel" aria-labelledby="arena-batch" aria-live="polite">
      <h2 id="arena-batch">Benchmark</h2>
      {batch.status === "running" && (
        <div className="arena-progress">
          <progress id="arena-batch-progress" max={batch.total ?? 1} value={batch.done} />
          <label htmlFor="arena-batch-progress" className="arena-small">
            {batch.done} of {batch.total ?? "?"} tasks done
          </label>
        </div>
      )}
      {board && (
        <>
          <p className="arena-small arena-muted">{board.tasks} tasks, both agents</p>
          <div className="arena-bars-grid">
            <BarPair
              title="Correct parts"
              hue="correct"
              max={Math.max(board.sides.baseline.totalParts, board.sides.skeptique.totalParts, 1)}
              rows={SIDES.map(({ side }) => ({ label: short[side], value: board.sides[side].correctParts }))}
              format={(v) => `${v}/${board.sides.baseline.totalParts}`}
            />
            <BarPair
              title="Wasted tinybars (lower is better)"
              hue="wasted"
              max={Math.max(...SIDES.map(({ side }) => Number(board.sides[side].wastedTinybars)), 1)}
              rows={SIDES.map(({ side }) => ({ label: short[side], value: Number(board.sides[side].wastedTinybars) }))}
              format={(v) => String(v)}
            />
          </div>
          <details className="arena-details">
            <summary>Show as table</summary>
            <div className="arena-scroll">
              <table className="arena-table">
                <caption className="visually-hidden">Scoreboard over {board.tasks} tasks</caption>
                <thead>
                  <tr>
                    <th scope="col">Agent</th>
                    <th scope="col">Correct parts</th>
                    <th scope="col">Wasted (tinybars)</th>
                    <th scope="col">Paid (tinybars)</th>
                  </tr>
                </thead>
                <tbody>
                  {SIDES.map(({ side, title }) => {
                    const s = board.sides[side];
                    return (
                      <tr key={side}>
                        <th scope="row">{title}</th>
                        <td>
                          {s.correctParts} of {s.totalParts}
                        </td>
                        <td>{s.wastedTinybars}</td>
                        <td>{s.totalTinybars}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {batch.hash && (
        <p className="arena-small">
          Batch hash <code className="arena-hash">{batch.hash}</code>
        </p>
      )}
    </section>
  );
}

/* ---------- transport ---------- */

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
  if (res.status === 409) throw new Error("Another run is in progress. Try again shortly.");
  if (!res.ok) throw new Error(json.error ?? `POST ${path} responded ${res.status}`);
  return json;
}

const TASK_GROUPS = [
  ["web3", "Web3"],
  ["general", "Everyday"],
] as const;

/** Preset task chips: a "Web3" and an "Everyday" row when every task has a group, else one row. */
export function TaskChips({
  tasks,
  prompt,
  onPick,
}: {
  tasks: ArenaTask[];
  prompt: string;
  onPick?: (prompt: string) => void;
}) {
  const grouped = tasks.every((t) => TASK_GROUPS.some(([g]) => g === t.group));
  const rows = grouped
    ? TASK_GROUPS.map(([g, label]) => ({ label, tasks: tasks.filter((t) => t.group === g) })).filter(
        (r) => r.tasks.length > 0,
      )
    : [{ label: null, tasks }];
  return rows.map((row) => (
    <div key={row.label ?? "all"} className="arena-chip-row">
      {row.label && (
        <span className="arena-chip-group" aria-hidden="true">
          {row.label}
        </span>
      )}
      <ul className="arena-chips" aria-label={row.label ? `${row.label} tasks` : "Preset tasks"}>
        {row.tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className="arena-chip"
              aria-pressed={prompt === task.prompt}
              title={`${task.prompt} (${task.why})`}
              onClick={() => onPick?.(task.prompt)}
            >
              {task.prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ));
}

const MODE_HINT: Record<BuyMode, string> = {
  "may-refuse": "Agents may buy nothing if no vendor looks good.",
  "must-buy": "Agents must buy an answer for every part.",
};

/** Runs one task through both buyer agents on the arena server and shows the events live. */
export function Arena() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [tasks, setTasks] = useState<ArenaTask[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<BuyMode>("may-refuse");
  // Kept in memory only: never written to storage, URLs or logs.
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const keysRef = useRef<HTMLDialogElement>(null);
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
      () => active && setTasks([]),
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
      () => dispatch({ type: "run-failed", error: "Lost the connection to the arena event stream." }),
    );
  }, [runId]);

  useEffect(() => {
    if (!batchId) return;
    return listen<BatchEvent>(
      `/batches/${batchId}/events`,
      BATCH_EVENTS,
      dispatchBatch,
      (event) => event.type === "batch-finished" || event.type === "batch-failed",
      () => dispatchBatch({ type: "batch-failed", batchId, error: "Lost the connection to the arena event stream." }),
    );
  }, [batchId]);

  const running = submitting || state.status === "running" || batch.status === "running";
  const offline = health.status !== "ok";
  const acceptsKeys = health.status !== "ok" || health.health.acceptsUserCredentials !== false;
  const withKeys = () => (credentials ? { credentials: credentialsBody(credentials) } : {});

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
      const { runId } = await post("/runs", { prompt, mode, ...withKeys() });
      dispatch({ type: "run-started", runId, task: null, prompt });
      setRunId(runId);
    });
  }

  function runBatch() {
    start(async () => {
      const { batchId } = await post("/batches", { mode, ...withKeys() });
      dispatchBatch({ type: "batch-started", batchId, tasks: [] });
      setBatchId(batchId);
    });
  }

  const toast =
    (submitError && `Could not start: ${submitError}`) ||
    (state.status === "failed" && `Run failed: ${state.error}`) ||
    (batch.status === "failed" && `Benchmark failed: ${batch.error}`) ||
    null;

  return (
    <>
      <ArenaHero health={health} />
      <form className="arena-panel arena-input" onSubmit={run}>
        <label htmlFor="arena-prompt" className="arena-input-label">
          Task
        </label>
        <textarea
          id="arena-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Convert 26.2 miles to km and 100 USD to EUR"
          minLength={3}
          maxLength={300}
          rows={2}
          required
        />
        {tasks === null ? (
          <div className="arena-chips-skeleton" aria-hidden="true" />
        ) : (
          <TaskChips tasks={tasks} prompt={prompt} onPick={setPrompt} />
        )}
        <div className="arena-controls">
          <fieldset className="arena-mode">
            <legend className="visually-hidden">Buying rule (same for both agents)</legend>
            {(
              [
                ["may-refuse", "Can skip"],
                ["must-buy", "Must buy"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="arena-mode-pill">
                <input type="radio" name="arena-mode" checked={mode === value} onChange={() => setMode(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          {acceptsKeys &&
            (credentials ? (
              <KeysPill credentials={credentials} onClear={() => setCredentials(null)} />
            ) : (
              <button
                type="button"
                className="arena-button arena-button-ghost"
                onClick={() => keysRef.current?.showModal()}
              >
                <Icon name="key" />
                Use your own keys
              </button>
            ))}
          <button type="submit" className="arena-button arena-button-run" disabled={running || offline}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
        <p className="arena-small arena-muted">{MODE_HINT[mode]}</p>
      </form>
      <KeysDialog dialogRef={keysRef} onSave={setCredentials} />
      <ArenaRunView state={state} apiUrl={health.status === "ok" ? health.health.apiUrl : undefined} />
      <section className="arena-panel arena-bench" aria-label="Run all tasks">
        <button
          type="button"
          className="arena-button arena-button-ghost"
          onClick={runBatch}
          disabled={running || offline}
        >
          Run all tasks
        </button>
        <span className="arena-small arena-muted">
          Benchmark: every preset task, both agents. Spends testnet tinybars.
        </span>
      </section>
      <BatchView batch={batch} />
      {toast && <Toast message={toast} />}
    </>
  );
}
