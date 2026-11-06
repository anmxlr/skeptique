"use client";

import {
  createSepoliaScoreReader,
  type EnsScoreReader,
  type EnsScoreSnapshot,
  readEnsScore,
} from "@skeptique/shared/ens";
import { useEffect, useState } from "react";

export type EnsScoreState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; snapshot: EnsScoreSnapshot };

/** No API score prop: a stale API mirror cannot replace authoritative resolver values. */
export function EnsScoreView({ state }: { state: EnsScoreState }) {
  if (state.status === "loading") return <p role="status">Reading ENS score…</p>;
  if (state.status === "unavailable") return <p>ENS score unavailable</p>;
  if (state.status === "error") return <p role="alert">Could not read ENS score</p>;
  const { snapshot } = state;
  return (
    <section aria-label="ENS reputation">
      <p>
        Score {snapshot.score} · Published confidence {Math.round(snapshot.confidence * 100)}% · Round {snapshot.round}
      </p>
      <details>
        <summary>Resolver queries</summary>
        <p>
          Resolver {snapshot.resolver} · Sepolia block {snapshot.blockNumber}
        </p>
        <ul>
          {snapshot.queries.map((query) => (
            <li key={query.key}>
              <code>{`getEnsText({ name: "${query.name}", key: "${query.key}", blockNumber: ${query.blockNumber}n })`}</code>
            </li>
          ))}
        </ul>
        <p>
          Hedera transaction: <code>{snapshot.hederaTx}</code>
        </p>
      </details>
    </section>
  );
}

export function EnsScore({
  name,
  reader,
  parentName = process.env.NEXT_PUBLIC_ENS_PARENT_NAME ?? "skeptique.eth",
}: {
  name: string;
  reader?: EnsScoreReader;
  parentName?: string;
}) {
  // Associate state with its name so navigation cannot briefly show the prior service's score.
  const [result, setResult] = useState<{ name: string; state: EnsScoreState }>({ name, state: { status: "loading" } });
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => {
        const client = reader ?? createSepoliaScoreReader(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "");
        return readEnsScore(client, { name, parentName });
      })
      .then(
        (snapshot) => {
          if (active) setResult({ name, state: snapshot ? { status: "ready", snapshot } : { status: "unavailable" } });
        },
        () => {
          if (active) setResult({ name, state: { status: "error" } });
        },
      );
    return () => {
      active = false;
    };
  }, [name, parentName, reader]);
  return <EnsScoreView state={result.name === name ? result.state : { status: "loading" }} />;
}
