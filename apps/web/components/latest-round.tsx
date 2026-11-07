"use client";

import type { RoundView } from "@skeptique/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient, apiUrl, fetchServiceRounds } from "../lib/api";

export type RoundEvent = { type: string; data: { roundId: number; serviceId?: number } };

export type LatestRoundState =
  | { status: "waiting" }
  | { status: "ready"; round: RoundView }
  | { status: "error"; message: string };

const ROUND_EVENTS = ["RoundOpened", "CriticCommitted", "CriticRevealed", "RoundFinalized"] as const;

const PHASES: Record<RoundView["phase"], string> = {
  commit: "Commit",
  reveal: "Reveal",
  finalizable: "Ready to finalize",
  finalized: "Finalized",
  void: "Void",
};

/** The newest round opened for `serviceId`, given the previous answer and one more event from `GET /events`. */
export function latestRoundFor(serviceId: number, current: number | null, event: RoundEvent): number | null {
  if (event.type === "RoundOpened" && event.data.serviceId === serviceId) return event.data.roundId;
  return current;
}

export function LatestRoundView({ state }: { state: LatestRoundState }) {
  return (
    <section className="latest-round" aria-labelledby="latest-round-title" aria-live="polite">
      <h2 id="latest-round-title">Latest round</h2>
      {state.status === "waiting" && <p>No review round yet.</p>}
      {state.status === "error" && (
        <p role="alert" className="notice-error">
          Could not load the round: {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <p>
          <Link href={`/rounds/${state.round.id}`}>{`Round #${state.round.id}`}</Link>
          {` · ${PHASES[state.round.phase]}${
            state.round.phase === "finalized" && state.round.median !== null
              ? ` · consensus score ${state.round.median}`
              : ""
          }`}
        </p>
      )}
    </section>
  );
}

/**
 * The service's latest round, kept current from the API's event stream without reloading the page. Where the API
 * has no event stream (the read-only serverless deployment), it polls the service's rounds instead.
 */
export function LatestRound({ serviceId }: { serviceId: number }) {
  const [state, setState] = useState<LatestRoundState>({ status: "waiting" });

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) return;
    let latest: number | null = null;
    let active = true;
    let poller: ReturnType<typeof setInterval> | undefined;
    const poll = () =>
      fetchServiceRounds(serviceId, baseUrl).then(
        (rounds) => {
          const newest = rounds.at(-1);
          if (!active || !newest || (latest !== null && newest.id < latest)) return;
          latest = newest.id;
          setState({ status: "ready", round: newest });
        },
        () => {},
      );
    poll();
    const refresh = (roundId: number) =>
      apiClient()
        .getRound(roundId)
        .then(
          (round) => active && round.id === latest && setState({ status: "ready", round }),
          (error) =>
            active && setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" }),
        );
    const source = new EventSource(apiUrl("/events", baseUrl));
    const onEvent = (type: string) => (message: MessageEvent<string>) => {
      const event: RoundEvent = { type, data: JSON.parse(message.data) };
      latest = latestRoundFor(serviceId, latest, event);
      if (latest !== null && event.data.roundId === latest) refresh(latest);
    };
    for (const type of ROUND_EVENTS) source.addEventListener(type, onEvent(type));
    source.onerror = () => {
      // A refused stream (e.g. 404) is closed for good; an open one reconnects by itself.
      if (source.readyState === EventSource.CLOSED && active && !poller) poller = setInterval(poll, 15_000);
    };
    return () => {
      active = false;
      source.close();
      clearInterval(poller);
    };
  }, [serviceId]);

  return <LatestRoundView state={state} />;
}
