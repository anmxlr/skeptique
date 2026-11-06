import { describe, expect, it } from "vitest";
import { BuyerRunSchema } from "./index";

const pick = {
  id: 1,
  name: "unit-convert",
  category: "conversion",
  endpoint: "http://127.0.0.1:4000/call",
  pricePerCall: "1",
  seller: "0x0000000000000000000000000000000000000001",
  ensName: "",
  median: 100,
  confidence: 1,
  rank: 100,
  nRounds: 1,
  lastRoundAt: "2026-11-06T00:00:00.000Z",
  popularityCalls: 0,
};

const run = {
  strategy: "skeptic",
  category: "conversion",
  task: { value: 3, from: "m", to: "cm" },
  pick,
  explanation: "Picked unit-convert.",
  response: { result: 300, unit: "cm" },
  txId: null,
  paid: false,
  at: "2026-11-06T00:00:00.000Z",
};

describe("buyer run schema", () => {
  it("accepts a skeptic or popularity run with or without a tx id", () => {
    expect(BuyerRunSchema.parse(run)).toEqual(run);
    expect(BuyerRunSchema.parse({ ...run, strategy: "popularity", txId: "0.0.5@1.2", paid: true }).txId).toBe(
      "0.0.5@1.2",
    );
  });

  it("rejects unknown strategies and empty explanations", () => {
    expect(BuyerRunSchema.safeParse({ ...run, strategy: "random" }).success).toBe(false);
    expect(BuyerRunSchema.safeParse({ ...run, explanation: "" }).success).toBe(false);
  });
});
