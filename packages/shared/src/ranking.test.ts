import { describe, expect, it } from "vitest";
import { type RankingInput, rankMarketplaceServices, rankService, rankServices } from "./index";

const NOW = Date.parse("2026-11-06T00:00:00.000Z");
const address = "0x0000000000000000000000000000000000000001";

function service(overrides: Partial<RankingInput> = {}): RankingInput {
  return {
    id: 1,
    name: "converter",
    category: "conversion",
    endpoint: "http://localhost:3000/call",
    pricePerCall: "1",
    seller: address,
    ensName: "converter.svc.skeptique.eth",
    median: 80,
    nReveals: 5,
    nRounds: 1,
    lastRoundAt: "2026-11-06T00:00:00.000Z",
    popularityCalls: 0,
    ...overrides,
  };
}

describe("confidence-adjusted marketplace ranking", () => {
  it("places a new service below an equally scored established service", () => {
    const newer = rankService(service({ id: 2, nReveals: 1 }), NOW);
    const established = rankService(service({ id: 1, nReveals: 5 }), NOW);
    expect(newer.rank).toBeLessThan(established.rank);
    expect(newer.confidence).toBe(0.2);
    expect(established.confidence).toBe(1);
  });

  it("decays stale confidence to the 0.3 floor", () => {
    const stale = rankService(service({ lastRoundAt: "2025-11-06T00:00:00.000Z" }), NOW);
    expect(stale.confidence).toBe(0.3);
    expect(stale.rank).toBe(69.5);
    expect(stale.rank).toBeGreaterThanOrEqual(80 - 15 * 0.7);
  });

  it("excludes probation services from ranked results and sorts ties by ID", () => {
    const input = [
      service({ id: 4 }),
      service({ id: 2 }),
      service({ id: 3, median: null, nRounds: 0, nReveals: 0, lastRoundAt: null }),
    ];
    expect(rankServices(input, NOW).map((value) => value.id)).toEqual([2, 4]);
    expect(rankMarketplaceServices(input, NOW).map((value) => value.id)).toEqual([2, 4, 3]);
    expect(rankService(input[2]!, NOW).probation).toBe(true);
  });
});
