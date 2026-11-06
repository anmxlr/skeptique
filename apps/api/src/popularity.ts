import type { FastifyInstance } from "fastify";
import type { MarketplaceSource } from "./marketplace";

/** Whether an address belongs to a registered critic. The API decides; sellers never see a critic tag. */
export type IsCritic = (address: string) => boolean | Promise<boolean>;

/** Counts paid calls per service, leaving out calls paid by critics (spec/02 §6). */
export class PopularityCounter {
  readonly #counts = new Map<number, number>();

  constructor(private readonly isCritic: IsCritic) {}

  async record(serviceId: number, payer: string): Promise<boolean> {
    if (await this.isCritic(payer)) return false;
    this.#counts.set(serviceId, this.count(serviceId) + 1);
    return true;
  }

  count(serviceId: number): number {
    return this.#counts.get(serviceId) ?? 0;
  }
}

/** Serves `popularityCalls` from the counter instead of the source. */
export function withPopularity(source: MarketplaceSource, counter: PopularityCounter): MarketplaceSource {
  return {
    list: async () =>
      (await source.list()).map((service) => ({ ...service, popularityCalls: counter.count(service.id) })),
  };
}

const callReport = {
  type: "object",
  required: ["serviceId", "payer"],
  additionalProperties: false,
  properties: {
    serviceId: { type: "integer", minimum: 0 },
    payer: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
  },
} as const;

export function registerPopularityRoutes(app: FastifyInstance, counter: PopularityCounter): void {
  app.post<{ Body: { serviceId: number; payer: string } }>(
    "/calls",
    { schema: { body: callReport } },
    async (request, reply) => {
      const counted = await counter.record(request.body.serviceId, request.body.payer);
      return reply.code(202).send({ counted });
    },
  );
}
