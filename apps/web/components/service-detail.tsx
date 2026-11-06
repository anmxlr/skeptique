"use client";

import { type Evidence, hashscanTxUrl } from "@skeptique/shared";
import { useEffect, useState } from "react";
import { fetchEvidence, fetchService, type ServiceDetail } from "../lib/api";
import { EnsName } from "./ens-name";
import { LatestRound } from "./latest-round";
import { formatHbar } from "./marketplace";
import { Skeleton } from "./states";

export type ServiceDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ready"; service: ServiceDetail; evidence?: Evidence };

export function ServiceDetailView({ state }: { state: ServiceDetailState }) {
  if (state.status === "loading") return <Skeleton label="Loading service" count={1} />;
  if (state.status === "error")
    return (
      <p role="alert" className="notice-error">
        Could not load service: {state.message}
      </p>
    );
  if (state.status === "not-found") return <p>No such service.</p>;
  const { service, evidence } = state;
  return (
    <>
      <h1>{service.name}</h1>
      <p className="market-muted">{service.category}</p>
      <dl className="market-stats">
        <dt>Status</dt>
        <dd>{service.median === null ? "Probation" : `Score ${service.median}`}</dd>
        <dt>Bounty</dt>
        <dd>{service.bounty === undefined ? "Unknown" : formatHbar(service.bounty)}</dd>
        <dt>Price per call</dt>
        <dd>{formatHbar(service.pricePerCall)}</dd>
        <dt>ENS name</dt>
        <dd>{service.ensName === "" ? "Pending: created after listing" : <EnsName name={service.ensName} />}</dd>
        <dt>Endpoint</dt>
        <dd>{service.endpoint}</dd>
      </dl>
      {evidence && <EvidenceSection evidence={evidence} />}
    </>
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
        <dd>{`Score ${evidence.score}: ${passed} of ${evidence.suite.length} cases passed`}</dd>
        <dt>Cases</dt>
        <dd>{`${evidence.suite.length} cases`}</dd>
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
    </section>
  );
}

/** A service's page, read from the API. */
export function ServiceDetailPage({ id }: { id: number }) {
  const [state, setState] = useState<ServiceDetailState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    Promise.resolve()
      .then(() => {
        if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
        // A critic's published evidence is shown when the link carries its hash: /services/1?evidence=0x...
        const hash = new URLSearchParams(window.location.search).get("evidence");
        return Promise.all([fetchService(id, baseUrl), hash ? fetchEvidence(hash, baseUrl) : null]);
      })
      .then(
        ([service, evidence]) =>
          active &&
          setState(service ? { status: "ready", service, ...(evidence ? { evidence } : {}) } : { status: "not-found" }),
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
