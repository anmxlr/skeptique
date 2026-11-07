/*
 * Minimal copies of the arena server's wire types (contract v3). Source of truth: apps/arena/src/schema.ts
 * (apps do not import each other). Keep these in step with that file.
 */

export type Side = "baseline" | "skeptique";

export type SubTask =
  | { category: "conversion"; input: { value: number; from: string; to: string } }
  | { category: "currency-conversion"; input: { amount: number; from: string; to: string } };

export type Task = { kind: "tasks"; parts: SubTask[] } | { kind: "unsupported"; reason: string };

/** One choice per part; `option: null` means "buy nothing" for that part. */
export type Decision = { choices: { part: number; option: number | null }[]; reason: string; signalsUsed: string[] };

export type PolicyCheck = { rule: string; pass: boolean; detail: string };

export type Verdict = { correct: boolean; expected: unknown; actual: unknown; note: string };

export type PartOutcome = "correct" | "wrong" | "refused" | "blocked" | "error";

export type PartResult = {
  part: number;
  task: SubTask;
  option: number | null;
  pick: { option: number; id: number; name: string; endpoint: string; pricePerCall: string } | null;
  policy: { allowed: boolean; checks: PolicyCheck[] } | null;
  payment: { txId: string | null; paid: boolean; tinybars: string } | null;
  response: unknown;
  verdict: Verdict | null;
  outcome: PartOutcome;
  error: string | null;
};

export type SideOutcome = "correct" | "partial" | "wrong" | "refused" | "blocked" | "error";

export type SideResult = {
  side: Side;
  prompt: string;
  decision: Decision | null;
  llm: { model: string; costUsd: number | null; ms: number; raw: string } | null;
  parts: PartResult[];
  correctParts: number;
  totalParts: number;
  paidTinybars: string;
  wastedTinybars: string;
  outcome: SideOutcome;
  error: string | null;
};

export type PolicySettings = {
  budgetTinybars: string;
  maxPerCallTinybars: string;
  evidence: { minMedian: number; minRounds: number } | null;
};

/** Mirrors BUY_MODES in apps/arena/src/schema.ts. */
export type BuyMode = "may-refuse" | "must-buy";

export type ArenaRecord = {
  version: number;
  runId: string;
  at?: string;
  prompt: string;
  task?: Task | null;
  mode?: BuyMode;
  model?: string;
  credentialSource?: "user" | "server";
  network?: string;
  provenance?: string;
  taskSource?: "preset" | "parser";
  agents?: Record<Side, { payer: string; policy: PolicySettings }>;
  seed?: string;
  options?: { category?: SubTask["category"]; option: number; serviceId: number }[];
  sides: { baseline: SideResult; skeptique: SideResult };
  summary?: unknown;
};

export type ArenaEvent =
  | { type: "run-started"; runId: string; task: Task | null; prompt: string }
  | { type: "decided"; side: Side; decision: Decision | null; error?: string }
  | { type: "part"; side: Side; part: number; result: PartResult }
  | { type: "graded"; side: Side; result: SideResult }
  | { type: "run-finished"; record: ArenaRecord; hash: string }
  | { type: "run-failed"; error: string };

export const ARENA_EVENTS = ["run-started", "decided", "part", "graded", "run-finished", "run-failed"] as const;

export type ArenaHealth = {
  model: string;
  network: string;
  apiUrl?: string;
  busy?: boolean;
  paywall?: Record<string, string>;
  provenance?: string;
  models?: unknown;
  acceptsUserCredentials?: boolean;
};

export type ArenaTask = { id: string; prompt: string; why: string };

export type SideState = {
  decided: boolean;
  decision: Decision | null;
  decideError: string | null;
  /** Part results as they arrive, sorted by part index. */
  parts: PartResult[];
  result: SideResult | null;
};

export type ArenaState = {
  status: "idle" | "running" | "finished" | "failed";
  runId: string | null;
  prompt: string | null;
  task: Task | null;
  sides: Record<Side, SideState>;
  record: ArenaRecord | null;
  hash: string | null;
  error: string | null;
};

const emptySide: SideState = { decided: false, decision: null, decideError: null, parts: [], result: null };

export const initialArenaState: ArenaState = {
  status: "idle",
  runId: null,
  prompt: null,
  task: null,
  sides: { baseline: emptySide, skeptique: emptySide },
  record: null,
  hash: null,
  error: null,
};

/** Arena state after one more event from `GET /runs/:id/events`. Pure, so replayed events are harmless. */
export function arenaReducer(state: ArenaState, event: ArenaEvent): ArenaState {
  const patch = (side: Side, next: Partial<SideState>): ArenaState => ({
    ...state,
    sides: { ...state.sides, [side]: { ...state.sides[side], ...next } },
  });
  switch (event.type) {
    case "run-started":
      return { ...initialArenaState, status: "running", runId: event.runId, prompt: event.prompt, task: event.task };
    case "decided":
      return patch(event.side, { decided: true, decision: event.decision, decideError: event.error ?? null });
    case "part": {
      const others = state.sides[event.side].parts.filter((p) => p.part !== event.part);
      return patch(event.side, { parts: [...others, event.result].sort((a, b) => a.part - b.part) });
    }
    case "graded":
      return patch(event.side, { result: event.result, parts: event.result.parts });
    case "run-finished":
      return { ...state, status: "finished", record: event.record, hash: event.hash };
    case "run-failed":
      return { ...state, status: "failed", error: event.error };
  }
}

