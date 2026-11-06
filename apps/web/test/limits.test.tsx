import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LimitsPage from "../app/limits/page";
import { DemoBanner } from "../components/demo-banner";

describe("honest limits", () => {
  const html = renderToString(<LimitsPage />);

  it("lists every threat spec/02 §6 says is not defended, plus the staged demo consensus", () => {
    for (const text of [
      "team runs every critic",
      "majority of stake colluding",
      "bribing real humans",
      "consensus is not truth",
      "Nondeterministic services",
      "payment circularity",
    ])
      expect(html).toContain(text);
  });

  it("also says what the mechanism does defend", () => {
    for (const text of [
      "Copying",
      "Sybil critics",
      "Lazy critics",
      "Seller steering",
      "Suite overfitting",
      "Self-review",
    ])
      expect(html).toContain(text);
  });
});

describe("demo banner", () => {
  it("says plainly that the team runs the critics and links to the limits page", () => {
    const html = renderToString(<DemoBanner />);
    expect(html).toContain("Demo mode");
    expect(html).toContain("team runs the critic agents");
    expect(html).toContain("staged");
    expect(html).toContain('href="/limits"');
  });
});
