"use client";

import type { CaseResult, Evidence } from "@skeptique/shared";
import { useEffect, useState } from "react";
import { type ApiRoutes, apiClient } from "../lib/api";
import { EnsScore } from "./ens-score";

type Service = ApiRoutes["/services"][number];
export type Review = { evidenceHash: string; evidence: Evidence };
type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; service: Service; reviews: Review[] };

function Results({ title, results }: { title: string; results: CaseResult[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {results.length === 0 ? (
        <p>No results recorded.</p>
      ) : (
        <ul>
          {results.map((result) => (
            <li key={result.caseId}>
              <strong>
                {result.caseId}: {result.passed ? "Pass" : "Fail"}
              </strong>
              {result.error && <p>{result.error}</p>}
              {result.output !== undefined && (
                <pre className="buyer-result">{JSON.stringify(result.output, null, 2)}</pre>
              )}
              {"case" in result && (
                <details>
                  <summary>Generated probe</summary>
                  <pre className="buyer-result">{JSON.stringify(result.case, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ServiceDetailView({ state }: { state: State }) {
  if (state.status === "loading") return <p role="status">Loading service…</p>;
  if (state.status === "error") return <p role="alert">Could not load service: {state.message}</p>;
  return (
    <div>
      <h1>{state.service.name}</h1>
      <p>{state.service.category}</p>
      {state.service.ensName ? <EnsScore name={state.service.ensName} /> : <p>ENS score unavailable</p>}
      {state.reviews.length === 0 && <p>No finalized review evidence available.</p>}
      {state.reviews.map(({ evidenceHash, evidence }) => (
        <article key={evidenceHash} className="market-card">
          <h2>Critic {evidence.critic}</h2>
          <p>
            Round {evidence.roundId} · Review score {evidence.score}/100
          </p>
          <p>Public suite contributes 40%; private probes contribute 60%.</p>
          <Results title="Public suite" results={evidence.suite} />
          <Results title="Private probes" results={evidence.probes} />
          <p>
            Evidence: <code className="buyer-tx">{evidenceHash}</code>
          </p>
        </article>
      ))}
    </div>
  );
}

export function ServiceDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    Promise.resolve()
      .then(async () => {
        if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)
          throw new Error("Invalid service ID");
        const client = apiClient();
        const [services, reviews] = await Promise.all([client.get("/services"), client.get(`/services/${id}/reviews`)]);
        const service = services.find((candidate) => candidate.id === Number(id));
        if (!service) throw new Error("Unknown service");
        if (active) setState({ status: "ready", service, reviews });
      })
      .catch((cause) => {
        if (active) setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" });
      });
    return () => {
      active = false;
    };
  }, [id]);
  return <ServiceDetailView state={state} />;
}
