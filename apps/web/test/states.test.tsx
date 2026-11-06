import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuyerRunsView } from "../components/buyer-runs";
import { CriticsView } from "../components/critics";
import { MarketplaceView } from "../components/marketplace";
import { ServiceDetailView } from "../components/service-detail";
import { Skeleton, Toast } from "../components/states";

const skeletonCards = (html: string) => html.match(/class="skeleton-card"/g)?.length ?? 0;

describe("loading skeletons", () => {
  it("announce what is loading once and draw placeholder cards hidden from screen readers", () => {
    const html = renderToString(<Skeleton label="Loading services" count={3} />);
    expect(html).toMatch(/role="status"/);
    expect(html).toContain("Loading services");
    expect(skeletonCards(html)).toBe(3);
    expect(html).toMatch(/class="skeleton-grid" aria-hidden="true"/);
  });

  it("are used while the Marketplace, Critics, service and Buyer pages load", () => {
    const pages = [
      renderToString(<MarketplaceView state={{ status: "loading" }} />),
      renderToString(<CriticsView state={{ status: "loading" }} />),
      renderToString(<ServiceDetailView state={{ status: "loading" }} />),
      renderToString(<BuyerRunsView runs={[]} loading />),
    ];
    for (const html of pages) expect(skeletonCards(html)).toBeGreaterThan(0);
    expect(pages[3]).not.toContain("Not run yet");
  });
});

describe("errors", () => {
  it("show a first-load failure inline, styled as an error", () => {
    expect(renderToString(<MarketplaceView state={{ status: "error", message: "down" }} />)).toMatch(
      /role="alert" class="notice-error"/,
    );
    expect(renderToString(<BuyerRunsView runs={[]} error="down" />)).toMatch(/role="alert" class="notice-error"/);
  });

  it("toast a failed refresh while the last good data stays on screen", () => {
    const toast = renderToString(<Toast message="Could not refresh buyer runs: down" />);
    expect(toast).toMatch(/role="alert" class="toast"/);
    const run = {
      strategy: "skeptique" as const,
      category: "conversion",
      task: {},
      pick: {
        id: 1,
        name: "unit-convert",
        category: "conversion",
        endpoint: "http://127.0.0.1:4001/call",
        pricePerCall: "1",
        seller: "0x0000000000000000000000000000000000000022",
        ensName: "",
        median: 100,
        confidence: 1,
        rank: 100,
        nRounds: 1,
        lastRoundAt: null,
        popularityCalls: 0,
      },
      explanation: "Picked unit-convert.",
      response: {},
      txId: null,
      paid: false,
      at: "2026-11-06T10:00:00.000Z",
    };
    const html = renderToString(<BuyerRunsView runs={[run]} error="down" />);
    expect(html).toContain("unit-convert");
    expect(html).toMatch(/class="toast"[^>]*>Could not refresh buyer runs: down/);
  });
});
