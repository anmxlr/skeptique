import { type BuyerRun, type ServiceView, ServiceViewSchema } from "@skeptic/shared";
import type { PayAndCall } from "@skeptic/x402-client";

export type Strategy = BuyerRun["strategy"];

export class NoCandidateError extends Error {}

const rated = (service: ServiceView) => service.median !== null;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Candidates in the category, best first: by rank (skeptic, rated only) or by paid calls (popularity). */
function rankCandidates(services: readonly ServiceView[], category: string, strategy: Strategy): ServiceView[] {
  const inCategory = services.filter((service) => service.category === category);
  const pool = strategy === "skeptic" ? inCategory.filter(rated) : inCategory;
  const key = (service: ServiceView) => (strategy === "skeptic" ? service.rank : service.popularityCalls);
  return [...pool].sort((a, b) => key(b) - key(a) || a.id - b.id);
}

export function pickService(services: readonly ServiceView[], category: string, strategy: Strategy): ServiceView {
  const [best] = rankCandidates(services, category, strategy);
  if (!best) throw new NoCandidateError(`No ${strategy === "skeptic" ? "rated " : ""}service in category ${category}`);
  return best;
}

/** Plain-language reason for a pick, built only from the listing's numbers. */
export function explainPick(pick: ServiceView, services: readonly ServiceView[], strategy: Strategy): string {
  const [, runnerUp] = rankCandidates(services, pick.category, strategy);
  if (strategy === "popularity") {
    const next = runnerUp ? ` Next: ${runnerUp.name} with ${plural(runnerUp.popularityCalls, "paid call")}.` : "";
    return `Picked ${pick.name}: the most used ${pick.category} service, with ${plural(pick.popularityCalls, "paid call")}.${next} This buyer does not consider quality scores.`;
  }
  const unrated = services.filter((service) => service.category === pick.category && !rated(service)).length;
  const next = runnerUp
    ? ` Next best: ${runnerUp.name} at rank ${runnerUp.rank.toFixed(1)} (median ${runnerUp.median}/100).`
    : "";
  const skipped = unrated ? ` Skipped ${unrated} unrated service${unrated === 1 ? "" : "s"}.` : "";
  return `Picked ${pick.name}: rank ${pick.rank.toFixed(1)}, from a median score ${pick.median}/100 over ${plural(pick.nRounds, "round")} with confidence ${Math.round(pick.confidence * 100)}%.${next}${skipped}`;
}

export interface RunBuyerArgs {
  apiUrl: string;
  category: string;
  task: unknown;
  strategy: Strategy;
  payAndCall: PayAndCall;
  signer: unknown;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Lists services, picks one, and pays it through x402 with no human in the loop. */
export async function runBuyer({
  apiUrl,
  category,
  task,
  strategy,
  payAndCall,
  signer,
  fetchImpl = fetch,
  now = () => new Date(),
}: RunBuyerArgs): Promise<BuyerRun> {
  const res = await fetchImpl(new URL("/services", apiUrl));
  if (!res.ok) throw new Error(`GET /services responded ${res.status}`);
  const services = ServiceViewSchema.array().parse(await res.json());
  const pick = pickService(services, category, strategy);
  const explanation = explainPick(pick, services, strategy);
  const { response, txId, paid } = await payAndCall({
    url: pick.endpoint,
    body: task,
    maxPrice: pick.pricePerCall,
    signer,
  });
  return { strategy, category, task, pick, explanation, response, txId, paid, at: now().toISOString() };
}

export async function publishBuyerRun(apiUrl: string, run: BuyerRun, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(new URL("/buyer/runs", apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run),
  });
  if (!res.ok) throw new Error(`POST /buyer/runs responded ${res.status}`);
}
