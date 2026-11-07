"use client";

import { type Approval, type SpendLimits, SpendLimitsSchema } from "@skeptique/shared";
import { useEffect, useState } from "react";
import { apiUrl as joinApiUrl } from "../lib/api";
import { READ_ONLY_NOTICE, useApiReadOnly } from "../lib/read-only";

const apiUrl = () => {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return url;
};

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(joinApiUrl(path, apiUrl()), {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path} responded ${res.status}`);
  return res.json();
}

export type LimitsDraft = { budget: string; perMerchantCap: string; allowlist: string; approvalThreshold: string };

export const draftFrom = (limits: SpendLimits | null): LimitsDraft => ({
  budget: limits?.budget ?? "",
  perMerchantCap: limits?.perMerchantCap ?? "",
  allowlist: limits?.allowlist.join("\n") ?? "",
  approvalThreshold: limits?.approvalThreshold ?? "",
});

/** The form text as limits; null when a number is not whole tinybars. */
export function limitsFrom(draft: LimitsDraft): SpendLimits | null {
  const parsed = SpendLimitsSchema.safeParse({
    budget: draft.budget.trim(),
    perMerchantCap: draft.perMerchantCap.trim(),
    approvalThreshold: draft.approvalThreshold.trim(),
    allowlist: draft.allowlist
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  });
  return parsed.success ? parsed.data : null;
}

export function SpendControlsView({
  draft,
  approvals,
  message,
  onDraft,
  onSave,
  onAnswer,
  readOnly = false,
}: {
  draft: LimitsDraft;
  approvals: readonly Approval[];
  message?: string;
  onDraft?: (draft: LimitsDraft) => void;
  onSave?: () => void;
  onAnswer?: (id: string, answer: "approve" | "deny") => void;
  readOnly?: boolean;
}) {
  const pending = approvals.filter((approval) => approval.status === "pending");
  const field = (key: keyof LimitsDraft, label: string, hint: string) => (
    <div className="spend-field">
      <label htmlFor={`spend-${key}`}>{label}</label>
      <span className="buyer-muted"> {hint}</span>
      {key === "allowlist" ? (
        <textarea
          id={`spend-${key}`}
          value={draft[key]}
          rows={3}
          onChange={(e) => onDraft?.({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <input
          id={`spend-${key}`}
          value={draft[key]}
          inputMode="numeric"
          onChange={(e) => onDraft?.({ ...draft, [key]: e.target.value })}
        />
      )}
    </div>
  );
  return (
    <section className="buyer-card" aria-labelledby="spend-controls">
      <h2 id="spend-controls">Spend limits</h2>
      <p className="buyer-muted">
        The buyer pays on its own within these limits (tinybars). Only a payment above the approval threshold waits for
        you.
      </p>
      {field("budget", "Total budget", "")}
      {field("perMerchantCap", "Per-merchant cap", "")}
      {field("approvalThreshold", "Approval threshold", "payments above this need your OK")}
      {field("allowlist", "Merchant allowlist", "one per line; others are denied")}
      {readOnly && <p className="buyer-muted">{READ_ONLY_NOTICE}</p>}
      <button type="button" onClick={onSave} disabled={readOnly}>
        Save limits
      </button>
      {message && <p role="status">{message}</p>}
      <h3>Waiting for approval</h3>
      {pending.length === 0 ? (
        <p className="buyer-muted">Nothing is waiting.</p>
      ) : (
        <ul>
          {pending.map((approval) => (
            <li key={approval.id}>
              Pay {approval.amount} tinybars to <code>{approval.merchant}</code>{" "}
              <button type="button" onClick={() => onAnswer?.(approval.id, "approve")} disabled={readOnly}>
                Approve
              </button>{" "}
              <button type="button" onClick={() => onAnswer?.(approval.id, "deny")} disabled={readOnly}>
                Deny
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Owner's limits form and the approval queue, refreshed every few seconds. */
export function SpendControls() {
  const [draft, setDraft] = useState<LimitsDraft>(draftFrom(null));
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const readOnly = useApiReadOnly();

  useEffect(() => {
    let active = true;
    send("/buyer/limits", "GET")
      .then((limits: SpendLimits | null) => active && setDraft(draftFrom(limits)))
      .catch((cause) => active && setMessage(`Could not load limits: ${cause.message}`));
    const load = () =>
      send("/buyer/approvals", "GET")
        .then((list: Approval[]) => active && setApprovals(list))
        .catch(() => {});
    load();
    const timer = setInterval(load, 2_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const save = async () => {
    const limits = limitsFrom(draft);
    if (!limits) return setMessage("Amounts must be whole numbers of tinybars.");
    try {
      await send("/buyer/limits", "PUT", limits);
      setMessage("Limits saved.");
    } catch (cause) {
      setMessage(`Could not save limits: ${cause instanceof Error ? cause.message : "unknown error"}`);
    }
  };
  const answer = async (id: string, action: "approve" | "deny") => {
    try {
      const updated: Approval = await send(`/buyer/approvals/${id}/${action}`, "POST");
      setApprovals((list) => list.map((item) => (item.id === id ? updated : item)));
    } catch (cause) {
      setMessage(`Could not answer: ${cause instanceof Error ? cause.message : "unknown error"}`);
    }
  };

  return (
    <SpendControlsView
      draft={draft}
      approvals={approvals}
      message={message}
      onDraft={setDraft}
      onSave={save}
      onAnswer={answer}
      readOnly={readOnly}
    />
  );
}
