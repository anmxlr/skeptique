"use client";

import { type CaseResult, type Evidence, hashscanTxUrl, type RoundView } from "@skeptique/shared";
import { useEffect, useState } from "react";
import { ApiError, apiClient, fetchEvidence, fetchService, fetchServiceRounds, type ServiceDetail } from "../lib/api";
import { EnsName } from "./ens-name";
import { EnsScore } from "./ens-score";
import { LatestRound } from "./latest-round";
import { formatHbar } from "./marketplace";
import { Skeleton } from "./states";

export type Review = { evidenceHash: string; evidence: Evidence };

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

export type ServiceDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ready"; service: ServiceDetail; evidence?: Evidence; reviews?: Review[]; rounds?: RoundView[] };

export function ServiceDetailView({ state }: { state: ServiceDetailState }) {
  if (state.status === "loading") return <Skeleton label="Loading service" count={1} />;
  if (state.status === "error")
    return (
      <p role="alert" className="notice-error">
        Could not load service: {state.message}
      </p>
    );
  if (state.status === "not-found") return <p>No such service.</p>;
  const { service, evidence, rounds, reviews = [] } = state;
  return (
    <>
      <h1>{service.name}</h1>
      <p className="market-muted">{service.category}</p>
      <dl className="market-stats">
        <dt>Status</dt>
        <dd>
          {service.ensName ? "Published via ENS" : service.median === null ? "Probation" : "ENS name unavailable"}
        </dd>
        <dt>Bounty</dt>
        <dd>{service.bounty === undefined ? "Unknown" : formatHbar(service.bounty)}</dd>
        <dt>Price per call</dt>
        <dd>{formatHbar(service.pricePerCall)}</dd>
        <dt>ENS name</dt>
        <dd>{service.ensName === "" ? "Pending: created after listing" : <EnsName name={service.ensName} />}</dd>
        <dt>Endpoint</dt>
        <dd>{service.endpoint}</dd>
      </dl>
      {rounds && rounds.length > 0 && <RoundTimeline rounds={rounds} />}
      {service.ensName ? <EnsScore name={service.ensName} /> : <p>ENS score unavailable</p>}
      {evidence && (
        <>
          <p>Linked evidence: its association with this service is not verified by this link.</p>
          <EvidenceSection evidence={evidence} />
        </>
      )}
      {reviews.length === 0 && <p>No finalized review evidence available.</p>}
      {reviews.map(({ evidenceHash, evidence: review }) => (
        <article key={evidenceHash} className="market-card">
          <h2>Finalized review · Round {review.roundId}</h2>
          <EvidenceSection evidence={review} />
          <p>
            Evidence: <code className="buyer-tx">{evidenceHash}</code>
          </p>
        </article>
      ))}
    </>
  );
}

const PHASE_LABEL: Record<RoundView["phase"], string> = {
  commit: "Commit phase",
  reveal: "Reveal phase",
  finalizable: "Ready to finalise",
  finalized: "Finalised",
  void: "Void",
};

function RoundTimeline({ rounds }: { rounds: RoundView[] }) {
  return (
    <section aria-label="Round timeline">
      <h2>Round timeline</h2>
      <ol>
        {rounds.map((round) => {
          const revealed = new Set(round.reveals.map((reveal) => reveal.critic.toLowerCase()));
          return (
            <li key={round.id}>
              <strong>{`Round ${round.id}: ${PHASE_LABEL[round.phase]}`}</strong>
              {round.median !== null && ` (median ${round.median})`}
              <ul>
                {round.committed.map((critic) => (
                  <li
                    key={critic}
                  >{`${critic} ${revealed.has(critic.toLowerCase()) ? "committed and revealed" : "committed"}`}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EvidenceSection({ evidence }: { evidence: Evidence }) {
  const passed = evidence.suite.filter((result) => result.passed).length;
  return (
    <section aria-label="Evidence">
      <h2>Evidence</h2>
      <dl className="market-stats">
        <dt>Critic</dt>
        <dd>{evidence.critic}</dd>
        <dt>Result</dt>
        <dd>{`Review score ${evidence.score}: ${passed} of ${evidence.suite.length} public cases passed`}</dd>
        <dt>Cases</dt>
        <dd>{`${evidence.suite.length} public cases, ${evidence.probes.length} private probes`}</dd>
        <dt>Latency</dt>
        <dd>{`p50 ${Math.round(evidence.latencyMs.p50)} ms, p95 ${Math.round(evidence.latencyMs.p95)} ms`}</dd>
        <dt>Payments</dt>
        <dd>
          {evidence.x402Txs.length === 0 ? (
            "No on-chain payments"
          ) : (
            <ul>
              {evidence.x402Txs.map((txId) => {
                const href = hashscanTxUrl(txId);
                return <li key={txId}>{href ? <a href={href}>{txId}</a> : <code>{txId}</code>}</li>;
              })}
            </ul>
          )}
        </dd>
      </dl>
      <p>Public suite contributes 40%; private probes contribute 60%.</p>
      <Results title="Public suite" results={evidence.suite} />
      <Results title="Private probes" results={evidence.probes} />
    </section>
  );
}

/** A service's page, read from the API. */
export function ServiceDetailPage({ id }: { id: number }) {
  const [state, setState] = useState<ServiceDetailState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    Promise.resolve()
      .then(() => {
        if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid service ID");
        // A critic's published evidence is shown when the link carries its hash: /services/1?evidence=0x...
        const hash = new URLSearchParams(window.location.search).get("evidence");
        return Promise.all([
          fetchService(id, baseUrl),
          hash ? fetchEvidence(hash, baseUrl) : null,
          fetchServiceRounds(id, baseUrl).catch(() => []),
          apiClient()
            .get(`/services/${id}/reviews`)
            .catch((error: unknown) => {
              if (error instanceof ApiError && error.status === 404) return [];
              throw error;
            }),
        ]);
      })
      .then(
        ([service, evidence, rounds, reviews]) =>
          active &&
          setState(
            service
              ? { status: "ready", service, rounds, reviews, ...(evidence ? { evidence } : {}) }
              : { status: "not-found" },
          ),
        (cause) =>
          active && setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <>
      <ServiceDetailView state={state} />
      {state.status === "ready" && <LatestRound serviceId={state.service.id} />}
    </>
  );
}
