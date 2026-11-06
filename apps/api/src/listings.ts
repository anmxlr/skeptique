import {
  type RankingInput,
  serviceEnsName,
  serviceSlug,
  suiteHash,
  type TestSuite,
  TestSuiteSchema,
} from "@skeptique/shared";
import { serviceListedEvent, serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import type { FastifyInstance } from "fastify";
import { namehash, type PublicClient } from "viem";

/** A listed service as the marketplace serves it: ServiceView plus the listing's specHash and bounty. */
export type ListedService = RankingInput & { specHash: string; bounty: string };

export type SuiteLookup =
  | { ok: true; suite: TestSuite }
  | { ok: false; error: string; specHash: string; actualHash?: string };

export interface ListingSource {
  list(): Promise<ListedService[]>;
  /** The service's public suite, checked against its listed specHash; undefined when the service is unknown. */
  suite(serviceId: number): Promise<SuiteLookup | undefined>;
}

type Listing = ReturnType<typeof serviceListedEvent>;

/** Indexes ServiceRegistry listings from the chain and verifies each service's public suite. */
export function createRegistrySource(options: {
  client: Pick<PublicClient, "getContractEvents" | "readContract">;
  address: `0x${string}`;
  /** Explicit service ID -> ENS name mapping; namehash must match the registered service's node. */
  serviceNames?: Record<string, string>;
  /** ENS_PARENT_NAME: services are named `<slug>.svc.<parent>`. Empty when ENS is not configured. */
  ensParent?: string;
  fetch?: (url: string | URL | Request) => Promise<Response>;
}): ListingSource {
  const fetchSuite = options.fetch ?? fetch;
  // specHash is fixed at listing, so a suite that matched it once stays valid.
  const verified = new Map<number, TestSuite>();

  const listings = async (): Promise<Listing[]> => {
    const logs = await options.client.getContractEvents({
      address: options.address,
      abi: serviceRegistryAbi,
      eventName: "ServiceListed",
      fromBlock: 0n,
    });
    return logs.map((log) => serviceListedEvent(log.args));
  };

  const lookup = async (listing: Listing): Promise<SuiteLookup> => {
    const known = verified.get(listing.serviceId);
    if (known) return { ok: true, suite: known };
    const { specHash } = listing;
    let body: unknown;
    try {
      const res = await fetchSuite(new URL("suite.json", listing.endpoint));
      if (!res.ok) throw new Error(`responded ${res.status}`);
      body = await res.json();
    } catch (cause) {
      return { ok: false, error: `Suite unreachable: ${cause instanceof Error ? cause.message : cause}`, specHash };
    }
    const parsed = TestSuiteSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: "Suite is not a valid TestSuite", specHash };
    const actualHash = suiteHash(parsed.data);
    if (actualHash !== specHash.toLowerCase())
      return { ok: false, error: "Suite hash does not match specHash", specHash, actualHash };
    verified.set(listing.serviceId, parsed.data);
    return { ok: true, suite: parsed.data };
  };

  return {
    async list() {
      const services: ListedService[] = [];
      for (const listing of await listings()) {
        const suite = await lookup(listing);
        if (!suite.ok) continue;
        const { bounty, ensNode } = await options.client.readContract({
          address: options.address,
          abi: serviceRegistryAbi,
          functionName: "getService",
          args: [BigInt(listing.serviceId)],
        });
        const configuredName = options.serviceNames?.[String(listing.serviceId)] ??
          (options.ensParent ? serviceEnsName(serviceSlug(suite.suite.serviceName), options.ensParent) : undefined);
        services.push({
          id: listing.serviceId,
          name: suite.suite.serviceName,
          category: suite.suite.category,
          endpoint: listing.endpoint,
          pricePerCall: listing.pricePerCall,
          seller: listing.seller,
          ensName:
            configuredName && namehash(configuredName).toLowerCase() === ensNode?.toLowerCase() ? configuredName : "",
          median: null,
          nReveals: 0,
          nRounds: 0,
          lastRoundAt: null,
          popularityCalls: 0,
          specHash: listing.specHash,
          bounty: bounty.toString(),
        });
      }
      return services;
    },
    async suite(serviceId) {
      const listing = (await listings()).find((candidate) => candidate.serviceId === serviceId);
      return listing && lookup(listing);
    },
  };
}

export function registerSuiteRoute(app: FastifyInstance, source: Pick<ListingSource, "suite">): void {
  app.get<{ Params: { id: string } }>("/services/:id/suite", async (request, reply) => {
    const result = await source.suite(Number(request.params.id));
    if (!result) return reply.code(404).send({ error: "Unknown service" });
    if (!result.ok) {
      const { ok: _ok, ...body } = result;
      return reply.code(502).send(body);
    }
    return result.suite;
  });
}
