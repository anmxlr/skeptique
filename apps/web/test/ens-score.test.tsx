import { readEnsScore } from "@skeptique/shared/ens";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnsScore, EnsScoreView } from "../components/ens-score";
import { MarketplaceView } from "../components/marketplace";
import { ServiceDetailView } from "../components/service-detail";
import type { ApiRoutes } from "../lib/api";

describe("ENS scores UI", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_ENS_PARENT_NAME", "skeptique.eth"));
  afterEach(() => vi.unstubAllEnvs());
  it("requires a configured namespace rather than assuming a production parent", () => {
    vi.stubEnv("NEXT_PUBLIC_ENS_PARENT_NAME", undefined);
    expect(renderToStaticMarkup(<EnsScore name="demo.svc.skeptique.eth" />)).toContain(
      "ENS reputation is not configured",
    );
  });
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
  it("mounts the resolver reader in both real views without displaying a stale API score", () => {
    const service: ApiRoutes["/services"][number] = {
      id: 1,
      name: "converter",
      category: "conversion",
      seller: "0x0000000000000000000000000000000000000001",
      endpoint: "https://service.invalid/call",
      pricePerCall: "1",
      ensName: "converter.svc.skeptique.eth",
      median: 99,
      confidence: 0.6,
      rank: 90,
      nRounds: 1,
      lastRoundAt: "2026-11-06T00:00:00Z",
      popularityCalls: 0,
    };
    for (const html of [
      renderToStaticMarkup(<MarketplaceView state={{ status: "ready", services: [service] }} />),
      renderToStaticMarkup(<ServiceDetailView state={{ status: "ready", service, reviews: [] }} />),
    ]) {
      expect(html).toContain("Reading ENS score");
      expect(html).not.toContain("Score 99");
    }
    const unnamed = renderToStaticMarkup(
      <MarketplaceView state={{ status: "ready", services: [{ ...service, ensName: "" }] }} />,
    );
    expect(unnamed).toContain("ENS score unavailable");
    expect(unnamed).not.toContain("Score 99");
  });
});
