/*
 * Minimal copies of the arena server's wire types. Source of truth: apps/arena/src/schema.ts
 * (apps do not import each other). Keep these in step with that file.
 */

export type Side = "baseline" | "skeptique";

/** `option` is the shuffled option number the agent picked; older runs sent `serviceId` instead. */
export type Decision = { option?: number | null; serviceId?: number | null; reason: string; signalsUsed: string[] };

export type PolicyCheck = { rule: string; pass: boolean; detail: string };

export type Verdict = { correct: boolean; expected: unknown; actual: unknown; note: string };

export type SideResult = {
  side: Side;
  prompt: string;
  decision: Decision | null;
  llm: { model: string; costUsd: number | null; ms: number; raw: string } | null;
  pick: { id: number; name: string; endpoint: string; pricePerCall: string } | null;
  policy: { allowed: boolean; checks: PolicyCheck[] } | null;
  payment: { txId: string | null; paid: boolean; tinybars: string } | null;
  response: unknown;
  verdict: Verdict | null;
  outcome: "correct" | "wrong" | "refused" | "blocked" | "error";
  wastedTinybars: string;
  error: string | null;
};

export type ArenaRecord = {
  version: number;
  runId: string;
  at: string;
  prompt: string;
  task: unknown;
  model: string;
  systemPrompt: string;
  network: string;
  sides: { baseline: SideResult; skeptique: SideResult };
  // Added in version 2; optional so a version 1 record from an older server still renders.
  provenance?: string;
  taskSource?: "preset" | "parser";
  agents?: Record<Side, { payer: string; policy: PolicySettings }>;
  seed?: string;
  options?: { option: number; serviceId: number }[];
};

export type PolicySettings = {
  budgetTinybars: string;
  maxPerCallTinybars: string;
  evidence: { minMedian: number; minRounds: number } | null;
};

export type ArenaEvent =
  | { type: "run-started"; runId: string; task: unknown; prompt: string }
  | { type: "decided"; side: Side; decision: Decision | null; error?: string }
  | { type: "policy"; side: Side; allowed: boolean; checks: PolicyCheck[] }
  | { type: "paid"; side: Side; txId: string | null; tinybars: string }
  | { type: "graded"; side: Side; result: SideResult }
  | { type: "run-finished"; record: ArenaRecord; hash: string }
  | { type: "run-failed"; error: string };

export const ARENA_EVENTS = [
  "run-started",
  "decided",
  "policy",
  "paid",
  "graded",
  "run-finished",
  "run-failed",
] as const;

export type ArenaHealth = {
  model: string;
  network: string;
  apiUrl: string;
  busy: boolean;
  paywall?: Record<string, string>;
  provenance?: string;
};

export type ArenaTask = { id: string; prompt: string; why: string };

export type SideState = {
  decided: boolean;
  decision: Decision | null;
  decideError: string | null;
  policy: { allowed: boolean; checks: PolicyCheck[] } | null;
  payment: { txId: string | null; tinybars: string } | null;
  result: SideResult | null;
};

export type ArenaState = {
  status: "idle" | "running" | "finished" | "failed";
  runId: string | null;
  prompt: string | null;
  sides: Record<Side, SideState>;
  record: ArenaRecord | null;
  hash: string | null;
  error: string | null;
};

const emptySide: SideState = {
  decided: false,
  decision: null,
  decideError: null,
  policy: null,
  payment: null,
  result: null,
};

export const initialArenaState: ArenaState = {
  status: "idle",
  runId: null,
  prompt: null,
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
      return { ...initialArenaState, status: "running", runId: event.runId, prompt: event.prompt };
    case "decided":
      return patch(event.side, { decided: true, decision: event.decision, decideError: event.error ?? null });
    case "policy":
      return patch(event.side, { policy: { allowed: event.allowed, checks: event.checks } });
    case "paid":
      return patch(event.side, { payment: { txId: event.txId, tinybars: event.tinybars } });
    case "graded":
      return patch(event.side, { result: event.result });
    case "run-finished":
      return { ...state, status: "finished", record: event.record, hash: event.hash };
    case "run-failed":
      return { ...state, status: "failed", error: event.error };
  }
}

/** Task-pack benchmark: `POST /batches`, then SSE `GET /batches/:id/events`. */
export type SideScore = Record<SideResult["outcome"], number> & {
  /** Answer delivered and graded correct: the headline. */
  answeredCorrect: number;
  /** Refused + blocked: no answer, never counted as a win. */
  noAnswer: number;
  totalTinybars: string;
  wastedTinybars: string;
  /** Tinybars paid for correct answers / all tinybars paid; null if nothing was paid. */
  paidToCorrectShare: number | null;
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

/** The option number the agent chose, from either decision shape; null means "buy nothing". */
export function pickedOption(decision: Decision): number | null {
  return decision.option ?? decision.serviceId ?? null;
}

export function arenaUrl(): string {
  return process.env.NEXT_PUBLIC_ARENA_URL || "http://127.0.0.1:4320";
}
