import type { RankingInput, RoundView } from "@skeptique/shared";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import type { PublicClient } from "viem";
import { type RoundSnapshot, toRoundView } from "./round-view";
import type { RoundViewSource } from "./rounds";

export interface RoundSource extends RoundViewSource {
  all(): Promise<RoundView[]>;
}

/** Indexes RoundManager events from the chain into RoundViews. */
export function createRoundSource(options: {
  client: Pick<PublicClient, "getContractEvents" | "readContract" | "getBlock">;
  address: `0x${string}`;
  now?: () => number;
  fromBlock?: bigint;
}): RoundSource {
  const all = async (): Promise<RoundView[]> => {
    const block = await options.client.getBlock();
    const fetchEvents = <E extends "RoundOpened" | "CriticCommitted" | "CriticRevealed" | "RoundFinalized">(
      eventName: E,
    ) =>
      options.client.getContractEvents({
        address: options.address,
        abi: roundManagerAbi,
        eventName,
        fromBlock: options.fromBlock ?? 0n,
        toBlock: "latest",
        toBlock: block.number,
        strict: true,
      });
    const [opened, committed, revealed, finalized] = await Promise.all([
      fetchEvents("RoundOpened"),
      fetchEvents("CriticCommitted"),
      fetchEvents("CriticRevealed"),
      fetchEvents("RoundFinalized"),
    ]);
    const now = options.now?.() ?? Number(block.timestamp);
    const views: RoundView[] = [];
    for (const log of opened) {
      const { roundId, serviceId, commitEnd, revealEnd } = log.args;
      if (roundId === undefined || serviceId === undefined || commitEnd === undefined || revealEnd === undefined)
        continue;
      const done = finalized.find((entry) => entry.args.roundId === roundId);
      const reveals = await Promise.all(
        revealed
          .filter((entry) => entry.args.roundId === roundId)
          .map(async ({ args }) => ({
            critic: args.critic as string,
            score: Number(args.score),
            honest:
              done && !done.args.isVoid
                ? await options.client.readContract({
                    address: options.address,
                    abi: roundManagerAbi,
                    functionName: "isHonest",
                    args: [roundId, args.critic as `0x${string}`],
                    blockNumber: block.number,
                  })
                : null,
          })),
      );
      const snapshot: RoundSnapshot = {
        id: Number(roundId),
        serviceId: Number(serviceId),
        commitEnd: Number(commitEnd),
        revealEnd: Number(revealEnd),
        finalized: done !== undefined,
        median: done && !done.args.isVoid ? Number(done.args.median) : null,
        committed: committed
          .filter((entry) => entry.args.roundId === roundId)
          .map((entry) => entry.args.critic as string),
        reveals,
        void: done?.args.isVoid === true,
      };
      views.push(toRoundView(snapshot, now));
    }
    return views;
  };

  return { all, get: async (roundId) => (await all()).find((round) => round.id === roundId) };
}

/** Adds each service's published score, reveal count, round count and last finalise time from its rounds. */
export function withRounds<T extends RankingInput>(
  source: { list(): Promise<T[]> | T[] },
  rounds: Pick<RoundSource, "all">,
  finalizedAt: (round: RoundView) => string = (round) => round.revealEnd,
) {
  return {
    async list(): Promise<T[]> {
      const [services, views] = await Promise.all([source.list(), rounds.all()]);
      return services.map((service) => {
        const finalized = views
          .filter((round) => round.serviceId === service.id && round.phase === "finalized")
          .sort((a, b) => b.id - a.id);
        const latest = finalized[0];
        if (!latest) return service;
        return {
          ...service,
          median: latest.median,
          nReveals: latest.reveals.length,
          nRounds: finalized.length,
          lastRoundAt: finalizedAt(latest),
        };
      });
    },
  };
}
