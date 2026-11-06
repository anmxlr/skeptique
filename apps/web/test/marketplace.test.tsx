import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatHbar, MarketplaceView } from "../components/marketplace";
import type { ApiRoutes } from "../lib/api";

const service: ApiRoutes["/services"][number] = {
  id: 1,
  name: "length-convert",
  category: "conversion",
  endpoint: "http://127.0.0.1:4001/call",
  pricePerCall: "1",
  seller: "0x0000000000000000000000000000000000000022",
  ensName: "",
  median: null,
  confidence: 0,
  rank: 0,
  nRounds: 0,
  lastRoundAt: null,
  popularityCalls: 0,
  bounty: "2000000000",
};

describe("marketplace view", () => {
  it("says it is loading", () => {
    expect(renderToString(<MarketplaceView state={{ status: "loading" }} />)).toContain("Loading services");
  });

  it("shows the error when the API fails", () => {
    const html = renderToString(
      <MarketplaceView state={{ status: "error", message: "API /services responded 500" }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("API /services responded 500");
  });

  it("says when no service is listed", () => {
    expect(renderToString(<MarketplaceView state={{ status: "ready", services: [] }} />)).toContain(
      "No services listed yet",
    );
  });

  it("shows a new listing in probation with its price and bounty", () => {
    const html = renderToString(<MarketplaceView state={{ status: "ready", services: [service] }} />);
    expect(html).toContain("length-convert");
    expect(html).toContain("conversion");
    expect(html).toContain("Probation");
    expect(html).toContain("0.00000001 HBAR");
    expect(html).toContain("20 HBAR");
  });

  it("formats tinybars as HBAR", () => {
    expect(formatHbar("2000000000")).toBe("20 HBAR");
    expect(formatHbar("2050000000")).toBe("20.5 HBAR");
    expect(formatHbar("1")).toBe("0.00000001 HBAR");
  });

  it("shows confidence and adjusted rank for a reviewed service", () => {
    const html = renderToString(
      <MarketplaceView
        state={{ status: "ready", services: [{ ...service, median: 80, confidence: 0.6, rank: 74, nRounds: 1 }] }}
      />,
    );
    expect(html).toContain('aria-label="Review confidence for length-convert"');
    expect(html).toContain('value="0.6"');
    expect(html).toContain("60%");
    expect(html).toContain("74.0");
    expect(html).toContain('href="/services/1"');
  });

  it("marks probation as unranked rather than a zero-quality review", () => {
    const html = renderToString(<MarketplaceView state={{ status: "ready", services: [service] }} />);
    expect(html).toContain("Probation");
    expect(html).toContain("Not ranked yet");
    expect(html).not.toContain("Review confidence for");
  });
});
