"use client";

import { useEffect, useState } from "react";
import { fetchService, type ServiceDetail } from "../lib/api";
import { EnsName } from "./ens-name";
import { formatHbar } from "./marketplace";

export type ServiceDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ready"; service: ServiceDetail };

export function ServiceDetailView({ state }: { state: ServiceDetailState }) {
  if (state.status === "loading") return <p role="status">Loading service…</p>;
  if (state.status === "error") return <p role="alert">Could not load service: {state.message}</p>;
  if (state.status === "not-found") return <p>No such service.</p>;
  const { service } = state;
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
    </>
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
        return fetchService(id, baseUrl);
      })
      .then(
        (service) => active && setState(service ? { status: "ready", service } : { status: "not-found" }),
        (cause) =>
          active && setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, [id]);

  return <ServiceDetailView state={state} />;
}
