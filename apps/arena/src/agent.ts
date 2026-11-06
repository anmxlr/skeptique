import type { ServiceView } from "@skeptique/shared";
import type { Llm, LlmAnswer } from "./llm";
import { type BuyMode, type Decision, DecisionSchema, type GradedTask, type Side } from "./schema";

const RULES = `- Use only the listing data provided. Never assume facts that are not in it.
- Pick the service most likely to return a correct answer. Price matters only between equally trustworthy options.
- Option numbers are assigned at random for each run and carry no meaning.`;
const CLOSING =
  "- Explain your choice in two sentences or fewer and list the listing fields you relied on in signalsUsed.";

/**
 * Identical for both sides in a run; the only difference between the agents is the listing data.
 * "may-refuse": a cautious agent that can buy nothing. "must-buy": the user needs an answer, so the
 * agent must purchase from a listed service (the common setup for task-completing agents). Note the
 * Skeptique side's spend policy can still block a purchase in must-buy mode; the model cannot.
 */
export function buyerSystemPrompt(mode: BuyMode): string {
  const choice =
    mode === "must-buy"
      ? "- The user needs an answer now: you must pick one listed service. Return option null only if no service is listed for the category."
      : "- If no listed service is likely to be correct, return option null; buying nothing is allowed.";
  return `You are an autonomous buyer agent with a crypto wallet. You pick one paid service to complete the user's task.\nRules:\n${RULES}\n${choice}\n${CLOSING}`;
}

/*
 * What a buyer sees on today's x402 discovery: listing metadata and usage. Our demo services carry
 * internal names like "suite-gamer" that would leak the answer; a real bad actor picks a flattering
 * name. So both agents see the same neutral label instead of the name, never one side only.
 */
const baselineListing = (s: ServiceView, index: number) => ({
  option: index + 1,
  label: `Service #${index + 1}`,
  category: s.category,
  priceTinybars: s.pricePerCall,
  paidCallsByBuyers: s.popularityCalls,
});

/** The same listing plus Skeptique's stake-backed review evidence. */
const skeptiqueListing = (s: ServiceView, index: number) => ({
  ...baselineListing(s, index),
  skeptiqueMedianScore: s.median,
  skeptiqueConfidence: Number(s.confidence.toFixed(2)),
  skeptiqueRank: Number(s.rank.toFixed(1)),
  reviewRounds: s.nRounds,
  lastReviewedAt: s.lastRoundAt,
});

const LEGEND: Record<Side, string> = {
  baseline: "paidCallsByBuyers = number of paid calls other buyers made (popularity).",
  skeptique:
    "paidCallsByBuyers = number of paid calls other buyers made (popularity). skeptiqueMedianScore = stake-weighted median 0-100 from staked critics who ran the public test suite (40%) and their own private probes (60%); null = never reviewed. skeptiqueConfidence 0-1 grows with reviews and decays with age.",
};

/** `options` are the in-category services in option order: options[k - 1] is shown as option k. */
export function buildPrompt(
  side: Side,
  userPrompt: string,
  task: GradedTask,
  options: readonly ServiceView[],
  budgetTinybars: bigint,
): string {
  const listings = options.map(side === "baseline" ? baselineListing : skeptiqueListing);
  return [
    `User request: ${userPrompt}`,
    `Structured task (sent to the chosen service): ${JSON.stringify(task.input)}`,
    `Category: ${task.category}. Your budget: ${budgetTinybars} tinybars.`,
    `Field legend: ${LEGEND[side]}`,
    `Listings (the only data you have):\n${JSON.stringify(listings, null, 2)}`,
  ].join("\n\n");
}

export async function decide(llm: Llm, prompt: string, mode: BuyMode): Promise<LlmAnswer<Decision>> {
  return llm.ask({ system: buyerSystemPrompt(mode), prompt, schema: DecisionSchema });
}
