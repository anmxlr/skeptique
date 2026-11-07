import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { draftFrom, limitsFrom, SpendControlsView } from "../components/spend-controls";

const approval = (id: string, status: "pending" | "approved") => ({
  id,
  merchant: "http://127.0.0.1:4001",
  amount: "20",
  status,
  createdAt: "2026-11-07T00:00:00.000Z",
});

describe("spend controls view", () => {
  it("lists only pending approvals with approve and deny", () => {
    const html = renderToString(
      <SpendControlsView draft={draftFrom(null)} approvals={[approval("a", "pending"), approval("b", "approved")]} />,
    );
    expect(html).toContain("Spend limits");
    expect(html).toContain("tinybars to");
    expect(html).toContain("http://127.0.0.1:4001");
    expect(html.match(/Approve/g)).toHaveLength(1);
    expect(html).toContain("Deny");
  });

  it("says when nothing waits", () => {
    expect(renderToString(<SpendControlsView draft={draftFrom(null)} approvals={[]} />)).toContain(
      "Nothing is waiting.",
    );
  });

  it("turns the form into limits and rejects non-integer amounts", () => {
    const draft = { budget: "100", perMerchantCap: "50", approvalThreshold: "10", allowlist: " a \n\nb" };
    expect(limitsFrom(draft)).toEqual({
      budget: "100",
      perMerchantCap: "50",
      approvalThreshold: "10",
      allowlist: ["a", "b"],
    });
    expect(limitsFrom({ ...draft, budget: "1.5" })).toBeNull();
  });
});
