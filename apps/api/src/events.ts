import { EventSchemas } from "@skeptique/shared";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import type { FastifyInstance } from "fastify";
import type { PublicClient } from "viem";

export interface ChainEventDeps {
  client: Pick<PublicClient, "getBlockNumber" | "getContractEvents">;
  /** RoundManager address. */
  address: `0x${string}`;
  pollMs?: number;
}

export type ChainEvent = { type: keyof typeof EventSchemas; data: unknown };

type RoundLog = { eventName: string; args: Record<string, unknown> };

/** A RoundManager log in the shared event shape (spec/03), or null for events the stream does not carry. */
function toChainEvent({ eventName, args }: RoundLog): ChainEvent | null {
  const n = (value: unknown) => Number(value as bigint);
  switch (eventName) {
    case "RoundOpened":
      return {
        type: eventName,
        data: EventSchemas.RoundOpened.parse({
          roundId: n(args.roundId),
          serviceId: n(args.serviceId),
          commitEnd: n(args.commitEnd),
          revealEnd: n(args.revealEnd),
        }),
      };
    case "CriticCommitted":
      return {
        type: eventName,
        data: EventSchemas.CriticCommitted.parse({ roundId: n(args.roundId), critic: args.critic }),
      };
    case "CriticRevealed":
      return {
        type: eventName,
        data: EventSchemas.CriticRevealed.parse({
          roundId: n(args.roundId),
          critic: args.critic,
          score: n(args.score),
          evidenceHash: args.evidenceHash,
        }),
      };
    case "RoundFinalized":
      return {
        type: eventName,
        data: EventSchemas.RoundFinalized.parse({
          roundId: n(args.roundId),
          serviceId: n(args.serviceId),
          median: n(args.median),
          nReveals: n(args.nReveals),
          void: args.isVoid,
        }),
      };
    default:
      return null;
  }
}

/**
 * `GET /events`: server-sent round events. A new subscriber first gets every earlier event, then new ones as
 * blocks arrive, so a page that opens mid-round still knows the round's state.
 */
export function registerEventRoutes(app: FastifyInstance, deps: ChainEventDeps): void {
  const pollMs = deps.pollMs ?? 500;
  const open = new Set<() => void>();
  app.addHook("onClose", async () => {
    for (const close of open) close();
  });

  app.get("/events", async (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    let closed = false;
    let timer: NodeJS.Timeout | undefined;
    const close = () => {
      closed = true;
      clearTimeout(timer);
      open.delete(close);
      res.end();
    };
    open.add(close);
    request.raw.on("close", close);

    let fromBlock = 0n;
    const poll = async () => {
      try {
        const toBlock = await deps.client.getBlockNumber();
        if (toBlock >= fromBlock) {
          const logs = (await deps.client.getContractEvents({
            address: deps.address,
            abi: roundManagerAbi,
            fromBlock,
            toBlock,
          })) as unknown as RoundLog[];
          for (const event of logs.map(toChainEvent)) {
            if (event && !closed) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
          }
          fromBlock = toBlock + 1n;
        }
      } catch (error) {
        request.log.warn({ error }, "event stream poll failed; retrying");
      }
      if (!closed) timer = setTimeout(poll, pollMs);
    };
    await poll();
  });
}
