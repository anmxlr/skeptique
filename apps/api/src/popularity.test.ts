import type { RankingInput } from "@skeptique/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const CRITIC = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BUYER = "0x0000000000000000000000000000000000000b01";

const service = (id: number, name: string): RankingInput => ({
  id,
  name,
  category: "conversion",
  endpoint: `http://127.0.0.1:400${id}/call`,
  pricePerCall: "1",
  seller: "0x0000000000000000000000000000000000000001",
  ensName: "",
  median: 80,
  nReveals: 5,
  nRounds: 1,
  lastRoundAt: new Date().toISOString(),
  popularityCalls: 999,
});

function app() {
  return buildApp({
    publicClient: { getChainId: async () => 31337 },
    contracts: {},
    marketplace: {
      source: { list: () => [service(1, "good"), service(2, "gamer")] },
      isCritic: (address) => address.toLowerCase() === CRITIC.toLowerCase(),
    },
  });
}

const report = (server: ReturnType<typeof app>, serviceId: number, payer: string) =>
  server.inject({ method: "POST", url: "/calls", payload: { serviceId, payer } });

describe("popularity", () => {
  it("counts paid calls per service and serves them as popularityCalls", async () => {
    const server = app();
    for (let i = 0; i < 3; i++) expect((await report(server, 2, BUYER)).json()).toEqual({ counted: true });
    await report(server, 1, BUYER);
    const services = (await server.inject({ method: "GET", url: "/services" })).json();
    expect(Object.fromEntries(services.map((s: RankingInput) => [s.name, s.popularityCalls]))).toEqual({
      good: 1,
      gamer: 3,
    });
    await server.close();
  });

  it("critic-tagged calls never count toward popularity", async () => {
    const server = app();
    for (const payer of [CRITIC, CRITIC.toLowerCase()]) {
      const response = await report(server, 1, payer);
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ counted: false });
    }
    const services = (await server.inject({ method: "GET", url: "/services" })).json();
    expect(services.every((s: RankingInput) => s.popularityCalls === 0)).toBe(true);
    await server.close();
  });

  it("rejects malformed call reports", async () => {
    const server = app();
    expect((await report(server, 1, "not-an-address")).statusCode).toBe(400);
    expect((await report(server, -1, BUYER)).statusCode).toBe(400);
    await server.close();
  });
});
