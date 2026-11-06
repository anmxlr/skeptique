import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerRoundRoutes } from "./rounds";

describe("round API route", () => {
  it("serves validated round state and handles invalid or missing IDs", async () => {
    const app = Fastify();
    const view = {
      id: 2,
      serviceId: 4,
      phase: "finalized" as const,
      commitEnd: "2026-11-06T00:00:00.000Z",
      revealEnd: "2026-11-06T00:01:00.000Z",
      median: 82,
      committed: [],
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
