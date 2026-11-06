import type { Evidence } from "@skeptique/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServiceDetailView } from "../components/service-detail";

const evidence: Evidence = {
  roundId: 1,
  critic: "0x00000000000000000000000000000000000000c1",
  suite: [],
  probes: [],
  latencyMs: { p50: 1, p95: 2 },
  x402Txs: ["0.0.9185802@1793949293.996636002", "not-a-tx"],
  claimedCost: "0",
  score: 80,
  model: "none",
};
const service = {
  id: 1,
  name: "unit-convert",
  category: "units",
  endpoint: "http://x/call",
  pricePerCall: "1",
  seller: "0x1",
  ensName: "",
  median: null,
  confidence: 0,
  rank: 1,
  nRounds: 0,
  lastRoundAt: null,
  popularityCalls: 0,
} as never;

describe("service page payments", () => {
  it("links each settled x402 tx id to HashScan, built from the id", () => {
    const html = renderToString(<ServiceDetailView state={{ status: "ready", service, evidence }} />);
    expect(html).toContain('href="https://hashscan.io/testnet/transaction/0.0.9185802@1793949293.996636002"');
    expect(html).toContain("0.0.9185802@1793949293.996636002");
    expect(html).not.toContain('href="https://hashscan.io/testnet/transaction/not-a-tx"');
  });
});
