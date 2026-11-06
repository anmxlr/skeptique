import { z } from "zod";

/** Categories the arena can grade with a deterministic oracle. Anything else is "unsupported". */
export const GRADED_CATEGORIES = ["conversion", "currency-conversion"] as const;

export const ConversionInputSchema = z.object({
  value: z.number().finite(),
  from: z.string().min(1),
  to: z.string().min(1),
});
export const CurrencyInputSchema = z.object({
  amount: z.number().finite(),
  from: z.string().length(3),
  to: z.string().length(3),
});

export const TaskSchema = z.discriminatedUnion("category", [
  z.object({ category: z.literal("conversion"), input: ConversionInputSchema }),
  z.object({ category: z.literal("currency-conversion"), input: CurrencyInputSchema }),
  z.object({ category: z.literal("unsupported"), reason: z.string() }),
]);
export type Task = z.infer<typeof TaskSchema>;
export type GradedTask = Exclude<Task, { category: "unsupported" }>;

/** What each buyer agent must answer. `serviceId: null` means "buy nothing". */
export const DecisionSchema = z.object({
  serviceId: z.number().int().nonnegative().nullable(),
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
  pick: { id: number; name: string; endpoint: string; pricePerCall: string } | null;
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

export type ArenaRecord = {
  version: 1;
  runId: string;
  at: string;
  prompt: string;
  task: Task;
  model: string;
  systemPrompt: string;
  budgetTinybars: string;
  network: "hedera:testnet" | "test";
  marketplace: { apiUrl: string; services: unknown[] };
  sides: { baseline: SideResult; skeptique: SideResult };
};
