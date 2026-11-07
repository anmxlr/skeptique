import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CriticsView } from "../components/critics";

const critic = {
  address: "0x0000000000000000000000000000000000000033",
  nullifier: `0x${"ab".repeat(32)}`,
  stake: "500000000",
  verdict: "honest" as const,
  lastRoundId: 3,
  honestRounds: 2,
  slashes: 1,
  pendingRewards: "123456789",
};

describe("critic dashboard", () => {
  it("shows stake, honest rounds, slashes and pending rewards with a claim button", () => {
    const html = renderToString(<CriticsView state={{ status: "ready", critics: [critic] }} />);
    expect(html).toContain("Honest rounds");
    expect(html).toContain("Slashes");
    expect(html).toContain("Pending rewards");
    expect(html).toContain("1.23456789 HBAR");
    expect(html).toMatch(/<button[^>]*>Claim<\/button>/);
  });

  it("has nothing to claim once rewards are zero", () => {
    const html = renderToString(
      <CriticsView state={{ status: "ready", critics: [{ ...critic, pendingRewards: "0" }] }} />,
    );
    expect(html).toContain("Pending rewards");
    expect(html).toContain("0 HBAR");
    expect(html).not.toMatch(/<button[^>]*>Claim<\/button>/);
  });
});
