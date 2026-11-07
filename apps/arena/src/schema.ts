import { z } from "zod";
import { CURRENCY_CODES, UNIT_KEYS } from "./oracle";

/** Categories the arena can grade with a deterministic oracle. Anything else is "unsupported". */
export const GRADED_CATEGORIES = ["conversion", "currency-conversion"] as const;

export const ConversionInputSchema = z.object({
  value: z.number().finite(),
  from: z.enum(UNIT_KEYS),
  to: z.enum(UNIT_KEYS),
});
export const CurrencyInputSchema = z.object({
  amount: z.number().finite(),
  from: z.enum(CURRENCY_CODES),
  to: z.enum(CURRENCY_CODES),
});

/** One oracle-gradable question, sent as-is to the service bought for it. */
export const SubTaskSchema = z.discriminatedUnion("category", [
  z.object({ category: z.literal("conversion"), input: ConversionInputSchema }),
  z.object({ category: z.literal("currency-conversion"), input: CurrencyInputSchema }),
]);
export type SubTask = z.infer<typeof SubTaskSchema>;

export const MAX_PARTS = 5;
export const TaskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tasks"), parts: z.array(SubTaskSchema).min(1).max(MAX_PARTS) }),
  z.object({ kind: z.literal("unsupported"), reason: z.string() }),
]);
export type Task = z.infer<typeof TaskSchema>;

/**
 * What each buyer agent must answer, in one call for all parts. `part` is 0-based; `option` is the
 * option number in that part's category listing; null means "buy nothing for this part".
 */
export const DecisionSchema = z.object({
  choices: z
    .array(z.object({ part: z.number().int().nonnegative(), option: z.number().int().nonnegative().nullable() }))
    .max(MAX_PARTS),
  reason: z.string().min(1).max(1200),
  signalsUsed: z.array(z.string().max(80)).max(12),
});
export type Decision = z.infer<typeof DecisionSchema>;

export type Side = "baseline" | "skeptique";

/** `source` = where the right answer is defined (for currency: the arena's fixed demo table, not live rates). */
export type Verdict = {
  correct: boolean;
  expected: unknown;
  actual: unknown;
  note: string;
  source: { label: string; url: string };
};

/**
 * Did the agent make anything up? Every number quoted in `decision.reason` and every
 * `decision.signalsUsed` entry, checked against the exact prompt the agent saw. Exact appearance
 * only: a value the agent derived (a sum, a ratio) shows as not found ("not directly in its data").
 */
export type Grounding = {
  numbers: { value: string; found: boolean }[];
  signals: { name: string; found: boolean }[];
  ok: boolean;
};

export type PartResult = {
  part: number;
  task: SubTask;
  option: number | null;
  pick: { option: number; id: number; name: string; endpoint: string; pricePerCall: string } | null;
  policy: { allowed: boolean; checks: { rule: string; pass: boolean; detail: string }[] } | null;
  payment: { txId: string | null; paid: boolean; tinybars: string } | null;
  response: unknown;
  verdict: Verdict | null;
  outcome: "correct" | "wrong" | "refused" | "blocked" | "error";
  error: string | null;
};

/**
 * `outcome`: "correct" = every part correct; "partial" = some parts correct; "wrong" = paid and no
 * part correct; "refused"/"blocked" = nothing paid because the model refused or the policy blocked;
 * "error" otherwise. `wastedTinybars` = tinybars paid for parts graded wrong.
 */
export type SideResult = {
  side: Side;
  prompt: string;
  decision: Decision | null;
  /** null when there is no decision to check. */
  grounding: Grounding | null;
  llm: { model: string; costUsd: number | null; ms: number; raw: string } | null;
  parts: PartResult[];
  correctParts: number;
  totalParts: number;
  paidTinybars: string;
  wastedTinybars: string;
  outcome: "correct" | "partial" | "wrong" | "refused" | "blocked" | "error";
  error: string | null;
};

