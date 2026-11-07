import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingView } from "../components/critic-onboarding";
import { draftFrom, SpendControlsView } from "../components/spend-controls";

describe("on a read-only API deployment", () => {
  it("critic registration explains why it is unavailable instead of offering a button that fails", () => {
    const html = renderToString(<OnboardingView state={{ status: "idle" }} readOnly />);
    expect(html).toContain("read-only");
    expect(html).not.toContain("Verify with World ID</button>");
  });

  it("spend limits cannot be saved or approvals answered", () => {
    const pending = { id: "a", merchant: "m", amount: "20", status: "pending" as const, createdAt: "" };
    const html = renderToString(<SpendControlsView draft={draftFrom(null)} approvals={[pending]} readOnly />);
    expect(html).toContain("read-only");
    expect(html.match(/<button[^>]*disabled/g)?.length).toBe(3);
  });
});
