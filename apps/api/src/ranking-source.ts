import { EventSchemas } from "@skeptique/shared";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { getAbiItem, type PublicClient } from "viem";
import type { ListingSource } from "./listings";

const finalizedEvent = getAbiItem({ abi: roundManagerAbi, name: "RoundFinalized" });

/** Supplies review history to the existing ranking formula; reads one pinned range for all listed services. */
export function createFinalizedRankingSource(options: {
  listing: ListingSource;
  client: Pick<PublicClient, "getBlockNumber" | "getLogs" | "getBlock">;
  address: `0x${string}`;
}): ListingSource {
  return {
    suite: (id) => options.listing.suite(id),
    async list() {
      const [services, head] = await Promise.all([
        options.listing.list(),
        options.client.getBlockNumber({ cacheTime: 0 }),
      ]);
      const logs = await options.client.getLogs({
        address: options.address,
        event: finalizedEvent,
        fromBlock: 0n,
        toBlock: head,
        strict: true,
      });
      const histories = new Map<
        number,
        { count: number; median: number; nReveals: number; blockHash: `0x${string}` }
      >();
      const ids = new Set(services.map((service) => service.id));
      for (const log of [...logs].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
      )) {
        const event = EventSchemas.RoundFinalized.parse({
          roundId: Number(log.args.roundId),
          serviceId: Number(log.args.serviceId),
          median: log.args.median,
          nReveals: log.args.nReveals,
          void: log.args.isVoid,
        });
        if (event.void || !ids.has(event.serviceId)) continue;
        histories.set(event.serviceId, {
          count: (histories.get(event.serviceId)?.count ?? 0) + 1,
          median: event.median,
          nReveals: event.nReveals,
          blockHash: log.blockHash,
        });
      }
      const times = new Map<`0x${string}`, Promise<string>>();
      return Promise.all(
        services.map(async (service) => {
          const history = histories.get(service.id);
          if (!history) return service;
          let time = times.get(history.blockHash);
          if (!time) {
            time = options.client
              .getBlock({ blockHash: history.blockHash })
              .then((block) => new Date(Number(block.timestamp) * 1000).toISOString());
            times.set(history.blockHash, time);
          }
          return {
            ...service,
            median: history.median,
            nReveals: history.nReveals,
            nRounds: history.count,
            lastRoundAt: await time,
          };
        }),
      );
    },
  };
}
