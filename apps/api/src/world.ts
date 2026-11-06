// World ID 4.0 critic onboarding (spec/notes/world.md, spec/03 `/world/*`). The browser only ever gets a
// server-signed rp_context; the IDKit result it returns is never trusted until every check below passes.
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import type { FastifyInstance } from "fastify";
import { encodeAbiParameters, type Hex, isAddress, keccak256, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type WorldDenial =
  | "unverified"
  | "cancelled"
  | "expired"
  | "wrong_environment"
  | "wrong_action"
  | "wrong_signal"
  | "invalid_proof"
  | "duplicate_human";

export interface WorldConfig {
  /** Public app_... id the browser passes to IDKit. */
  appId: string;
  rpId: string;
  /** IDKit action for the protected act; one per act so the nullifier means "this human, as a critic". */
  action: string;
  /** "staging" accepts simulator proofs; "production" only real World App proofs. */
  environment: string;
  /** Signs an rp_context with the World signing key (`signRequest` from @worldcoin/idkit-server). */
  signRequest(action: string): { sig: string; nonce: string; createdAt: number; expiresAt: number };
  /** World's verify API for a result (see createWorldVerifier). */
  verifyProof(result: unknown): Promise<{ success: boolean; code?: string }>;
  /** Attestor key that CriticRegistry trusts for vouchers (ATTESTOR_PRIVATE_KEY). */
  attestorKey: Hex;
  /** Whether a nullifier already registered a critic on chain. */
  isNullifierRegistered?(nullifier: Hex): Promise<boolean>;
  voucherTtlSecs?: number;
  now?(): number;
}

/** World's Developer Portal verify API (spec/notes/world.md "Server-side validation"). */
export function createWorldVerifier(options: {
  rpId: string;
  environment: string;
  fetchImpl?: typeof fetch;
}): WorldConfig["verifyProof"] {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (result) => {
    const res = await fetchImpl(`https://developer.world.org/api/v4/verify/${options.rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(result as object), environment: options.environment }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: unknown; code?: string; environment?: string };
    const success = res.ok && body.success === true && (!body.environment || body.environment === options.environment);
    return { success, code: body.code ?? (success ? undefined : `world_http_${res.status}`) };
  };
}

const CANCELLED = new Set(["user_rejected", "verification_rejected", "cancelled"]);
const EXPIRED = new Set(["timeout", "rp_signature_expired", "timestamp_too_old", "request_expired"]);

const toBytes32 = (value: string): Hex => `0x${BigInt(value).toString(16).padStart(64, "0")}`;

export function signVoucher(
  attestorKey: Hex,
  voucher: { nullifier: Hex; critic: Hex; expiry: bigint; chainId: number },
) {
  const digest = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint64, uint256"), [
      voucher.nullifier,
      voucher.critic,
      voucher.expiry,
      BigInt(voucher.chainId),
    ]),
  );
  return privateKeyToAccount(attestorKey).signMessage({ message: { raw: digest } });
}

interface ProofResponse {
  nullifier: string;
  proof: unknown;
  signal_hash?: string;
}
interface IdkitResult {
  protocol_version: string;
  nonce: string;
  action: string;
  environment: string;
  responses: ProofResponse[];
}

function asResult(body: Record<string, unknown>): IdkitResult | undefined {
  const response = Array.isArray(body.responses) ? (body.responses[0] as Partial<ProofResponse>) : undefined;
  const ok =
    body.protocol_version === "4.0" &&
    typeof body.nonce === "string" &&
    typeof body.action === "string" &&
    typeof body.environment === "string" &&
    typeof response?.nullifier === "string" &&
    /^(0x[0-9a-fA-F]{1,64}|\d{1,78})$/.test(response.nullifier) &&
    Array.isArray(response.proof);
  return ok ? (body as unknown as IdkitResult) : undefined;
}

export function registerWorldRoutes(app: FastifyInstance, config: WorldConfig, chainId: () => Promise<number>): void {
  const now = config.now ?? Date.now;
  const ttl = BigInt(config.voucherTtlSecs ?? 3600);
  const issued = new Map<string, number>(); // nonce -> deadline on this server's clock (ms)
  const vouched = new Set<Hex>();

  // The Critics page calls these routes from its own origin. They take no cookies, so any origin may call them.
  app.addHook("onSend", async (request, reply) => {
    if (request.url.startsWith("/world/")) reply.header("access-control-allow-origin", "*");
  });
  for (const url of ["/world/rp-context", "/world/verify"])
    app.options(url, async (_request, reply) =>
      reply
        .code(204)
        .header("access-control-allow-methods", "POST")
        .header("access-control-allow-headers", "content-type")
        .send(),
    );

  app.post("/world/rp-context", async () => {
    const { sig, nonce, createdAt, expiresAt } = config.signRequest(config.action);
    issued.set(nonce, now() + (expiresAt - createdAt) * 1000);
    return {
      app_id: config.appId,
      action: config.action,
      environment: config.environment,
      rp_id: config.rpId,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      signature: sig,
    };
  });

  app.post("/world/verify", async (request, reply) => {
    const deny = (reason: WorldDenial, detail?: string) => reply.code(403).send({ reason, ...(detail && { detail }) });
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (typeof body.error === "string") {
      if (CANCELLED.has(body.error)) return deny("cancelled", body.error);
      if (EXPIRED.has(body.error)) return deny("expired", body.error);
      return deny("unverified", body.error);
    }
    const { critic, ...forwarded } = body;
    const result = asResult(forwarded);
    if (!result || typeof critic !== "string" || !isAddress(critic)) return deny("unverified");

    const deadline = issued.get(result.nonce);
    if (deadline === undefined) return deny("unverified", "unknown_or_used_request");
    issued.delete(result.nonce);
    if (now() > deadline) return deny("expired");

    if (result.environment !== config.environment) return deny("wrong_environment");
    if (result.action !== config.action) return deny("wrong_action");
    const [response] = result.responses;
    if (!response || BigInt(response.signal_hash ?? "0x0") !== BigInt(hashSignal(critic.toLowerCase())))
      return deny("wrong_signal");

    const verdict = await config.verifyProof({ ...forwarded, environment: config.environment });
    if (!verdict.success) return deny("invalid_proof", verdict.code);

    const nullifier = toBytes32(response.nullifier);
    if (vouched.has(nullifier) || (await config.isNullifierRegistered?.(nullifier))) return deny("duplicate_human");
    vouched.add(nullifier);

    const expiry = BigInt(Math.floor(now() / 1000)) + ttl;
    const sig = await signVoucher(config.attestorKey, {
      nullifier,
      critic: critic as Hex,
      expiry,
      chainId: await chainId(),
    });
    return { nullifier, expiry: expiry.toString(), sig };
  });
}
