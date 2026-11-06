import { createHash, randomBytes } from "node:crypto";
import type { ServiceView } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import { BUYER_SYSTEM_PROMPT, buildPrompt, decide } from "./agent";
import { summarise } from "./batch";
import type { Llm } from "./llm";
import { gradable, grade } from "./oracle";
import { checkPolicy, type SpendPolicy } from "./policy";
import { hashRecord } from "./record";
import type { ArenaEvent, ArenaRecord, GradedTask, Side, SideResult, Task } from "./schema";

/** `payer` is the Hedera account id that signs this side's payments. */
export type SideConfig = { payAndCall: PayAndCall; signer: unknown; payer: string; policy: SpendPolicy };

export type RunArenaArgs = {
  runId: string;
  prompt: string;
  task: Task;
  services: readonly ServiceView[];
  apiUrl: string;
  llm: Llm;
  sides: Record<Side, SideConfig>;
  network: ArenaRecord["network"];
  provenance: string;
  taskSource: ArenaRecord["taskSource"];
  emit?: (event: ArenaEvent) => void;
  now?: () => Date;
  /** Seed for the option shuffle. Defaults to 16 random bytes; tests pass a fixed one. */
  seed?: string;
};

/**
 * Deterministic Fisher-Yates driven by sha256(`${seed}:${i}`). Option numbers are random per run so
 * a model that breaks ties by "lowest number" gains nothing, and the recorded seed lets anyone
 * recompute the mapping.
 */
export function shuffleWithSeed<T>(seed: string, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = createHash("sha256").update(`${seed}:${i}`).digest().readUInt32BE(0) % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const PAY_TIMEOUT_MS = 30_000;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function emptyResult(side: Side, prompt: string): SideResult {
  return {
    side,
    prompt,
    decision: null,
    llm: null,
    pick: null,
    policy: null,
    payment: null,
    response: null,
    verdict: null,
    outcome: "error",
    wastedTinybars: "0",
    error: null,
  };
}

async function runSide(
  side: Side,
  args: RunArenaArgs,
  task: GradedTask,
  options: readonly ServiceView[],
): Promise<SideResult> {
  const { llm, emit = () => {} } = args;
  const config = args.sides[side];
  const prompt = buildPrompt(side, args.prompt, task, options, config.policy.budgetTinybars);
  const result = emptyResult(side, prompt);
  try {
    const answer = await decide(llm, prompt);
    result.decision = answer.value;
    result.llm = { model: answer.model, costUsd: answer.costUsd, ms: answer.ms, raw: answer.raw };
    emit({ type: "decided", side, decision: answer.value });
  } catch (error) {
    result.error = `agent: ${message(error)}`;
    emit({ type: "decided", side, decision: null, error: result.error });
    return result;
  }

  const { option } = result.decision;
  if (option === null) return { ...result, outcome: "refused" };
  const pick = options[option - 1];
  if (!pick)
    return {
      ...result,
      outcome: "error",
      error: `agent picked option ${option}, but only options 1-${options.length} were listed`,
    };
  result.pick = { option, id: pick.id, name: pick.name, endpoint: pick.endpoint, pricePerCall: pick.pricePerCall };

  result.policy = checkPolicy(config.policy, pick);
  emit({ type: "policy", side, ...result.policy });
  if (!result.policy.allowed) return { ...result, outcome: "blocked" };

  try {
    const paid = await config.payAndCall({
      url: pick.endpoint,
      body: task.input,
      maxPrice: pick.pricePerCall,
      signer: config.signer,
      signal: AbortSignal.timeout(PAY_TIMEOUT_MS),
    });
    result.payment = { txId: paid.txId, paid: paid.paid, tinybars: paid.paid ? pick.pricePerCall : "0" };
    result.response = paid.response;
    emit({ type: "paid", side, txId: paid.txId, tinybars: result.payment.tinybars });
  } catch (error) {
    return { ...result, outcome: "error", error: `payment/call: ${message(error)}` };
  }
  if (!result.payment.paid) return { ...result, outcome: "error", error: "unpaid response" };

  result.verdict = grade(task, result.response);
  result.outcome = result.verdict.correct ? "correct" : "wrong";
  result.wastedTinybars = result.verdict.correct ? "0" : result.payment.tinybars;
  return result;
}

const agent = ({ payer, policy }: SideConfig) => ({
  payer,
  policy: {
    budgetTinybars: policy.budgetTinybars.toString(),
    maxPerCallTinybars: policy.maxPerCallTinybars.toString(),
    evidence: policy.evidence,
  },
});

/** Runs both agents on the same task at the same time and returns a hashed, self-contained record. */
export async function runArena(args: RunArenaArgs): Promise<{ record: ArenaRecord; hash: string }> {
  const { task, emit = () => {}, now = () => new Date(), seed = randomBytes(16).toString("hex") } = args;
  emit({ type: "run-started", runId: args.runId, task, prompt: args.prompt });
  const sides = { baseline: emptyResult("baseline", ""), skeptique: emptyResult("skeptique", "") };
  // Refuse before either side runs when the oracle could not grade the answer.
  const unsupported =
    task.category === "unsupported"
      ? task.reason
      : gradable(task)
        ? null
        : `no ground truth for ${JSON.stringify(task)}`;
  // One mapping, shared by both sides: option k is options[k - 1].
  const inCategory = args.services.filter((s) => s.category === task.category).sort((a, b) => a.id - b.id);
  const options = unsupported === null ? shuffleWithSeed(seed, inCategory) : [];
  if (unsupported !== null || task.category === "unsupported") {
    for (const side of ["baseline", "skeptique"] as const) {
      sides[side] = { ...sides[side], outcome: "refused", error: `unsupported task: ${unsupported}` };
    }
  } else {
    const settle = async (side: Side) => {
      const result = await runSide(side, args, task, options);
      emit({ type: "graded", side, result });
      return result;
    };
    [sides.baseline, sides.skeptique] = await Promise.all([settle("baseline"), settle("skeptique")]);
  }
  const record: ArenaRecord = {
    version: 2,
    runId: args.runId,
    at: now().toISOString(),
    prompt: args.prompt,
    task,
    model: args.llm.model,
    systemPrompt: BUYER_SYSTEM_PROMPT,
    network: args.network,
    provenance: args.provenance,
    taskSource: args.taskSource,
    marketplace: { apiUrl: args.apiUrl, services: [...args.services] },
    agents: { baseline: agent(args.sides.baseline), skeptique: agent(args.sides.skeptique) },
    seed,
    options: options.map((s, k) => ({ option: k + 1, serviceId: s.id })),
    sides,
    summary: summarise(sides),
  };
  const hash = hashRecord(record);
  emit({ type: "run-finished", record, hash });
  return { record, hash };
}
