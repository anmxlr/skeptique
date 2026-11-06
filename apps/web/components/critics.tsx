"use client";

import { useEffect, useState } from "react";
import { type ApiRoutes, apiClient } from "../lib/api";
import { formatHbar } from "./marketplace";
import { Skeleton } from "./states";

type Critic = ApiRoutes["/critics"][number];

export type CriticsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; critics: readonly Critic[] };

export function CriticsView({ state }: { state: CriticsState }) {
  if (state.status === "loading") return <Skeleton label="Loading critics" count={2} />;
  if (state.status === "error")
    return (
      <p role="alert" className="notice-error">
        Could not load critics: {state.message}
      </p>
    );
  if (state.critics.length === 0) return <p>No critics registered yet.</p>;
  return (
    <ul className="market-grid">
      {state.critics.map((critic) => (
        <li key={critic.address} className="market-card">
          <h2 title={critic.address}>{critic.address}</h2>
          <dl className="market-stats">
            <dt>Stake</dt>
            <dd>{formatHbar(critic.stake)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** Registered critics from the API. */
export function Critics() {
  const [state, setState] = useState<CriticsState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => apiClient().get("/critics"))
      .then(
        (critics) => active && setState({ status: "ready", critics }),
        (cause) =>
          active && setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, []);

  return <CriticsView state={state} />;
}
