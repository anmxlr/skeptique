"use client";

import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, type EIP1193Provider } from "viem";
import { type ApiRoutes, apiClient } from "../lib/api";
import { formatHbar } from "./marketplace";
import { Skeleton } from "./states";

type Critic = ApiRoutes["/critics"][number];

export type CriticsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; critics: readonly Critic[] };

export function CriticsView({
  state,
  onClaim,
  claimMessage,
}: {
  state: CriticsState;
  onClaim?: (critic: string) => void;
  claimMessage?: string;
}) {
  if (state.status === "loading") return <Skeleton label="Loading critics" count={2} />;
  if (state.status === "error")
    return (
      <p role="alert" className="notice-error">
        Could not load critics: {state.message}
      </p>
    );
  if (state.critics.length === 0) return <p>No critics registered yet.</p>;
  return (
    <>
      {claimMessage && <p role="status">{claimMessage}</p>}
      <ul className="market-grid">
        {state.critics.map((critic) => (
          <li key={critic.address} className="market-card">
            <h2 title={critic.address}>{critic.address}</h2>
            <dl className="market-stats">
              <dt>Stake</dt>
              <dd>{formatHbar(critic.stake)}</dd>
              <dt>Last review</dt>
              <dd>
                {critic.verdict === "honest"
                  ? "Honest"
                  : critic.verdict === "slashed"
                    ? "Slashed"
                    : critic.verdict === "outlier"
                      ? "Outlier"
                      : "No finalized review"}
              </dd>
              {critic.lastRoundId && (
                <>
                  <dt>Round</dt>
                  <dd>
                    <a href={`/rounds/${critic.lastRoundId}`}>#{critic.lastRoundId}</a>
                  </dd>
                </>
              )}
              {critic.verdict === "slashed" && (
                <>
                  <dt>Stake slashed</dt>
                  <dd>{formatHbar(critic.slashedAmount ?? "0")}</dd>
                </>
              )}
              {critic.honestRounds !== undefined && (
                <>
                  <dt>Honest rounds</dt>
                  <dd>{critic.honestRounds}</dd>
                </>
              )}
              {critic.slashes !== undefined && (
                <>
                  <dt>Slashes</dt>
                  <dd>{critic.slashes}</dd>
                </>
              )}
              {critic.pendingRewards !== undefined && (
                <>
                  <dt>Pending rewards</dt>
                  <dd>{formatHbar(critic.pendingRewards)}</dd>
                </>
              )}
            </dl>
            {BigInt(critic.pendingRewards ?? "0") > 0n && (
              <button type="button" onClick={() => onClaim?.(critic.address)}>
                Claim
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Pulls the connected wallet's rewards from RoundManager. The wallet must be the critic's own account. */
async function claimRewards(critic: string): Promise<void> {
  const deployment = await apiClient().getDeployment();
  const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("No wallet found in this browser");
  const [account] = (await ethereum.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (!account || account.toLowerCase() !== critic.toLowerCase())
    throw new Error("Connect this critic's wallet to claim its rewards.");
  const wallet = createWalletClient({ account, transport: custom(ethereum) });
  const client = createPublicClient({ transport: custom(ethereum) });
  if ((await client.getChainId()) !== deployment.chainId) throw new Error("Switch your wallet to Hedera testnet.");
  const hash = await wallet.writeContract({
    address: deployment.contracts.RoundManager,
    abi: roundManagerAbi,
    functionName: "claim",
    chain: null,
  });
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success") throw new Error("Claim reverted.");
}

/** Registered critics from the API. */
export function Critics() {
  const [state, setState] = useState<CriticsState>({ status: "loading" });
  const [claimMessage, setClaimMessage] = useState<string>();

  const load = useCallback((isActive: () => boolean = () => true) => {
    Promise.resolve()
      .then(() => apiClient().get("/critics"))
      .then(
        (critics) => isActive() && setState({ status: "ready", critics }),
        (cause) =>
          isActive() &&
          setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
  }, []);

  useEffect(() => {
    let active = true;
    load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  const claim = (critic: string) => {
    setClaimMessage("Confirm the claim in your wallet.");
    claimRewards(critic).then(
      () => {
        setClaimMessage("Rewards claimed.");
        load();
      },
      (cause) => setClaimMessage(cause instanceof Error ? cause.message : "Claim failed."),
    );
  };

  return <CriticsView state={state} onClaim={claim} claimMessage={claimMessage} />;
}
