"use client";

import type { BuyerRun } from "@skeptic/shared";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

const BUYERS: { strategy: BuyerRun["strategy"]; title: string; ranksBy: string }[] = [
  { strategy: "skeptic", title: "Skeptic buyer", ranksBy: "Ranks by critic score" },
  { strategy: "popularity", title: "Popularity buyer", ranksBy: "Ranks by paid calls" },
];

function RunCard({ run }: { run: BuyerRun }) {
  const { pick } = run;
  return (
    <>
      <p className="buyer-pick">{pick.name}</p>
      <dl className="buyer-stats">
        <dt>Rank</dt>
        <dd>{pick.rank.toFixed(1)}</dd>
        <dt>Median score</dt>
        <dd>{pick.median ?? "unrated"}</dd>
        <dt>Paid calls</dt>
        <dd>{pick.popularityCalls}</dd>
      </dl>
      <p>{run.explanation}</p>
      <h3>Result</h3>
      <pre className="buyer-result">{JSON.stringify(run.response)}</pre>
      <h3>Payment</h3>
      {run.txId ? <code className="buyer-tx">{run.txId}</code> : <p>No on-chain payment (local mode)</p>}
    </>
  );
}

export function BuyerRunsView({ runs }: { runs: readonly BuyerRun[] }) {
  return (
    <div className="buyer-grid">
      {BUYERS.map(({ strategy, title, ranksBy }) => {
        const run = runs.find((candidate) => candidate.strategy === strategy);
        return (
          <section key={strategy} className="buyer-card" aria-labelledby={`buyer-${strategy}`}>
            <h2 id={`buyer-${strategy}`}>{title}</h2>
            <p className="buyer-muted">{ranksBy}</p>
            {run ? <RunCard run={run} /> : <p className="buyer-muted">Not run yet.</p>}
          </section>
        );
      })}
    </div>
  );
}

/** Latest buyer runs from the API, refreshed every few seconds. */
export function BuyerRuns() {
  const [runs, setRuns] = useState<BuyerRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const latest = await apiClient().get("/buyer/runs");
        if (active) {
          setRuns(latest);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load buyer runs");
      }
    };
    load();
    const timer = setInterval(load, 5_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      {error && <p role="status">Buyer runs unavailable: {error}</p>}
      <BuyerRunsView runs={runs} />
    </>
  );
}