/** Task-pack benchmark: `POST /batches`, then SSE `GET /batches/:id/events`. */
export type SideScore = Partial<Record<SideOutcome, number>> & {
  correctParts: number;
  totalParts: number;
  answeredCorrect?: number;
  noAnswer?: number;
  totalTinybars: string;
  wastedTinybars: string;
  paidToCorrectShare?: number | null;
};
export type Scoreboard = { tasks: number; sides: Record<Side, SideScore> };

export type BatchEvent =
  | { type: "batch-started"; batchId: string; tasks: { id: string; prompt: string }[] }
  | { type: "batch-task"; batchId: string; index: number; taskId: string; runId: string; hash: string }
  | { type: "batch-finished"; batchId: string; scoreboard: Scoreboard; runHashes: string[]; hash: string }
  | { type: "batch-failed"; batchId: string; error: string };

export const BATCH_EVENTS = ["batch-started", "batch-task", "batch-finished", "batch-failed"] as const;

export type BatchState = {
  status: "idle" | "running" | "finished" | "failed";
  total: number | null;
  done: number;
  scoreboard: Scoreboard | null;
  hash: string | null;
  error: string | null;
};

export const initialBatchState: BatchState = {
  status: "idle",
  total: null,
  done: 0,
  scoreboard: null,
  hash: null,
  error: null,
};

export function batchReducer(state: BatchState, event: BatchEvent): BatchState {
  switch (event.type) {
    case "batch-started":
      return { ...initialBatchState, status: "running", total: event.tasks.length || null };
    case "batch-task":
      return { ...state, done: Math.max(state.done, event.index + 1) };
    case "batch-finished":
      return { ...state, status: "finished", scoreboard: event.scoreboard, hash: event.hash };
    case "batch-failed":
      return { ...state, status: "failed", error: event.error };
  }
}

export function arenaUrl(): string {
  return process.env.NEXT_PUBLIC_ARENA_URL || "http://127.0.0.1:4320";
}

/* ---------- display helpers ---------- */

const UNIT_LABEL: Record<string, string> = { C: "°C", F: "°F" };
const unit = (u: string) => UNIT_LABEL[u] ?? u;

/** Short form of a part, e.g. "26.2 mi → km". */
export function taskLabel(task: SubTask): string {
  const amount = task.category === "conversion" ? task.input.value : task.input.amount;
  return `${amount} ${unit(task.input.from)} → ${unit(task.input.to)}`;
}

const tidy = (n: number) => String(Number(n.toPrecision(8)));

/** A service answer or oracle value in a few characters: 300 cm, 9.2 EUR, or compact JSON. */
export function answerText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return tidy(value);
  if (typeof value === "string") return value.length > 24 ? `${value.slice(0, 23)}…` : value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const n = [o.result, o.value, o.amount].find((v) => typeof v === "number") as number | undefined;
    const u = [o.unit, o.currency, o.to].find((v) => typeof v === "string") as string | undefined;
    if (n !== undefined) return u ? `${tidy(n)} ${unit(u)}` : tidy(n);
  }
  const text = JSON.stringify(value) ?? "—";
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}

const big = (s: string | undefined) => {
  try {
    return BigInt(s ?? "0");
  } catch {
    return 0n;
  }
};

/** Tinybars split for the money meter. */
export function moneySplit(paid: string, wasted: string) {
  const total = big(paid);
  let waste = big(wasted);
  if (waste > total) waste = total;
  return { total, wasted: waste, correct: total - waste };
}

/** True when this side paid at least one vendor whose answer the oracle graded correct. */
export function paidHonestVendor(result: SideResult): boolean {
  return result.parts.some((p) => p.payment?.paid && p.outcome === "correct");
}

/* ---------- user credentials (kept in React state only; never stored). Rules mirror CredentialsSchema in apps/arena/src/server.ts. ---------- */

export const MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

export type Credentials = {
  hederaAccountId: string;
  hederaPrivateKey: string;
  anthropicApiKey?: string;
  model?: ModelId;
};

export type CredentialErrors = Partial<Record<keyof Credentials, string>>;

/** Field errors for a keys draft; empty object means valid. Values are never echoed back. */
export function validateCredentials(draft: Credentials): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!/^0\.0\.\d{1,12}$/.test(draft.hederaAccountId.trim())) errors.hederaAccountId = "Use the form 0.0.12345.";
  const key = draft.hederaPrivateKey.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64,100}$/.test(key))
    errors.hederaPrivateKey = "Paste the hex private key (64–100 hex characters).";
  const anthropic = draft.anthropicApiKey?.trim();
  if (anthropic && (!anthropic.startsWith("sk-ant-") || anthropic.length < 20))
    errors.anthropicApiKey = "Anthropic keys start with sk-ant- and are at least 20 characters.";
  if (draft.model && !MODELS.some((m) => m.id === draft.model)) errors.model = "Pick Haiku or Sonnet.";
  return errors;
}

/** The credentials object for a POST body: trimmed, optional fields dropped when blank. */
export function credentialsBody(c: Credentials): Credentials {
  const anthropicApiKey = c.anthropicApiKey?.trim();
  return {
    hederaAccountId: c.hederaAccountId.trim(),
    hederaPrivateKey: c.hederaPrivateKey.trim(),
    ...(anthropicApiKey ? { anthropicApiKey } : {}),
    model: c.model ?? "claude-haiku-5-5",
  };
}
