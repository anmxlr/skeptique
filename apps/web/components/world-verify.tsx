"use client";

import { useRef, useState } from "react";
import { apiClient } from "../lib/api";

/** What `POST /world/rp-context` returns: the server-signed request plus the public World settings. */
export interface RpContextResponse {
  app_id: string;
  action: string;
  environment: string;
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export interface Voucher {
  nullifier: string;
  expiry: string;
  sig: string;
}

export type VerifyState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "waiting"; connectorURI: string; simulatorURL?: string }
  | { status: "checking" }
  | { status: "verified"; voucher: Voucher }
  | { status: "denied"; reason: string };

type Post = (path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
interface WorldRequest {
  connectorURI: string;
  pollUntilCompletion(options: { signal: AbortSignal }): Promise<unknown>;
}

const SIMULATOR = "https://simulator.worldcoin.org/";

/**
 * One verification: get a server-signed rp_context, run the IDKit request bound to the critic's address, then let
 * the API decide. IDKit failures go to the API as well, so the page shows the server's reason, never its own verdict.
 */
export async function runWorldVerification(options: {
  post: Post;
  request: (context: RpContextResponse, signal: string) => Promise<WorldRequest>;
  critic: string;
  abort: AbortSignal;
  onWaiting: (connectorURI: string, simulatorURL: string | undefined) => void;
}): Promise<VerifyState> {
  const context = await options.post("/world/rp-context");
  if (context.status !== 200) return { status: "denied", reason: "unavailable" };
  const ctx = context.body as RpContextResponse;
  const request = await options.request(ctx, options.critic.toLowerCase());
  const simulatorURL =
    ctx.environment === "staging" ? `${SIMULATOR}?connect_url=${encodeURIComponent(request.connectorURI)}` : undefined;
  options.onWaiting(request.connectorURI, simulatorURL);

  const completion = (await request.pollUntilCompletion({ signal: options.abort })) as
    | { success: true; result: object }
    | { success: false; error: string };
  const body = completion.success
    ? { ...completion.result, critic: options.critic }
    : { success: false, error: completion.error, critic: options.critic };
  const verified = await options.post("/world/verify", body);
  if (verified.status === 200) return { status: "verified", voucher: verified.body as Voucher };
  return { status: "denied", reason: (verified.body as { reason?: string }).reason ?? "unverified" };
}

const DENIALS: Record<string, string> = {
  unverified: "No valid World ID proof was received.",
  cancelled: "Verification was cancelled.",
  expired: "The verification request expired. Start again.",
  wrong_environment: "The proof was made for a different World ID environment.",
  wrong_action: "The proof was made for a different action.",
  wrong_signal: "The proof was made for a different critic wallet.",
  invalid_proof: "World rejected the proof.",
  duplicate_human: "This person already has a registered critic.",
  unavailable: "World ID verification is not available right now.",
};

const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

export function WorldVerifyView(props: {
  state: VerifyState;
  critic: string;
  onCriticChange: (critic: string) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { state } = props;
  const busy = state.status === "starting" || state.status === "waiting" || state.status === "checking";
  return (
    <section className="world-verify" aria-labelledby="world-verify-title">
      <h2 id="world-verify-title">Register a critic</h2>
      <p>Prove you are a unique human with World ID. Each person can back one critic agent.</p>
      <label className="world-field">
        Critic agent wallet
        <input
          value={props.critic}
          onChange={(event) => props.onCriticChange(event.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
          disabled={busy}
        />
      </label>
      {busy ? (
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      ) : (
        <button type="button" onClick={props.onStart} disabled={!isAddress(props.critic)}>
          Verify with World ID
        </button>
      )}
      {state.status === "starting" && <p role="status">Preparing a World ID request…</p>}
      {state.status === "waiting" && (
        <div role="status">
          <p>
            <a href={state.connectorURI} target="_blank" rel="noreferrer">
              Open in World App
            </a>{" "}
            and approve the request.
          </p>
          {state.simulatorURL && (
            <p>
              Testing on staging?{" "}
              <a href={state.simulatorURL} target="_blank" rel="noreferrer">
                Complete it in the World ID simulator
              </a>
              .
            </p>
          )}
        </div>
      )}
      {state.status === "checking" && <p role="status">Checking the proof on the server…</p>}
      {state.status === "denied" && (
        <p role="alert" className="world-denied">
          {DENIALS[state.reason] ?? `Verification failed (${state.reason}).`} Your critic was not registered.
        </p>
      )}
      {state.status === "verified" && (
        <div role="status">
          <p>Verified. Your critic agent stakes and registers with this voucher before it expires:</p>
          <pre className="world-voucher">{JSON.stringify(state.voucher, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

export function WorldVerify() {
  const [critic, setCritic] = useState("");
  const [state, setState] = useState<VerifyState>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    abort.current = new AbortController();
    setState({ status: "starting" });
    try {
      const api = apiClient();
      const { IDKit, proofOfHuman } = await import("@worldcoin/idkit-core");
      const next = await runWorldVerification({
        post: api.post,
        critic,
        abort: abort.current.signal,
        request: (ctx, signal) =>
          IDKit.request({
            app_id: ctx.app_id as `app_${string}`,
            action: ctx.action,
            rp_context: {
              rp_id: ctx.rp_id,
              nonce: ctx.nonce,
              created_at: ctx.created_at,
              expires_at: ctx.expires_at,
              signature: ctx.signature,
            },
            allow_legacy_proofs: false,
            environment: ctx.environment as "production" | "staging",
          }).preset(proofOfHuman({ signal })),
        onWaiting: (connectorURI, simulatorURL) => setState({ status: "waiting", connectorURI, simulatorURL }),
      });
      setState(next);
    } catch {
      setState({ status: "denied", reason: "unavailable" });
    }
  };

  return (
    <WorldVerifyView
      state={state}
      critic={critic}
      onCriticChange={setCritic}
      onStart={start}
      onCancel={() => abort.current?.abort()}
    />
  );
}
