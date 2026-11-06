import type { RoundView } from "@skeptique/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LatestRoundView, latestRoundFor } from "../components/latest-round";

const round = (phase: RoundView["phase"], median: number | null = null): RoundView => ({
  id: 4,
  serviceId: 2,
  phase,
  commitEnd: "2026-11-06T10:00:00.000Z",
  revealEnd: "2026-11-06T10:05:00.000Z",
  median,
  committed: [],
  reveals: [],
});

describe("latest round", () => {
  it("follows the newest round opened for this service and ignores other services", () => {
    let latest: number | null = null;
    latest = latestRoundFor(2, latest, { type: "RoundOpened", data: { roundId: 3, serviceId: 2 } });
    latest = latestRoundFor(2, latest, { type: "RoundOpened", data: { roundId: 5, serviceId: 9 } });
    latest = latestRoundFor(2, latest, { type: "CriticCommitted", data: { roundId: 3 } });
    expect(latest).toBe(3);
    expect(latestRoundFor(2, latest, { type: "RoundOpened", data: { roundId: 4, serviceId: 2 } })).toBe(4);
  });

  it("shows the phase with a link to the round, and the consensus once finalized", () => {
    const open = renderToString(<LatestRoundView state={{ status: "ready", round: round("commit") }} />);
    expect(open).toContain("Round #4");
    expect(open).toContain("Commit");
    expect(open).toContain('href="/rounds/4"');
    expect(renderToString(<LatestRoundView state={{ status: "ready", round: round("finalized", 88) }} />)).toContain(
      "Finalized · consensus score 88",
    );
  });

  it("says when no round has opened yet, and is announced politely to screen readers", () => {
    const html = renderToString(<LatestRoundView state={{ status: "waiting" }} />);
    expect(html).toContain("No review round yet");
    expect(html).toContain('aria-live="polite"');
  });
});
