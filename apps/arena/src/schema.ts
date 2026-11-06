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

export const TaskSchema = z.discriminatedUnion("category", [
  z.object({ category: z.literal("conversion"), input: ConversionInputSchema }),
  z.object({ category: z.literal("currency-conversion"), input: CurrencyInputSchema }),
  z.object({ category: z.literal("unsupported"), reason: z.string() }),
]);
export type Task = z.infer<typeof TaskSchema>;
export type GradedTask = Exclude<Task, { category: "unsupported" }>;

/** What each buyer agent must answer. `option` is the listing's option number; null means "buy nothing". */
export const DecisionSchema = z.object({
  option: z.number().int().nonnegative().nullable(),
  reason: z.string().min(1).max(1200),
  signalsUsed: z.array(z.string().max(80)).max(12),
});
export type Decision = z.infer<typeof DecisionSchema>;

export type Side = "baseline" | "skeptique";

export type Verdict = { correct: boolean; expected: unknown; actual: unknown; note: string };

export type SideResult = {
  side: Side;
  prompt: string;
  decision: Decision | null;
  llm: { model: string; costUsd: number | null; ms: number; raw: string } | null;
  pick: { option: number; id: number; name: string; endpoint: string; pricePerCall: string } | null;
  policy: { allowed: boolean; checks: { rule: string; pass: boolean; detail: string }[] } | null;
  payment: { txId: string | null; paid: boolean; tinybars: string } | null;
  response: unknown;
  verdict: Verdict | null;
  outcome: "correct" | "wrong" | "refused" | "blocked" | "error";
  wastedTinybars: string;
  error: string | null;
};

export type ArenaEvent =
  | { type: "run-started"; runId: string; task: Task; prompt: string }
  | { type: "decided"; side: Side; decision: Decision | null; error?: string }
  | { type: "policy"; side: Side; allowed: boolean; checks: { rule: string; pass: boolean; detail: string }[] }
  | { type: "paid"; side: Side; txId: string | null; tinybars: string }
  | { type: "graded"; side: Side; result: SideResult }
  | { type: "run-finished"; record: ArenaRecord; hash: string }
  | { type: "run-failed"; error: string };

/** Option k shown to both agents is service `serviceId`. */
export type OptionMapping = { option: number; serviceId: number };

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
};
export type RunSummary = Record<Side, SideSummary>;

export const BUY_MODES = ["may-refuse", "must-buy"] as const;
export type BuyMode = (typeof BUY_MODES)[number];

export type ArenaRecord = {
  version: 2;
  mode: BuyMode;
  runId: string;
  at: string;
  prompt: string;
  task: Task;
  model: string;
  systemPrompt: string;
  network: "hedera:testnet" | "test";
  /** Where the marketplace came from, e.g. "api" or "local-chain". */
  provenance: string;
  /** "preset" = a TASK_PACK task; "parser" = free text parsed into a task by the model. */
  taskSource: "preset" | "parser";
  marketplace: { apiUrl: string; services: unknown[] };
  /** Who paid for each side and under which spend policy. */
  agents: Record<Side, { payer: string; policy: PolicySettings }>;
  /** Seed of the per-run option shuffle; `shuffleWithSeed(seed, inCategoryServicesSortedById)` reproduces `options`. */
  seed: string;
  options: OptionMapping[];
  sides: { baseline: SideResult; skeptique: SideResult };
  summary: RunSummary;
};

export type Outcome = SideResult["outcome"];

/**
 * One side's totals over a batch. Headline: `answeredCorrect` (answer delivered and correct) next to
 * `wastedTinybars`; `noAnswer` = refused + blocked. `paidToCorrectShare` = tinybars paid for correct
 * answers / all tinybars paid (null if nothing was paid).
 */
export type SideScore = Record<Outcome, number> & {
  answeredCorrect: number;
  noAnswer: number;
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
