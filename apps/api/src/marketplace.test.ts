import type { RankingInput } from "@skeptique/shared";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerMarketplaceRoutes } from "./marketplace";

const base: RankingInput = {
  id: 1,
  name: "same score",
  category: "conversion",
  endpoint: "http://localhost:3000/call",
  pricePerCall: "1",
  seller: "0x0000000000000000000000000000000000000001",
  ensName: "same.svc.skeptique.eth",
  median: 80,
  nReveals: 5,
  nRounds: 1,
  lastRoundAt: "2026-11-06T00:00:00.000Z",
  popularityCalls: 0,
};

describe("marketplace ranking route", () => {
  it("returns ranked services first with confidence data and leaves probation last", async () => {
    const app = Fastify();
    registerMarketplaceRoutes(
      app,
      {
        list: () => [
          { ...base, id: 4, name: "new", nReveals: 1 },
          { ...base, id: 2, name: "established" },
          { ...base, id: 3, name: "probation", median: null, nReveals: 0, nRounds: 0, lastRoundAt: null },
        ],
      },
      () => Date.parse("2026-11-06T00:00:00.000Z"),
    );
    const response = await app.inject({ method: "GET", url: "/services" });
    const services = response.json();
    expect(services.map((service: RankingInput) => service.id)).toEqual([2, 4, 3]);
    expect(services[0].confidence).toBe(1);
    expect(services[2]).toMatchObject({ median: null, rank: 0, confidence: 0 });
    await app.close();
  });
});
