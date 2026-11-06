import { TestSuiteSchema } from "@skeptique/shared";
import { attachProbeEvidence, createConfiguredProbeModel, type ProbeModel, runProbeEvaluation } from "./probes";
import { publishCriticEvidence, runCriticSuite } from "./runner";

type SuiteArgs = Parameters<typeof runCriticSuite>[0];

/** Fetch, evaluate both populations, then publish only the complete review. */
export async function runServiceReview(
  args: Omit<SuiteArgs, "suite" | "judge" | "model"> & {
    suiteUrl: string;
    evidenceUrl: string;
    serviceDescription: string;
    seed: number;
    modelName?: string;
    probeModel?: ProbeModel;
    fetchImpl?: typeof fetch;
  },
) {
  const timeoutMs = args.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff)
    throw new Error("Invalid timeoutMs");
  if (
    args.budgetMs !== undefined &&
    (!Number.isSafeInteger(args.budgetMs) || args.budgetMs <= 0 || args.budgetMs > 0x7fffffff)
  )
    throw new Error("Invalid budgetMs");
  const deadline = args.budgetMs === undefined ? Infinity : performance.now() + args.budgetMs;
  const budget = () => {
    const value = Math.ceil(deadline - performance.now());
    if (value <= 0) throw new Error("Critic review budget exceeded");
    return value;
  };
  const remaining = () => Math.min(timeoutMs, budget());
  const response = await (args.fetchImpl ?? fetch)(args.suiteUrl, { signal: AbortSignal.timeout(remaining()) });
  if (!response.ok) throw new Error(`Suite fetch returned ${response.status}`);
  const suite = TestSuiteSchema.parse(await response.json());
  const model = args.probeModel ?? createConfiguredProbeModel();
  const publicResult = await runCriticSuite({
    ...args,
    suite,
    budgetMs: Number.isFinite(deadline) ? budget() : undefined,
    model: args.modelName ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
    judge: model.judge,
  });
  const probeTransactions: string[] = [];
  const probes = await runProbeEvaluation({
    suite,
    serviceDescription: args.serviceDescription,
    seed: args.seed,
    model,
    timeoutMs,
    budgetMs: Number.isFinite(deadline) ? budget() : undefined,
    serviceCall: async (body, signal) => {
      const result = await args.payAndCall({
        url: args.endpoint,
        body,
        signer: args.signer,
        maxPrice: args.maxPrice,
        criticCall: true,
        signal,
      });
      if (result.txId) probeTransactions.push(result.txId);
      return result.response;
    },
  });
  const evidence = attachProbeEvidence(
    { ...publicResult.evidence, x402Txs: [...publicResult.evidence.x402Txs, ...probeTransactions] },
    probes,
  );
  const evidenceHash = await publishCriticEvidence({
    evidence,
    url: args.evidenceUrl,
    fetchImpl: args.fetchImpl,
    timeoutMs: remaining(),
  });
  return {
    evidence,
    evidenceHash,
    suitePass: publicResult.suitePass,
    probePass: probes.passRate,
    errorRate: publicResult.errorRate,
  };
}
