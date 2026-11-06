import { readEnsScore } from "@skeptique/shared/ens";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnsScoreView } from "../components/ens-score";

describe("ENS scores UI", () => {
  it("renders the resolver's value and exact query even when the API mirror differs", async () => {
    const staleApi = { median: 99 };
    const snapshot = await readEnsScore(
      {
        getBlockNumber: async () => 42n,
        getEnsResolver: async () => "0x0000000000000000000000000000000000000001",
        getEnsText: async ({ key }) =>
          ({
            "eth.skeptique.score": "43",
            "eth.skeptique.confidence": "0.6",
            "eth.skeptique.round": "12",
            "eth.skeptique.hedera.tx": "0xabc",
          })[key] ?? null,
      },
      { name: "converter.svc.skeptique.eth", parentName: "skeptique.eth" },
    );
    if (!snapshot) throw new Error("Expected resolver score");
    const html = renderToStaticMarkup(<EnsScoreView state={{ status: "ready", snapshot }} />);
    expect(html).toContain("Score 43");
    expect(html).not.toContain(`Score ${staleApi.median}`);
    expect(html).toContain("eth.skeptique.score");
    expect(html).toContain("blockNumber: 42n");
  });
  it("does not invent a score when records are missing or RPC fails", () => {
    expect(renderToStaticMarkup(<EnsScoreView state={{ status: "unavailable" }} />)).not.toContain("Score 0");
    expect(renderToStaticMarkup(<EnsScoreView state={{ status: "error" }} />)).toContain("Could not read ENS score");
  });
});
