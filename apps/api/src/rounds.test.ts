import Fastify from "fastify";
import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { createRoundSource, registerRoundRoutes } from "./rounds";

describe("round API route", () => {
  it("pins chain reads to one block and never publishes verdicts or median for a void round", async () => {
    const client = {
      getBlock: async () => ({ number: 42n, timestamp: 250n }),
      readContract: async (request: { blockNumber: bigint; functionName: string }) => {
        expect(request.blockNumber).toBe(42n);
        expect(request.functionName).toBe("getRound");
        return { serviceId: 1n, commitEnd: 100n, revealEnd: 200n, median: 0, nReveals: 1, finalized: true };
      },
      getContractEvents: async (request: { toBlock: bigint; strict: boolean; eventName: string }) => {
        expect(request.toBlock).toBe(42n);
        expect(request.strict).toBe(true);
        return request.eventName === "RoundFinalized"
          ? [{ args: { isVoid: true } }]
          : [{ args: { critic: "0x0000000000000000000000000000000000000001", score: 72 } }];
      },
    } as unknown as Pick<PublicClient, "getBlock" | "readContract" | "getContractEvents">;
    const view = await createRoundSource({ client, address: "0x0000000000000000000000000000000000000002" }).get(1);
    expect(view).toMatchObject({ phase: "void", median: null, reveals: [{ score: 72, honest: null }] });
  });

  it("serves validated round state and handles invalid or missing IDs", async () => {
    const app = Fastify();
    const view = {
      id: 2,
      serviceId: 4,
      phase: "finalized" as const,
      commitEnd: "2026-11-06T00:00:00.000Z",
      revealEnd: "2026-11-06T00:01:00.000Z",
      median: 82,
      reveals: [],
    };
    registerRoundRoutes(app, { get: (id) => (id === 2 ? view : undefined) });
    expect((await app.inject({ method: "GET", url: "/rounds/2" })).json()).toEqual(view);
    expect((await app.inject({ method: "GET", url: "/rounds/nope" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/rounds/99" })).statusCode).toBe(404);
    await app.close();
  });

  it("rejects zero and unsafe integer IDs before reading the index", async () => {
    const app = Fastify();
    let reads = 0;
    registerRoundRoutes(app, {
      get: () => {
        reads++;
        return undefined;
      },
    });
    for (const id of ["0", "9007199254740993", "9".repeat(100)]) {
      expect((await app.inject({ method: "GET", url: `/rounds/${id}` })).statusCode).toBe(400);
    }
    expect(reads).toBe(0);
    await app.close();
  });
});
