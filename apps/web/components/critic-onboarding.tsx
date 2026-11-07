"use client";

import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { contractValue } from "@skeptique/shared/deployment";
import { useState } from "react";
import { createPublicClient, createWalletClient, custom, type EIP1193Provider } from "viem";
import { apiClient, apiUrl } from "../lib/api";
import { type OnboardOutcome, type OnboardStep, onboardCritic, type RpContext, type Voucher } from "../lib/onboard";

export type OnboardingState =
  | { status: "idle" }
  | { status: "running"; step: OnboardStep; connectorURI?: string }
  | OnboardOutcome;

const STEP_TEXT: Record<OnboardStep, string> = {
  starting: "Starting verification…",
  "awaiting-world": "Open World App and approve the request.",
  verifying: "Validating the result on the server…",
  registering: "Verified. Confirm the stake transaction in your wallet.",
};

export function OnboardingView({
  state,
  onStart,
  onCancel,
}: {
  state: OnboardingState;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  return (
    <section aria-label="Register a critic">
      <h2>Register a critic</h2>
      <p>Verify with World ID Agent Pass, then stake to register your critic agent.</p>
      {state.status === "idle" && (
        <button type="button" onClick={onStart}>
          Verify with World ID
        </button>
      )}
      {state.status === "running" && (
        <div role="status">
          <p>{STEP_TEXT[state.step]}</p>
          {state.connectorURI && (
            <p>
              <a href={state.connectorURI} target="_blank" rel="noreferrer">
                Open in World App
              </a>
            </p>
          )}
          {state.step === "awaiting-world" && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      )}
      {state.status === "registered" && (
        <p role="status">
          Critic registered. Human id {state.nullifier}. Transaction {state.txHash}.
        </p>
      )}
      {state.status === "denied" && (
        <p role="alert" data-reason={state.reason}>
          Not registered: {state.message}
        </p>
      )}
      {state.status === "failed" && <p role="alert">Registration failed: {state.message}</p>}
      {(state.status === "denied" || state.status === "failed") && (
        <button type="button" onClick={onStart}>
          Try again
        </button>
      )}
    </section>
  );
}

function requiredEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

// Only public values are read here: the app id, the API origin and the registry address. No secret exists in the browser.
async function runOnboarding(onChange: (state: OnboardingState) => void, signal: AbortSignal) {
  const apiBase = requiredEnv(process.env.NEXT_PUBLIC_API_URL, "NEXT_PUBLIC_API_URL");
  const appId = requiredEnv(process.env.NEXT_PUBLIC_WORLD_APP_ID, "NEXT_PUBLIC_WORLD_APP_ID");
  const deployment = await apiClient().getDeployment();
  const registry = deployment.contracts.CriticRegistry;
  const environment = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ?? "production") as
    | "production"
    | "staging"
    | "sandbox";
  const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("No wallet found in this browser");
  const [critic] = (await ethereum.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (!critic) throw new Error("No wallet account selected");
  const { IDKit, proofOfHuman } = await import("@worldcoin/idkit-core");

  const post = async (path: string, body?: object) => {
    const res = await fetch(apiUrl(path, apiBase), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  return onboardCritic({
    critic: critic.toLowerCase(),
    onStep: (step, detail) => onChange({ status: "running", step, ...detail }),
    rpContext: async () => {
      const res = await post("/world/rp-context");
      if (res.status !== 200) throw new Error("rp-context unavailable");
      return res.body as RpContext;
    },
    startWorld: (rp, who) => {
      const request = IDKit.request({
        app_id: appId as `app_${string}`,
        action: "register-critic",
        rp_context: {
          rp_id: rp.rp_id,
          nonce: rp.nonce,
          created_at: rp.created_at,
          expires_at: rp.expires_at,
          signature: rp.signature,
        },
        allow_legacy_proofs: false,
        environment,
      } as never).preset(proofOfHuman({ signal: who }));
      return {
        connectorURI: (request as unknown as { connectorURI: string }).connectorURI,
        complete: async () => {
          const done = await (
            request as unknown as {
              pollUntilCompletion(o: {
                signal: AbortSignal;
              }): Promise<{ success: boolean; result?: object; error?: string }>;
            }
          ).pollUntilCompletion({ signal });
          return done.success && done.result
            ? { success: true as const, result: done.result }
            : { success: false as const, error: done.error ?? "unverified" };
        },
      };
    },
    verify: (body) => post("/world/verify", body),
    register: async (voucher: Voucher) => {
      const wallet = createWalletClient({ account: critic, transport: custom(ethereum) });
      const client = createPublicClient({ transport: custom(ethereum) });
      const [minStake, chainId] = await Promise.all([
        client.readContract({ address: registry, abi: criticRegistryAbi, functionName: "minStake" }),
        client.getChainId(),
      ]);
      if (chainId !== deployment.chainId) throw new Error("Switch your wallet to Hedera testnet before registering.");
      const value = contractValue(minStake, chainId);
      const hash = await wallet.writeContract({
        address: registry,
        abi: criticRegistryAbi,
        functionName: "registerCritic",
        args: [voucher.nullifier as `0x${string}`, BigInt(voucher.expiry), voucher.sig as `0x${string}`],
        value,
        chain: null,
      });
      if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
        throw new Error("Critic registration reverted.");
      return hash;
    },
  });
}

export function CriticOnboarding() {
  const [state, setState] = useState<OnboardingState>({ status: "idle" });
  const [abort, setAbort] = useState<AbortController | null>(null);

  const start = () => {
    const controller = new AbortController();
    setAbort(controller);
    setState({ status: "running", step: "starting" });
    runOnboarding(setState, controller.signal).then(setState, (cause) =>
      setState({ status: "failed", message: cause instanceof Error ? cause.message : "Unknown error" }),
    );
  };

  return <OnboardingView state={state} onStart={start} onCancel={() => abort?.abort()} />;
}
