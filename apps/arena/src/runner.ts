import { createHash, randomBytes } from "node:crypto";
import type { ServiceView } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import { buildPrompt, buyerSystemPrompt, decide } from "./agent";
import { summarise } from "./batch";
import { checkGrounding } from "./grounding";
import type { Llm } from "./llm";
import { gradable, grade } from "./oracle";
import { checkPolicy, type SpendPolicy } from "./policy";
import { hashRecord } from "./record";
import type { ArenaEvent, ArenaRecord, BuyMode, PartResult, Side, SideResult, SubTask, Task } from "./schema";

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
  /** Same for both sides; defaults to "may-refuse". */
  mode?: BuyMode;
  /** Seed for the option shuffle. Defaults to 16 random bytes; tests pass a fixed one. */
  seed?: string;
  /** "user" when the payer and model key came with the request. Defaults to "server". */
  credentialSource?: ArenaRecord["credentialSource"];
  modelKeySource?: ArenaRecord["modelKeySource"];
  /** Secret strings (user keys) masked out of any error text before it is recorded or emitted. */
  secrets?: readonly string[];
};

/**
 * Deterministic Fisher-Yates driven by sha256(`${seed}:${category}:${i}`), independent per category. Option numbers are random per run so
 * a model that breaks ties by "lowest number" gains nothing, and the recorded seed lets anyone
 * recompute the mapping.
 */
export function shuffleWithSeed<T>(seed: string, xs: readonly T[], salt = ""): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = createHash("sha256").update(`${seed}:${salt}${i}`).digest().readUInt32BE(0) % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const PAY_TIMEOUT_MS = 30_000;

/** Error text with any secret (user keys) masked, so a library error cannot leak one into a record. */
export function message(error: unknown, secrets: readonly string[] = []): string {
  let text = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) text = text.split(secret).join("[redacted]");
  return text;
}

function emptyResult(side: Side, prompt: string, parts: number): SideResult {
  return {
    side,
    prompt,
    decision: null,
    grounding: null,
    llm: null,
    parts: [],
    correctParts: 0,
    totalParts: parts,
    paidTinybars: "0",
    wastedTinybars: "0",
    outcome: "error",
    error: null,
  };
}

/** Run outcome from part outcomes; see SideResult. */
function sideOutcome(parts: readonly PartResult[]): SideResult["outcome"] {
  const correct = parts.filter((p) => p.outcome === "correct").length;
  if (parts.length > 0 && correct === parts.length) return "correct";
  if (correct > 0) return "partial";
  if (parts.some((p) => p.payment?.paid)) return "wrong";
  if (parts.length > 0 && parts.every((p) => p.outcome === "refused")) return "refused";
  if (parts.length > 0 && parts.every((p) => p.outcome === "refused" || p.outcome === "blocked")) return "blocked";
  return "error";
}

type PartContext = {
  config: SideConfig;
  choice: { option: number | null } | undefined;
  options: readonly ServiceView[];
  /** Tinybars already committed by this side; checked against the budget before paying. */
  spent: bigint;
  secrets: readonly string[];
};

/** One part: policy check, x402 payment, oracle grade. Never throws. */
async function runPart(part: number, task: SubTask, ctx: PartContext): Promise<PartResult> {
  const result: PartResult = {
    part,
    task,
    option: ctx.choice?.option ?? null,
    pick: null,
    policy: null,
    payment: null,
    response: null,
    verdict: null,
    outcome: "error",
    error: null,
  };
  if (!ctx.choice) return { ...result, error: `agent gave no choice for part ${part}` };
  const { option } = ctx.choice;
  if (option === null) return { ...result, outcome: "refused" };
  const pick = ctx.options[option - 1];
  if (!pick)
    return {
      ...result,
      error: `agent picked option ${option}, but only options 1-${ctx.options.length} were listed for ${task.category}`,
    };
  result.pick = { option, id: pick.id, name: pick.name, endpoint: pick.endpoint, pricePerCall: pick.pricePerCall };

  result.policy = checkPolicy(ctx.config.policy, pick, ctx.spent);
  if (!result.policy.allowed) return { ...result, outcome: "blocked" };

  try {
    const paid = await ctx.config.payAndCall({
      url: pick.endpoint,
      body: task.input,
      maxPrice: pick.pricePerCall,
      signer: ctx.config.signer,
      signal: AbortSignal.timeout(PAY_TIMEOUT_MS),
    });
    result.payment = { txId: paid.txId, paid: paid.paid, tinybars: paid.paid ? pick.pricePerCall : "0" };
    result.response = paid.response;
  } catch (error) {
    return { ...result, error: `payment/call: ${message(error, ctx.secrets)}` };
  }
  if (!result.payment.paid) return { ...result, error: "unpaid response" };

  result.verdict = grade(task, result.response);
  result.outcome = result.verdict.correct ? "correct" : "wrong";
  return result;
}

