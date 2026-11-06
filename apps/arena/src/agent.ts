import type { ServiceView } from "@skeptique/shared";
import type { Llm, LlmAnswer } from "./llm";
import { type Decision, DecisionSchema, type GradedTask, type Side } from "./schema";

/** Identical for both sides. The only difference between the agents is the listing data they are shown. */
export const BUYER_SYSTEM_PROMPT = `You are an autonomous buyer agent with a crypto wallet. You must pick at most one paid service to complete the user's task.
Rules:
- Use only the listing data provided. Never assume facts that are not in it.
- Pick the service most likely to return a correct answer. Price matters only between equally trustworthy options.
- If no listed service is likely to be correct, return serviceId null; buying nothing is allowed.
- Explain your choice in two sentences or fewer and list the listing fields you relied on in signalsUsed.`;

/*
 * What a buyer sees on today's x402 discovery: listing metadata and usage. Our demo services carry
 * internal names like "suite-gamer" that would leak the answer; a real bad actor picks a flattering
 * name. So both agents see the same neutral label instead of the name, never one side only.
 */
const baselineListing = (s: ServiceView) => ({
  id: s.id,
  label: `Service #${s.id}`,
  category: s.category,
  priceTinybars: s.pricePerCall,
  paidCallsByBuyers: s.popularityCalls,
});

/** The same listing plus Skeptique's stake-backed review evidence. */
const skeptiqueListing = (s: ServiceView) => ({
  ...baselineListing(s),
  skeptiqueMedianScore: s.median,
  skeptiqueConfidence: Number(s.confidence.toFixed(2)),
  skeptiqueRank: Number(s.rank.toFixed(1)),
  reviewRounds: s.nRounds,
  lastReviewedAt: s.lastRoundAt,
});

const LEGEND: Record<Side, string> = {
  baseline: "paidCallsByBuyers = number of paid calls other buyers made (popularity).",
  skeptique:
    "paidCallsByBuyers = number of paid calls other buyers made (popularity). skeptiqueMedianScore = stake-weighted median 0-100 from staked critics who paid to run the public test suite (40%) and their own private probes (60%); null = never reviewed. skeptiqueConfidence 0-1 grows with reviews and decays with age.",
};

export function buildPrompt(
  side: Side,
  userPrompt: string,
  task: GradedTask,
  services: readonly ServiceView[],
  budgetTinybars: bigint,
): string {
  const listings = services
    .filter((s) => s.category === task.category)
    .map(side === "baseline" ? baselineListing : skeptiqueListing);
  return [
    `User request: ${userPrompt}`,
    `Structured task (sent to the chosen service): ${JSON.stringify(task.input)}`,
    `Category: ${task.category}. Your budget: ${budgetTinybars} tinybars.`,
    `Field legend: ${LEGEND[side]}`,
    `Listings (the only data you have):\n${JSON.stringify(listings, null, 2)}`,
  ].join("\n\n");
}

export async function decide(llm: Llm, prompt: string): Promise<LlmAnswer<Decision>> {
  return llm.ask({ system: BUYER_SYSTEM_PROMPT, prompt, schema: DecisionSchema });
}
