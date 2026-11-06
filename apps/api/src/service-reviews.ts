import { createHash } from "node:crypto";
import { type Evidence, EvidenceSchema } from "@skeptique/shared";
import canonicalize from "canonicalize";
import type { FastifyInstance } from "fastify";
import { type Address, type PublicClient, parseAbi } from "viem";
import type { EvidenceStore } from "./evidence";

const events = parseAbi([
  "event RoundFinalized(uint256 indexed roundId, uint256 indexed serviceId, uint8 median, uint8 nReveals, bool isVoid)",
  "event CriticRevealed(uint256 indexed roundId, address indexed critic, uint8 score, bytes32 evidenceHash)",
]);
export type ServiceReview = { evidenceHash: string; evidence: Evidence };
export interface ServiceReviewSource {
  list(serviceId: number): Promise<ServiceReview[]>;
}

/** Only evidence anchored to the latest non-void finalized round is shown as a review. */
export function createServiceReviewSource(options: {
  client: Pick<PublicClient, "getContractEvents">;
  address: Address;
  store: EvidenceStore;
}): ServiceReviewSource {
  return {
    async list(serviceId) {
      const rounds = await options.client.getContractEvents({
        address: options.address,
        abi: events,
        eventName: "RoundFinalized",
        args: { serviceId: BigInt(serviceId) },
        fromBlock: 0n,
      });
      const round = rounds
        .filter((log) => log.args.isVoid === false)
        .sort((a, b) =>
          a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber < b.blockNumber ? 1 : -1,
        )[0];
      if (!round?.args.roundId) return [];
      const reveals = await options.client.getContractEvents({
        address: options.address,
        abi: events,
        eventName: "CriticRevealed",
        args: { roundId: round.args.roundId },
        fromBlock: 0n,
      });
      const reviews: ServiceReview[] = [];
      for (const reveal of reveals) {
        const hash = reveal.args.evidenceHash;
        if (!hash || !reveal.args.critic) continue;
        const parsed = EvidenceSchema.safeParse(await options.store.get(hash.toLowerCase()));
        if (!parsed.success) continue;
        const evidence = parsed.data;
        if (
          BigInt(evidence.roundId) !== round.args.roundId ||
          evidence.critic.toLowerCase() !== reveal.args.critic.toLowerCase() ||
          evidence.score !== reveal.args.score
        )
          continue;
        const canonical = canonicalize(evidence);
        if (canonical === undefined) continue;
        const digest = `0x${createHash("sha256").update(canonical).digest("hex")}`;
        if (digest !== hash.toLowerCase()) continue;
        reviews.push({ evidenceHash: hash, evidence });
      }
      return reviews;
    },
  };
}

export function registerServiceReviewRoutes(app: FastifyInstance, source: ServiceReviewSource) {
  app.get<{ Params: { id: string } }>("/services/:id/reviews", async (request, reply) => {
    const id = Number(request.params.id);
    if (!/^\d+$/.test(request.params.id) || !Number.isSafeInteger(id) || id <= 0)
      return reply.code(400).send({ error: "Invalid service ID" });
    return source.list(id);
  });
}