export type ArenaEvent =
  | { type: "run-started"; runId: string; task: Task; prompt: string }
  | { type: "decided"; side: Side; decision: Decision | null; error?: string }
  | { type: "part"; side: Side; part: number; result: PartResult }
  | { type: "graded"; side: Side; result: SideResult }
  | { type: "run-finished"; record: ArenaRecord; hash: string }
  | { type: "run-failed"; error: string };

/** Option k of `category`'s listing, shown to both agents, is service `serviceId`. */
export type OptionMapping = { category: SubTask["category"]; option: number; serviceId: number };

/** A side's spend policy as recorded (tinybars as decimal strings). `evidence: null` = no evidence rules. */
export type PolicySettings = {
  budgetTinybars: string;
  maxPerCallTinybars: string;
  evidence: { minMedian: number; minRounds: number } | null;
};

/**
 * Headline for one side of one run. `answeredCorrect` = an answer was delivered and the oracle graded
 * it correct. `noAnswer` = refused or blocked: no answer, which is never counted as a win.
 */
export type SideSummary = {
  outcome: Outcome;
  answeredCorrect: boolean;
  noAnswer: boolean;
  paidTinybars: string;
  wastedTinybars: string;
  correctParts: number;
  totalParts: number;
};
export type RunSummary = Record<Side, SideSummary>;

export const BUY_MODES = ["may-refuse", "must-buy"] as const;
export type BuyMode = (typeof BUY_MODES)[number];

export const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export type Model = (typeof MODELS)[number];

export type ArenaRecord = {
  version: 3;
  mode: BuyMode;
  runId: string;
  at: string;
  prompt: string;
  task: Task;
  model: string;
  /** "user" = the run used credentials sent with the request (only the payer account id is kept). */
  /** Whose Hedera account paid. */
  credentialSource: "user" | "server";
  /** Whose Anthropic key ran the model: the user's key, or the server's Claude login. */
  modelKeySource: "user" | "server";
  systemPrompt: string;
  network: "hedera:testnet" | "test";
  /** Where the marketplace came from, e.g. "api" or "local-chain". */
  provenance: string;
  /** "preset" = a TASK_PACK task; "parser" = free text parsed into a task by the model. */
  taskSource: "preset" | "parser";
  marketplace: { apiUrl: string; services: unknown[] };
  /** Who paid for each side and under which spend policy. */
  agents: Record<Side, { payer: string; policy: PolicySettings }>;
  /** Seed of the per-run option shuffle; per category, `shuffleWithSeed(seed, inCategoryServicesSortedById, `${category}:`)` reproduces `options`. */
  seed: string;
  options: OptionMapping[];
  sides: { baseline: SideResult; skeptique: SideResult };
  summary: RunSummary;
};

export type Outcome = SideResult["outcome"];

/**
 * One side's totals over a batch. Headline: `answeredCorrect` (runs with every part delivered and
 * correct) next to `wastedTinybars`; `noAnswer` = refused + blocked runs; `correctParts`/`totalParts`
 * count parts. `paidToCorrectShare` = tinybars paid for correct parts / all tinybars paid (null if
 * nothing was paid).
 */
export type SideScore = Record<Outcome, number> & {
  answeredCorrect: number;
  noAnswer: number;
  correctParts: number;
  totalParts: number;
  totalTinybars: string;
  wastedTinybars: string;
  paidToCorrectShare: number | null;
};
export type Scoreboard = { tasks: number; sides: Record<Side, SideScore> };

export type BatchEvent =
  | { type: "batch-started"; batchId: string; tasks: { id: string; prompt: string }[] }
  | {
      type: "batch-task";
      batchId: string;
      index: number;
      taskId: string;
      runId: string;
      hash: string;
      sides: RunSummary;
    }
  /** `hash` = sha256 over canonical JSON of `{ scoreboard, runHashes }`. */
  | { type: "batch-finished"; batchId: string; scoreboard: Scoreboard; runHashes: string[]; hash: string }
  | { type: "batch-failed"; batchId: string; error: string };
