"use client";

import type { Deployment } from "@skeptique/shared/deployment";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api";

export function DeploymentView({ deployment }: { deployment: Deployment }) {
  return (
    <section aria-label="Verified deployment">
      <h2>Hedera testnet contracts</h2>
      <p>Inspect the contracts behind this marketplace on HashScan.</p>
      <ul>
        {Object.entries(deployment.contracts).map(([name, address]) => (
          <li key={name}>
            <a href={`https://hashscan.io/testnet/contract/${address}`} target="_blank" rel="noreferrer">
              {name}: {address}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DeploymentDetails() {
  const [deployment, setDeployment] = useState<Deployment>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => apiClient().getDeployment())
      .then(
        (result) => {
          if (active) setDeployment(result);
        },
        () => {
          if (active) setError("Deployment information is unavailable.");
        },
      );
    return () => {
      active = false;
    };
  }, []);
  if (error) return <p role="status">{error}</p>;
  return deployment ? <DeploymentView deployment={deployment} /> : <p role="status">Loading deployment…</p>;
}
