import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditLogView } from "../components/audit-log";

describe("hcs audit log page", () => {
  it("lists mirror-node messages with links", () => {
    const html = renderToStaticMarkup(
      <AuditLogView
        topicId="0.0.9"
        state={{
          status: "ready",
          entries: [
            {
              sequenceNumber: 2,
              consensusTimestamp: "2.0",
              mirrorUrl: "https://mirror.test/api/v1/topics/0.0.9/messages/2",
              message: {
                type: "agent_spend",
                payer: "0.0.5",
                merchant: "0.0.6",
                amount: "10",
                txId: "0.0.7@1.2",
                ts: 1,
              },
            },
            {
              sequenceNumber: 1,
              consensusTimestamp: "1.0",
              mirrorUrl: "https://mirror.test/api/v1/topics/0.0.9/messages/1",
              message: {
                type: "round_finalized",
                roundId: "3",
                serviceId: "1",
                median: 72,
                nReveals: 5,
                isVoid: false,
                ts: 1,
              },
            },
          ],
        }}
      />,
    );
    expect(html).toContain("finalised at 72");
    expect(html).toContain("https://hashscan.io/testnet/transaction/0.0.7@1.2");
    expect(html).toContain("https://mirror.test/api/v1/topics/0.0.9/messages/1");
    expect(html.indexOf("agent_spend")).toBeLessThan(html.indexOf("round_finalized"));
  });
  it("says so when the log is empty or unavailable", () => {
    expect(renderToStaticMarkup(<AuditLogView topicId="0.0.9" state={{ status: "ready", entries: [] }} />)).toContain(
      "No audit messages",
    );
    expect(
      renderToStaticMarkup(
        <AuditLogView topicId="0.0.9" state={{ status: "error", message: "The audit log is unavailable." }} />,
      ),
    ).toContain("unavailable");
  });
});
