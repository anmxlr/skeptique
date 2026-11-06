"use client";

import { useEffect, useState } from "react";
import { type ApiRoutes, apiClient } from "../lib/api";
import { EnsName } from "./ens-name";

type Service = ApiRoutes["/services"][number];

export type ServiceDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; service: Service };

export function ServiceDetailView({ state }: { state: ServiceDetailState }) {
  if (state.status === "loading") return <p role="status">Loading service…</p>;
  if (state.status === "error") return <p role="alert">Could not load service: {state.message}</p>;
  const { service } = state;
  return (
    <>
      <h1>{service.name}</h1>
      <p className="market-muted">{service.category}</p>
      {service.ensName ? (
        <p>
          <EnsName name={service.ensName} />
        </p>
      ) : null}
      <p>{service.median === null ? "Probation" : `Score ${service.median}`}</p>
    </>
  );
}

/** One service from the API. */
export function ServiceDetail({ id }: { id: string }) {
  const [state, setState] = useState<ServiceDetailState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => apiClient().get("/services"))
      .then(
        (services) => {
          const service = services.find((candidate) => String(candidate.id) === id);
          if (active)
            setState(service ? { status: "ready", service } : { status: "error", message: "Unknown service" });
        },
        (cause) =>
          active && setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, [id]);

  return <ServiceDetailView state={state} />;
}
