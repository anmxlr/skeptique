"use client";

import { hashscanTxUrl } from "@skeptique/shared";
import { type AuditEntry, type AuditMessage, readAuditLog } from "@skeptique/shared/hcs";
import { useEffect, useState } from "react";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; entries: AuditEntry[] };

function describeMessage(message: AuditMessage): string {
  switch (message.type) {
    case "round_finalized":
      return message.isVoid
        ? `Round #${message.roundId} for service #${message.serviceId} voided`
        : `Round #${message.roundId} for service #${message.serviceId} finalised at ${message.median} (${message.nReveals} reveals)`;
    case "critic_slashed":
      return `Critic ${message.critic} slashed ${message.amount} tinybars in round #${message.roundId}: ${message.reason}`;
    case "agent_spend":
      return `${message.payer} paid ${message.merchant} ${message.amount} tinybars`;
  }
}

export function AuditLogView({ state, topicId }: { state: State; topicId: string }) {
  if (state.status === "loading") return <p role="status">Loading audit log…</p>;
  if (state.status === "error") return <p role="status">{state.message}</p>;
  if (state.entries.length === 0) return <p role="status">No audit messages yet.</p>;
  return (
    <section aria-label="HCS audit log">
      <h2>Audit log</h2>
      <p>
        Read from the Hedera mirror node for topic{" "}
        <a href={`https://hashscan.io/testnet/topic/${topicId}`} target="_blank" rel="noreferrer">
          {topicId}
        </a>
        , newest first.
      </p>
      <ol>
        {state.entries.map((entry) => {
          const txUrl = entry.message.type === "agent_spend" ? hashscanTxUrl(entry.message.txId) : null;
          return (
            <li key={entry.sequenceNumber}>
              <span>{entry.message.type}</span>: {describeMessage(entry.message)}{" "}
              <a href={entry.mirrorUrl} target="_blank" rel="noreferrer">
                message #{entry.sequenceNumber}
              </a>
              {txUrl ? (
                <>
                  {" "}
                  <a href={txUrl} target="_blank" rel="noreferrer">
                    HashScan
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function AuditLog() {
  const mirrorUrl = process.env.NEXT_PUBLIC_HEDERA_MIRROR_NODE_URL;
  const topicId = process.env.NEXT_PUBLIC_HCS_TOPIC_ID;
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (!mirrorUrl || !topicId) return;
    let active = true;
    readAuditLog({ mirrorUrl, topicId }).then(
      (entries) => active && setState({ status: "ready", entries }),
      () => active && setState({ status: "error", message: "The audit log is unavailable." }),
    );
    return () => {
      active = false;
    };
  }, [mirrorUrl, topicId]);
  if (!mirrorUrl || !topicId) return <p role="status">The audit topic is not configured.</p>;
  return <AuditLogView state={state} topicId={topicId} />;
}
