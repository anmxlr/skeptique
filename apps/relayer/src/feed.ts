import { serviceListedEvent, serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { TestSuiteSchema } from "@skeptique/shared";
import type { PublicClient } from "viem";
import type { ListingFeed } from "./relayer";

/** Reads ServiceRegistry listings and names each from the service's public suite. */
export function createRegistryFeed(options: {
  client: Pick<PublicClient, "getContractEvents">;
  address: `0x${string}`;
  fetch?: (url: URL) => Promise<Response>;
}): ListingFeed {
  const fetchSuite = options.fetch ?? fetch;
  return {
    async list() {
      const logs = await options.client.getContractEvents({
        address: options.address,
        abi: serviceRegistryAbi,
        eventName: "ServiceListed",
        fromBlock: 0n,
      });
      const named = [];
      for (const log of logs) {
        const listing = serviceListedEvent(log.args);
        try {
          const res = await fetchSuite(new URL("suite.json", listing.endpoint));
          if (!res.ok) continue;
          const suite = TestSuiteSchema.safeParse(await res.json());
          if (suite.success)
            named.push({
              serviceId: listing.serviceId,
              seller: listing.seller as `0x${string}`,
              name: suite.data.serviceName,
            });
        } catch {
          // The service is unreachable now; the next pass tries again.
        }
      }
      return named;
    },
  };
}
