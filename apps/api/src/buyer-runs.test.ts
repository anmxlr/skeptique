import type { BuyerRun } from "@skeptic/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const run = (strategy: BuyerRun["strategy"], name: string): BuyerRun => ({
  strategy,
  category: "conversion",
  task: { value: 3, from: "m", to: "cm" },
  pick: {
    id: 1,
    name,
    category: "conversion",
    endpoint: "http://127.0.0.1:4001/call",
    pricePerCall: "1",
    seller: "0x0000000000000000000000000000000000000001",
    ensName: "",
    median: 90,
    confidence: 1,
    rank: 90,
    nRounds: 1,
    lastRoundAt: "2026-11-06T00:00:00.000Z",
    popularityCalls: 0,
  },
  explanation: `Picked ${name}.`,
  response: { result: 300, unit: "cm" },
  txId: null,
  paid: false,
  at: "2026-11-06T00:00:00.000Z",
});

describe("buyer runs", () => {
  it("keeps the latest run per strategy for the Buyer page", async () => {
    const server = buildApp({ publicClient: { getChainId: async () => 31337 }, contracts: {} });
    expect((await server.inject({ method: "GET", url: "/buyer/runs" })).json()).toEqual([]);
    for (const body of [run("skeptic", "old"), run("popularity", "gamer"), run("skeptic", "good")]) {
      expect((await server.inject({ method: "POST", url: "/buyer/runs", payload: body })).statusCode).toBe(201);
    }
    const runs = (await server.inject({ method: "GET", url: "/buyer/runs" })).json();
    expect(runs.map((r: BuyerRun) => [r.strategy, r.pick.name])).toEqual([
      ["skeptic", "good"],
      ["popularity", "gamer"],
    ]);
    await server.close();
  });

  it("rejects a run that does not match the schema", async () => {
    const server = buildApp({ publicClient: { getChainId: async () => 31337 }, contracts: {} });
    const response = await server.inject({ method: "POST", url: "/buyer/runs", payload: { strategy: "random" } });
    expect(response.statusCode).toBe(400);
    await server.close();
  });
});
