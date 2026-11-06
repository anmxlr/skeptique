"use client";

import type { RoundView } from "@skeptique/shared";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

export function RoundDetailsView({ round }: { round: RoundView }) {
  return (
    <section>
      <h2>Round #{round.id}</h2>
      <p>
        Service #{round.serviceId} · {round.phase}
      </p>
      <p>Consensus score: {round.median === null ? "Not finalized" : round.median}</p>
      <ul>
        {round.reveals.map((reveal) => (
          <li key={reveal.critic}>
            <span>{reveal.critic}</span>: {reveal.score} ·{" "}
            {reveal.honest === null ? "Pending" : reveal.honest ? "Honest" : "Outlier (slash eligible)"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoundDetails({ roundId }: { roundId: number }) {
  const [state, setState] = useState<{ round?: RoundView; error?: string }>({});
  useEffect(() => {
    let active = true;
    setState({});
    Promise.resolve()
      .then(() => apiClient().getRound(roundId))
      .then(
        (round) => active && setState({ round }),
        (error) => active && setState({ error: error instanceof Error ? error.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, [roundId]);
  if (state.error) return <p role="alert">Could not load round: {state.error}</p>;
  if (!state.round) return <p role="status">Loading round…</p>;
  return <RoundDetailsView round={state.round} />;
}
