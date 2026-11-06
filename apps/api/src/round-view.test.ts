import { describe, expect, it } from "vitest";
import { getPublishedServiceScore, getServiceRoundTimeline, toRoundView } from "./round-view";

const address = "0x0000000000000000000000000000000000000001";

describe("round view for marketplace and service timeline", () => {
  it("shows commit, reveal, finalizable and finalized phases", () => {
    const round = {
      id: 1,
      serviceId: 7,
      commitEnd: 100,
      revealEnd: 200,
      finalized: false,
      median: null,
      committed: [address],
      reveals: [],
    };
    expect(toRoundView(round, 99).phase).toBe("commit");
    expect(toRoundView(round, 100).phase).toBe("reveal");
    expect(toRoundView(round, 200).phase).toBe("finalizable");
    expect(toRoundView({ ...round, finalized: true, median: 82 }, 250)).toMatchObject({
      phase: "finalized",
      median: 82,
    });
  });

  it("shows only the latest finalized score and orders service history", () => {
    const old = toRoundView({
      id: 1,
      serviceId: 7,
      commitEnd: 100,
      revealEnd: 200,
      finalized: true,
      median: 70,
      committed: [],
      reveals: [{ critic: address, score: 70 }],
    });
    const pending = toRoundView({
      id: 2,
      serviceId: 7,
      commitEnd: 300,
      revealEnd: 400,
      finalized: false,
      median: null,
      committed: [address],
      reveals: [],
    });
    const latest = toRoundView({
      id: 3,
      serviceId: 7,
      commitEnd: 500,
      revealEnd: 600,
      finalized: true,
      median: 82,
      committed: [],
      reveals: [{ critic: address, score: 82 }],
    });
    expect(getPublishedServiceScore([old, pending, latest], 7)).toBe(82);
    expect(getServiceRoundTimeline([latest, pending, old], 7).map((round) => round.id)).toEqual([1, 2, 3]);
    expect(getPublishedServiceScore([pending], 7)).toBeNull();
  });
});
