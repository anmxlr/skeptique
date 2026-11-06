"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type ApiRoutes, apiClient } from "../lib/api";
import { EnsName } from "./ens-name";
import { EnsScore } from "./ens-score";

type MarketplaceService = ApiRoutes["/services"][number];

export type MarketplaceState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; services: readonly MarketplaceService[] };

const TINYBARS_PER_HBAR = 100_000_000n;

/** Formats a tinybar amount (contract and x402 unit) as HBAR. */
export function formatHbar(tinybars: string): string {
  const value = BigInt(tinybars);
  const fraction = (value % TINYBARS_PER_HBAR).toString().padStart(8, "0").replace(/0+$/, "");
  return `${value / TINYBARS_PER_HBAR}${fraction ? `.${fraction}` : ""} HBAR`;
}

function ServiceCard({ service }: { service: MarketplaceService }) {
  const probation = service.median === null || service.nRounds === 0 || service.confidence === 0;
  return (
    <li className="market-card">
      <h2>
        <Link href={`/services/${service.id}`}>{service.name}</Link>
      </h2>
      <p className="market-muted">{service.category}</p>
      {service.ensName ? (
        <p className="market-muted">
          <EnsName name={service.ensName} />
        </p>
      ) : null}
      <dl className="market-stats">
        <dt>Status</dt>
        <dd>
          {service.ensName ? (
            "Published via ENS"
          ) : probation ? (
            <span className="market-probation">Probation</span>
          ) : (
            "ENS name unavailable"
          )}
        </dd>
        <dt>Indexed adjusted rank</dt>
        <dd>{probation ? "Not ranked yet" : service.rank.toFixed(1)}</dd>
        {!probation && (
          <>
            <dt>Indexed confidence (time-adjusted)</dt>
            <dd>
              <meter min={0} max={1} value={service.confidence} aria-label={`Review confidence for ${service.name}`} />
              {` ${Math.round(service.confidence * 100)}%`}
            </dd>
          </>
        )}
        <dt>Price per call</dt>
        <dd>{formatHbar(service.pricePerCall)}</dd>
        <dt>Bounty</dt>
        <dd>{service.bounty === undefined ? "Unknown" : formatHbar(service.bounty)}</dd>
      </dl>
      {service.ensName ? <EnsScore name={service.ensName} /> : <p>ENS score unavailable</p>}
    </li>
  );
}

export function MarketplaceView({ state }: { state: MarketplaceState }) {
  if (state.status === "loading") return <p role="status">Loading services…</p>;
  if (state.status === "error") return <p role="alert">Could not load services: {state.message}</p>;
  if (state.services.length === 0) return <p>No services listed yet.</p>;
  return (
    <ul className="market-grid">
      {state.services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </ul>
  );
}

/** Listed services from the API. */
export function Marketplace() {
  const [state, setState] = useState<MarketplaceState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    // apiClient() throws when the API URL is not configured; surface that as the error state.
    Promise.resolve()
      .then(() => apiClient().get("/services"))
      .then(
        (services) => active && setState({ status: "ready", services }),
        (cause) =>
          active && setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, []);

  return <MarketplaceView state={state} />;
}
