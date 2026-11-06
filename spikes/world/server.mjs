// Spike backend for World ID 4.0 (spec/notes/world.md).
// Holds the signing key; the client only ever sees the signed rp_context.
import { createServer } from "node:http";
import { signRequest } from "@worldcoin/idkit-server";

export function createWorldServer({ rpId, signingKey, action, environment, verifyBase }) {
  const usedNullifiers = new Set();

  const routes = {
    "POST /world/rp-context": async () => {
      const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: signingKey, action });
      return [200, { rp_id: rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig }];
    },
    "POST /world/verify": async (result) => {
      if (result.environment !== environment) return [403, { reason: "wrong_environment" }];
      if (result.action !== action) return [403, { reason: "wrong_action" }];
      const res = await fetch(`${verifyBase}/api/v4/verify/${rpId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...result, environment }),
        signal: AbortSignal.timeout(10_000),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.success !== true || (out.environment && out.environment !== environment)) {
        return [403, { reason: out.code ?? `world_http_${res.status}`, detail: out.detail }];
      }
      const response = result.responses[0];
      const nullifier = `0x${BigInt(response.nullifier).toString(16).padStart(64, "0")}`;
      if (usedNullifiers.has(nullifier)) return [403, { reason: "nullifier_already_registered" }];
      usedNullifiers.add(nullifier);
      return [200, { nullifier, expires_at_min: response.expires_at_min }];
    },
  };

  return createServer(async (req, res) => {
    const handler = routes[`${req.method} ${req.url}`];
    let status = 404;
    let payload = { reason: "not_found" };
    if (handler) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      [status, payload] = await handler(raw ? JSON.parse(raw) : {});
    }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
}
