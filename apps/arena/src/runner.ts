import type { ServiceView } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import { BUYER_SYSTEM_PROMPT, buildPrompt, decide } from "./agent";
import type { Llm } from "./llm";
import { grade } from "./oracle";
import { checkPolicy, type SpendPolicy } from "./policy";
import { hashRecord } from "./record";
import type { ArenaEvent, ArenaRecord, GradedTask, Side, SideResult, Task } from "./schema";

export type SideConfig = { payAndCall: PayAndCall; signer: unknown; policy: SpendPolicy };

export type RunArenaArgs = {
  runId: string;
  prompt: string;
  task: Task;
  services: readonly ServiceView[];
  apiUrl: string;
  llm: Llm;
  sides: Record<Side, SideConfig>;
  network: ArenaRecord["network"];
  emit?: (event: ArenaEvent) => void;
  now?: () => Date;
};

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

async function runSide(side: Side, args: RunArenaArgs, task: GradedTask): Promise<SideResult> {
  const { llm, services, emit = () => {} } = args;
  const config = args.sides[side];
  const prompt = buildPrompt(side, args.prompt, task, services, config.policy.budgetTinybars);
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

  const { serviceId } = result.decision;
  if (serviceId === null) return { ...result, outcome: "refused" };
  const pick = services.find((s) => s.id === serviceId && s.category === task.category);
  if (!pick)
    return {
      ...result,
      outcome: "error",
      error: `agent picked service ${serviceId}, which is not a listed ${task.category} service`,
    };
  result.pick = { id: pick.id, name: pick.name, endpoint: pick.endpoint, pricePerCall: pick.pricePerCall };

  result.policy = checkPolicy(config.policy, pick, 0n);
  emit({ type: "policy", side, ...result.policy });
  if (!result.policy.allowed) return { ...result, outcome: "blocked" };

  try {
    const paid = await config.payAndCall({
      url: pick.endpoint,
      body: task.input,
      maxPrice: pick.pricePerCall,
      signer: config.signer,
    });
    result.payment = { txId: paid.txId, paid: paid.paid, tinybars: paid.paid ? pick.pricePerCall : "0" };
    result.response = paid.response;
    emit({ type: "paid", side, txId: paid.txId, tinybars: result.payment.tinybars });
  } catch (error) {
    return { ...result, outcome: "error", error: `payment/call: ${message(error)}` };
  }

  result.verdict = grade(task, result.response);
  result.outcome = result.verdict.correct ? "correct" : "wrong";
  result.wastedTinybars = result.verdict.correct ? "0" : result.payment.tinybars;
  return result;
}

/** Runs both agents on the same task at the same time and returns a hashed, self-contained record. */
export async function runArena(args: RunArenaArgs): Promise<{ record: ArenaRecord; hash: string }> {
  const { task, emit = () => {}, now = () => new Date() } = args;
  emit({ type: "run-started", runId: args.runId, task, prompt: args.prompt });
  const sides = { baseline: emptyResult("baseline", ""), skeptique: emptyResult("skeptique", "") };
  if (task.category === "unsupported") {
    for (const side of ["baseline", "skeptique"] as const) {
      sides[side] = { ...sides[side], outcome: "refused", error: `unsupported task: ${task.reason}` };
    }
  } else {
    const settle = async (side: Side) => {
      const result = await runSide(side, args, task);
      emit({ type: "graded", side, result });
      return result;
    };
    [sides.baseline, sides.skeptique] = await Promise.all([settle("baseline"), settle("skeptique")]);
  }
  const record: ArenaRecord = {
    version: 1,
    runId: args.runId,
    at: now().toISOString(),
    prompt: args.prompt,
    task,
    model: args.llm.model,
    systemPrompt: BUYER_SYSTEM_PROMPT,
    budgetTinybars: args.sides.skeptique.policy.budgetTinybars.toString(),
    network: args.network,
    marketplace: { apiUrl: args.apiUrl, services: [...args.services] },
    sides,
  };
  const hash = hashRecord(record);
  emit({ type: "run-finished", record, hash });
  return { record, hash };
}
