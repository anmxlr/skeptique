import { hashSignal } from "@worldcoin/idkit-core";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";

const origin = "http://localhost:3000";
const critic = "0x00000000000000000000000000000000000000c1";
function setup() {
  const verify = vi.fn(async () => ({ ok: false as const, code: "invalid_proof" }));
  const app = buildApp({
    publicClient: { getChainId: async () => 296 },
    contracts: {},
    webOrigin: origin,
    world: {
      rpId: "rp_test",
      signingKey: `0x${"0b".repeat(32)}`,
      environment: "staging",
      attestorKey: `0x${"0a".repeat(32)}`,
      verify,
    },
  });
  return { app, verify };
}

describe("World browser CORS", () => {
  it("permits JSON POST preflight only for the configured origin and two World endpoints", async () => {
    const { app } = setup();
    try {
      for (const url of ["/world/rp-context", "/world/verify"]) {
        const response = await app.inject({
          method: "OPTIONS",
          url,
          headers: {
            origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
          },
        });
        expect(response.statusCode).toBe(204);
        expect(response.headers["access-control-allow-origin"]).toBe(origin);
        expect(response.headers["access-control-allow-methods"]).toBe("POST, OPTIONS");
        expect(response.headers["access-control-allow-headers"]).toBe("Content-Type");
        expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
        expect(response.headers.vary).toBe("Origin");
      }
      for (const headers of [
        { origin: "https://untrusted.example", "access-control-request-method": "POST" },
        { origin, "access-control-request-method": "DELETE" },
        { origin, "access-control-request-method": "POST", "access-control-request-headers": "authorization" },
      ]) {
        const response = await app.inject({ method: "OPTIONS", url: "/world/verify", headers });
        expect(response.statusCode).toBe(403);
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      }
      const unrelated = await app.inject({
        method: "OPTIONS",
        url: "/evidence",
        headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
      });
      expect(unrelated.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("keeps server proof validation and exposes trusted POST denial responses to the browser", async () => {
    const { app, verify } = setup();
    try {
      const context = await app.inject({ method: "POST", url: "/world/rp-context", headers: { origin } });
      expect(context.statusCode).toBe(200);
      expect(context.headers["access-control-allow-origin"]).toBe(origin);
      const response = await app.inject({
        method: "POST",
        url: "/world/verify",
        headers: { origin },
        payload: {
          critic,
          protocol_version: "4.0",
          nonce: context.json().nonce,
          action: "register-critic",
          environment: "staging",
          responses: [
            {
              identifier: "proof_of_human",
              issuer_schema_id: 1,
              nullifier: "1",
              proof: ["0x1"],
              expires_at_min: 1_900_000_000,
              signal_hash: hashSignal(critic),
            },
          ],
        },
      });
      expect(verify).toHaveBeenCalledOnce();
      expect(response.statusCode).toBe(403);
      expect(response.json()).not.toHaveProperty("sig");
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
      const unrelated = await app.inject({ method: "POST", url: "/evidence", headers: { origin }, payload: {} });
      expect(unrelated.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it.each([
    "*",
    "null",
    "file:///tmp/web",
    "https://app.example/path",
    "https://app.example/",
    "https://user:password@app.example",
  ])("rejects invalid startup web origin %s", (webOrigin) => {
    expect(() => buildApp({ publicClient: { getChainId: async () => 296 }, contracts: {}, webOrigin })).toThrow(
      "webOrigin",
    );
  });
});
