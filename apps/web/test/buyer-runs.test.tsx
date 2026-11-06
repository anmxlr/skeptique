import type { BuyerRun } from "@skeptique/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuyerRunsView } from "../components/buyer-runs";

const run = (strategy: BuyerRun["strategy"], name: string, txId: string | null): BuyerRun => ({
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
    median: 100,
    confidence: 1,
    rank: 100,
    nRounds: 1,
    lastRoundAt: "2026-11-06T00:00:00.000Z",
    popularityCalls: 1000,
  },
  explanation: `Picked ${name} because of the numbers.`,
  response: { result: 300, unit: "cm" },
  txId,
  paid: txId !== null,
  at: "2026-11-06T00:00:00.000Z",
});

describe("buyer runs view", () => {
  it("shows both buyers side by side with pick, explanation, result and payment", () => {
    const html = renderToString(
      <BuyerRunsView runs={[run("skeptique", "unit-convert", "0.0.7@1.2"), run("popularity", "suite-gamer", null)]} />,
    );
    expect(html).toContain("Skeptique buyer");
    expect(html).toContain("Popularity buyer");
    expect(html).toContain("unit-convert");
    expect(html).toContain("Picked suite-gamer because of the numbers.");
    expect(html).toContain("&quot;result&quot;:300");
    expect(html).toContain("0.0.7@1.2");
    expect(html).toContain("No on-chain payment (local mode)");
  });

  it("says when a buyer has not run yet", () => {
    const html = renderToString(<BuyerRunsView runs={[]} />);
    expect(html.match(/Not run yet/g)).toHaveLength(2);
  });
});
