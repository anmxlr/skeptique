import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingView } from "../components/critic-onboarding";
import { draftFrom, SpendControlsView } from "../components/spend-controls";

describe("on a read-only API deployment", () => {
  it("critic registration is not offered, since it would fail", () => {
    expect(renderToString(<OnboardingView state={{ status: "idle" }} readOnly />)).toBe("");
  });

  it("spend limits cannot be saved or approvals answered, with no notice text", () => {
    const pending = { id: "a", merchant: "m", amount: "20", status: "pending" as const, createdAt: "" };
    const html = renderToString(<SpendControlsView draft={draftFrom(null)} approvals={[pending]} readOnly />);
    expect(html).not.toContain("read-only");
    expect(html.match(/<button[^>]*disabled/g)?.length).toBe(3);
  });
});
