import { serviceSlug } from "@skeptique/shared";
import type { SubnameChain } from "./ens/chain";

export type ListedName = { serviceId: number; seller: `0x${string}`; name: string };

export interface ListingFeed {
  list(): Promise<ListedName[]>;
}

export type PassResult = { created: number[]; failed: number[] };

/**
 * Mirrors listings into ENS subnames. It keeps no state of its own: the chain says which
 * subnames exist, so restarting or running a pass twice never creates a second subname.
 */
export function createListingRelayer(options: {
  feed: ListingFeed;
  chain: SubnameChain;
  onError?: (serviceId: number, cause: unknown) => void;
}) {
  return {
    async processOnce(): Promise<PassResult> {
      const result: PassResult = { created: [], failed: [] };
      for (const listing of await options.feed.list()) {
        const slug = serviceSlug(listing.name);
        try {
          if (await options.chain.hasSubname(slug)) continue;
          await options.chain.createSubname({ slug, seller: listing.seller });
          result.created.push(listing.serviceId);
        } catch (cause) {
          result.failed.push(listing.serviceId);
          options.onError?.(listing.serviceId, cause);
        }
      }
      return result;
    },

    async run(intervalMs: number, signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        await this.processOnce();
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, intervalMs);
          signal.addEventListener("abort", () => (clearTimeout(timer), resolve(undefined)), { once: true });
        });
      }
    },
  };
}