async function runSide(
  side: Side,
  args: RunArenaArgs,
  parts: readonly SubTask[],
  options: Readonly<Record<string, readonly ServiceView[]>>,
): Promise<SideResult> {
  const { llm, emit = () => {}, secrets = [] } = args;
  const config = args.sides[side];
  const prompt = buildPrompt(side, args.prompt, parts, options, config.policy.budgetTinybars);
  const result = emptyResult(side, prompt, parts.length);
  try {
    const answer = await decide(llm, prompt, args.mode ?? "may-refuse");
    result.decision = answer.value;
    result.grounding = checkGrounding(answer.value, prompt);
    result.llm = { model: answer.model, costUsd: answer.costUsd, ms: answer.ms, raw: answer.raw };
    emit({ type: "decided", side, decision: answer.value });
  } catch (error) {
    result.error = `agent: ${message(error, secrets)}`;
    emit({ type: "decided", side, decision: null, error: result.error });
    return result;
  }

  // Parts run in order so the budget check sees what earlier parts committed.
  let spent = 0n;
  for (const [part, task] of parts.entries()) {
    const choice = result.decision.choices.find((c) => c.part === part);
    const partResult = await runPart(part, task, {
      config,
      choice,
      options: options[task.category] ?? [],
      spent,
      secrets,
    });
    // A payment that failed mid-flight may still have settled, so the attempt counts against the budget.
    if (partResult.policy?.allowed && partResult.pick) spent += BigInt(partResult.pick.pricePerCall);
    result.parts.push(partResult);
    emit({ type: "part", side, part, result: partResult });
  }
  const paidFor = (keep: (p: PartResult) => boolean) =>
    result.parts.filter(keep).reduce((acc, p) => acc + BigInt(p.payment?.tinybars ?? "0"), 0n);
  result.correctParts = result.parts.filter((p) => p.outcome === "correct").length;
  result.paidTinybars = paidFor(() => true).toString();
  result.wastedTinybars = paidFor((p) => p.outcome === "wrong").toString();
  result.outcome = sideOutcome(result.parts);
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
  const parts = task.kind === "tasks" ? task.parts : [];
  const sides = {
    baseline: emptyResult("baseline", "", parts.length),
    skeptique: emptyResult("skeptique", "", parts.length),
  };
  // Refuse before either side runs when the oracle could not grade every part.
  const ungradable = parts.find((p) => !gradable(p));
  const unsupported =
    task.kind === "unsupported" ? task.reason : ungradable ? `no ground truth for ${JSON.stringify(ungradable)}` : null;
  // One shuffle per needed category, shared by both sides: option k of category c is options[c][k - 1].
  const options: Record<string, ServiceView[]> = {};
  if (unsupported === null)
    for (const category of new Set(parts.map((p) => p.category))) {
      const inCategory = args.services.filter((s) => s.category === category).sort((a, b) => a.id - b.id);
      options[category] = shuffleWithSeed(seed, inCategory, `${category}:`);
    }
  if (unsupported !== null) {
    for (const side of ["baseline", "skeptique"] as const) {
      sides[side] = { ...sides[side], outcome: "refused", error: `unsupported task: ${unsupported}` };
    }
  } else {
    const settle = async (side: Side) => {
      const result = await runSide(side, args, parts, options);
      emit({ type: "graded", side, result });
      return result;
    };
    [sides.baseline, sides.skeptique] = await Promise.all([settle("baseline"), settle("skeptique")]);
  }
  const record: ArenaRecord = {
    version: 3,
    runId: args.runId,
    at: now().toISOString(),
    prompt: args.prompt,
    task,
    model: args.llm.model,
    credentialSource: args.credentialSource ?? "server",
    modelKeySource: args.modelKeySource ?? "server",
    mode: args.mode ?? "may-refuse",
    systemPrompt: buyerSystemPrompt(args.mode ?? "may-refuse"),
    network: args.network,
    provenance: args.provenance,
    taskSource: args.taskSource,
    marketplace: { apiUrl: args.apiUrl, services: [...args.services] },
    agents: { baseline: agent(args.sides.baseline), skeptique: agent(args.sides.skeptique) },
    seed,
    options: Object.entries(options).flatMap(([category, list]) =>
      list.map((s, k) => ({ category: category as SubTask["category"], option: k + 1, serviceId: s.id })),
    ),
    sides,
    summary: summarise(sides),
  };
  const hash = hashRecord(record);
  emit({ type: "run-finished", record, hash });
  return { record, hash };
}
