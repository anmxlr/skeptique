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
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "ready"; snapshot: EnsScoreSnapshot };

/** No API score prop: a stale API mirror cannot replace authoritative resolver values. */
export function EnsScoreView({ state }: { state: EnsScoreState }) {
  if (state.status === "loading") return <p role="status">Reading ENS score…</p>;
  if (state.status === "unavailable") return <p>ENS score unavailable</p>;
  if (state.status === "unconfigured") return <p>ENS reputation is not configured</p>;
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
  parentName = process.env.NEXT_PUBLIC_ENS_PARENT_NAME,
}: {
  name: string;
  reader?: EnsScoreReader;
  parentName?: string;
}) {
  // Bind state to both namespace and name so navigation cannot show a prior service's score.
  const key = `${parentName}/${name}`;
  const [result, setResult] = useState<{ key: string; state: EnsScoreState }>({ key, state: { status: "loading" } });
  useEffect(() => {
    if (!parentName) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        const client = reader ?? createSepoliaScoreReader(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "");
        return readEnsScore(client, { name, parentName });
      })
      .then(
        (snapshot) => {
          if (active) setResult({ key, state: snapshot ? { status: "ready", snapshot } : { status: "unavailable" } });
        },
        () => {
          if (active) setResult({ key, state: { status: "error" } });
        },
      );
    return () => {
      active = false;
    };
  }, [name, parentName, reader, key]);
  return (
    <EnsScoreView
      state={!parentName ? { status: "unconfigured" } : result.key === key ? result.state : { status: "loading" }}
    />
  );
}
