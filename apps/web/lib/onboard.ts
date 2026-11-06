/** Critic onboarding: World ID Agent Pass verification, then stake and register with the server's voucher. */

export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export interface Voucher {
  nullifier: string;
  expiry: number;
  sig: string;
}

export type OnboardStep = "starting" | "awaiting-world" | "verifying" | "registering";

export type WorldCompletion = { success: true; result: object } | { success: false; error: string };

export interface WorldSession {
  /** Link or QR payload the person opens in World App. */
  connectorURI: string;
  complete(): Promise<WorldCompletion>;
}

export interface OnboardDeps {
  /** The address that will register; it is the proof's signal, so the proof is bound to it. */
  critic: string;
  rpContext(): Promise<RpContext>;
  startWorld(rp: RpContext, critic: string): WorldSession;
  verify(body: object): Promise<{ status: number; body: unknown }>;
  /** Sends the registration transaction. Only ever called with a voucher the server signed. */
  register(voucher: Voucher): Promise<string>;
  onStep?(step: OnboardStep, detail?: { connectorURI?: string }): void;
}

export type DenyReason =
  | "unverified"
  | "expired"
  | "cancelled"
  | "duplicate_human"
  | "tampered_payload"
  | "unavailable";

export type OnboardOutcome =
  | { status: "registered"; txHash: string; nullifier: string }
  | { status: "denied"; reason: DenyReason; message: string }
  | { status: "failed"; message: string };

export const DENY_MESSAGES: Record<DenyReason, string> = {
  unverified: "World could not verify you as a unique human, so no critic was registered.",
  expired: "The verification request expired. Start again to register your critic.",
  cancelled: "Verification was cancelled, so no critic was registered.",
  duplicate_human: "This human already has a critic registered. One critic per person.",
  tampered_payload: "The verification result did not match the request we issued, so it was refused.",
  unavailable: "Verification could not be completed right now. Nothing was registered; try again.",
};

const REASONS = new Set<string>(Object.keys(DENY_MESSAGES));
const denied = (reason: DenyReason): OnboardOutcome => ({ status: "denied", reason, message: DENY_MESSAGES[reason] });

function isVoucher(value: unknown): value is Voucher {
  const v = value as Partial<Voucher> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.nullifier === "string" &&
    /^0x[0-9a-f]{64}$/i.test(v.nullifier) &&
    typeof v.expiry === "number" &&
    typeof v.sig === "string" &&
    v.sig.startsWith("0x")
  );
}

export async function onboardCritic(deps: OnboardDeps): Promise<OnboardOutcome> {
  let voucher: Voucher;
  try {
    deps.onStep?.("starting");
    const rp = await deps.rpContext();
    const session = deps.startWorld(rp, deps.critic);
    deps.onStep?.("awaiting-world", { connectorURI: session.connectorURI });
    const completion = await session.complete();
    deps.onStep?.("verifying");
    // The IDKit result goes to the server unchanged; the server alone decides whether it authorises anything.
    const res = await deps.verify(
      completion.success
        ? { ...completion.result, critic: deps.critic }
        : { error: completion.error, critic: deps.critic },
    );
    if (res.status !== 200) {
      const reason = (res.body as { reason?: unknown } | null)?.reason;
      return denied(typeof reason === "string" && REASONS.has(reason) ? (reason as DenyReason) : "unavailable");
    }
    if (!isVoucher(res.body)) return denied("unavailable");
    voucher = res.body;
  } catch {
    return denied("unavailable");
  }
  try {
    deps.onStep?.("registering");
    const txHash = await deps.register(voucher);
    return { status: "registered", txHash, nullifier: voucher.nullifier };
  } catch (cause) {
    return { status: "failed", message: cause instanceof Error ? cause.message : "Registration failed" };
  }
}
