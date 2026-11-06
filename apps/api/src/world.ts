import { hashSignal } from "@worldcoin/idkit-core";
import { signRequest } from "@worldcoin/idkit-server";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { PublicClient } from "viem";
import { encodeAbiParameters, isAddress, keccak256, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

/** The protected act. One fixed action, so a nullifier means "this human, as a critic of skeptique". */
export const WORLD_ACTION = "register-critic";

export type WorldEnvironment = "production" | "staging" | "sandbox";

const proofResponse = z.object({
  identifier: z.string(),
  issuer_schema_id: z.number(),
  nullifier: z.string().min(1),
  proof: z.array(z.string()),
  expires_at_min: z.number(),
  signal_hash: z.string().optional(),
});

/** The World ID 4.0 IDKit result, forwarded unchanged by the client. */
export const WorldProofResultSchema = z.object({
  protocol_version: z.string(),
  nonce: z.string().min(1),
  action: z.string(),
  environment: z.string(),
  responses: z.array(proofResponse).min(1),
});
export type WorldProofResult = z.infer<typeof WorldProofResultSchema>;

export type WorldVerifyOutcome = { ok: true } | { ok: false; code?: string };

export interface WorldDeps {
  rpId: string;
  /** Secret. Signs each IDKit request; never leaves the server. */
  signingKey: string;
  environment: WorldEnvironment;
  /** Secret. Signs critic vouchers after server-side World validation. */
  attestorKey: `0x${string}`;
  /** Asks World whether the proof is valid. Defaults to developer.world.org. */
  verify?: (body: WorldProofResult & { environment: WorldEnvironment }) => Promise<WorldVerifyOutcome>;
  now?: () => number;
  voucherTtlSecs?: number;
  rpTtlSecs?: number;
  verifyBase?: string;
}

const CANCELLED = new Set(["cancelled", "user_rejected", "verification_rejected"]);
const EXPIRED = new Set(["timeout", "rp_signature_expired", "timestamp_too_old", "request_expired"]);

function httpVerifier(rpId: string, base: string): NonNullable<WorldDeps["verify"]> {
  return async (body) => {
    const res = await fetch(`${base}/api/v4/verify/${rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const out = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string; environment?: string };
    if (!res.ok || out.success !== true || (out.environment && out.environment !== body.environment))
      return { ok: false, code: out.code ?? `world_http_${res.status}` };
    return { ok: true };
  };
}

// 0x + 64 lowercase hex, whether World sent it as hex or decimal.
function toBytes32(nullifier: string): `0x${string}` | null {
  try {
    const value = BigInt(nullifier);
    if (value < 0n || value >= 1n << 256n) return null;
    return `0x${value.toString(16).padStart(64, "0")}`;
  } catch {
    return null;
  }
}

const deny = (reply: FastifyReply, reason: string, detail?: string) =>
  reply.code(403).send(detail ? { reason, detail } : { reason });

/**
 * World ID onboarding for critics. The client's IDKit result is never authorisation: the server checks it against the
 * request it issued, asks World to verify it, and only then signs the voucher that registerCritic requires.
 */
export function registerWorldRoutes(
  root: FastifyInstance,
  world: WorldDeps,
  chain: Pick<PublicClient, "getChainId">,
): void {
  const now = world.now ?? (() => Math.floor(Date.now() / 1000));
  const verify = world.verify ?? httpVerifier(world.rpId, world.verifyBase ?? "https://developer.world.org");
  const attestor = privateKeyToAccount(world.attestorKey);
  const issued = new Map<string, number>(); // nonce -> expires_at (secs), single use
  const humans = new Map<string, string>(); // nullifier -> critic that got the voucher

  // Own scope: whatever the client sends (any content type, broken JSON) ends in a 403 with a reason.
  root.register(async (app) => {
    app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body));
    app.setErrorHandler((_error, _request, reply) => deny(reply, "tampered_payload"));

    app.post("/world/rp-context", async () => {
      const { sig, nonce, createdAt, expiresAt } = signRequest({
        signingKeyHex: world.signingKey,
        action: WORLD_ACTION,
        ttl: world.rpTtlSecs ?? 300,
      });
      for (const [n, expires] of issued) if (expires < now() - 3600) issued.delete(n);
      issued.set(nonce, expiresAt);
      return { rp_id: world.rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig };
    });

    app.post("/world/verify", async (request, reply) => {
      const body = request.body;
      if (typeof body !== "object" || body === null) return deny(reply, "tampered_payload");
      const { critic, error } = body as { critic?: unknown; error?: unknown };
      if (typeof critic !== "string" || !isAddress(critic, { strict: false })) return deny(reply, "tampered_payload");

      // The client reports a failure instead of a proof: refuse with a reason, sign nothing.
      if (typeof error === "string") {
        if (CANCELLED.has(error)) return deny(reply, "cancelled");
        return EXPIRED.has(error) ? deny(reply, "expired") : deny(reply, "unverified", error);
      }

      const parsed = WorldProofResultSchema.safeParse(body);
      if (!parsed.success) return deny(reply, "tampered_payload");
      const result = parsed.data;
      const first = result.responses[0];
      if (!first) return deny(reply, "tampered_payload");
      if (result.action !== WORLD_ACTION || result.environment !== world.environment)
        return deny(reply, "tampered_payload");
      const expiresAt = issued.get(result.nonce);
      if (expiresAt === undefined) return deny(reply, "tampered_payload");
      if (expiresAt <= now()) return deny(reply, "expired");
      if (first.signal_hash?.toLowerCase() !== hashSignal(critic.toLowerCase()).toLowerCase())
        return deny(reply, "tampered_payload");
      const nullifier = toBytes32(first.nullifier);
      if (!nullifier) return deny(reply, "tampered_payload");

      let outcome: WorldVerifyOutcome;
      try {
        outcome = await verify({ ...result, environment: world.environment });
      } catch {
        return deny(reply, "unverified", "world_unreachable");
      }
      if (!outcome.ok) return deny(reply, "unverified", outcome.code);

      // Checked and recorded in one synchronous step, so two racing requests cannot both win.
      const holder = humans.get(nullifier);
      if (holder !== undefined && holder !== critic.toLowerCase()) return deny(reply, "duplicate_human");
      if (!issued.delete(result.nonce)) return deny(reply, "tampered_payload");
      humans.set(nullifier, critic.toLowerCase());

      const expiry = now() + (world.voucherTtlSecs ?? 3600);
      const chainId = await chain.getChainId();
      const sig = await attestor.signMessage({
        message: {
          raw: keccak256(
            encodeAbiParameters(parseAbiParameters("bytes32, address, uint64, uint256"), [
              nullifier,
              critic as `0x${string}`,
              BigInt(expiry),
              BigInt(chainId),
            ]),
          ),
        },
      });
      return { nullifier, expiry, sig };
    });
  });
}
