import type { ServiceView } from "@skeptique/shared";

export type PolicyCheck = { rule: string; pass: boolean; detail: string };
export type PolicyResult = { allowed: boolean; checks: PolicyCheck[] };

export type SpendPolicy = {
  budgetTinybars: bigint;
  maxPerCallTinybars: bigint;
  /** Evidence rules apply to the Skeptique side only; null disables them (the status-quo agent). */
  evidence: { minMedian: number; minRounds: number } | null;
};

/** Deterministic pre-payment checks. The model decides what to buy; this decides whether money moves. */
export function checkPolicy(policy: SpendPolicy, service: ServiceView, spentTinybars: bigint): PolicyResult {
  const price = BigInt(service.pricePerCall);
  const checks: PolicyCheck[] = [
    {
      rule: "per-call cap",
      pass: price <= policy.maxPerCallTinybars,
      detail: `${price} ≤ ${policy.maxPerCallTinybars} tinybars`,
    },
    {
      rule: "budget",
      pass: spentTinybars + price <= policy.budgetTinybars,
      detail: `${spentTinybars} spent + ${price} ≤ ${policy.budgetTinybars} tinybars`,
    },
  ];
  if (policy.evidence) {
    const { minMedian, minRounds } = policy.evidence;
    checks.push(
      {
        rule: "reviewed",
        pass: service.nRounds >= minRounds,
        detail: `${service.nRounds} finalised review round(s), need ≥ ${minRounds}`,
      },
      {
        rule: "minimum score",
        pass: service.median !== null && service.median >= minMedian,
        detail: `median ${service.median ?? "none"}, need ≥ ${minMedian}`,
      },
    );
  }
  return { allowed: checks.every((c) => c.pass), checks };
}
