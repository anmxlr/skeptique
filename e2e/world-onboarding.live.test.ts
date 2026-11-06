import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app";

if (existsSync(".env")) process.loadEnvFile(".env");

const keys = ["WORLD_APP_ID", "WORLD_RP_ID", "WORLD_SIGNING_KEY", "ATTESTOR_PRIVATE_KEY"];
const SIMULATOR_MCP = "https://simulator.worldcoin.org/api/mcp";

// Real World ID 4.0 staging: our API signs the request, the official simulator plays the person's phone, and
// developer.world.org validates the proof through our /world/verify. No proof is mocked.
describe.skipIf(keys.some((key) => !process.env[key]))("world onboarding live", () => {
  it("a real staging proof is validated on the server and earns a voucher; replays and tampering are refused", async () => {
    const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
    const { IDKit, proofOfHuman } = webRequire("@worldcoin/idkit-core") as typeof import("@worldcoin/idkit-core");
    const env = process.env as Record<string, string>;
    const app = buildApp({
      publicClient: { getChainId: async () => 296 },
      contracts: {},
      world: {
        rpId: env.WORLD_RP_ID as string,
        signingKey: env.WORLD_SIGNING_KEY as string,
        environment: "staging",
        attestorKey: env.ATTESTOR_PRIVATE_KEY as `0x${string}`,
      },
    });
    const critic = "0x00000000000000000000000000000000000000c1";
    const roundFor = async (who: string) => {
      const ctx = (await app.inject({ method: "POST", url: "/world/rp-context" })).json();
      const request = await IDKit.request({
        app_id: env.WORLD_APP_ID as `app_${string}`,
        action: "register-critic",
        rp_context: ctx,
        allow_legacy_proofs: false,
        environment: "staging",
      } as never).preset(proofOfHuman({ signal: who }));
      return { ctx, request };
    };
    try {
      const { ctx, request } = await roundFor(critic);

      const res = await fetch(SIMULATOR_MCP, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "complete_test_request", arguments: { connect_url: request.connectorURI } },
        }),
      });
      expect(await res.text()).toContain("proof_delivered");

      const done = await request.pollUntilCompletion({ timeout: 180_000 });
      if (!done.success) throw new Error(`idkit completion failed: ${done.error}`);
      const proof = done.result as { nonce: string; responses: Array<{ nullifier: string; proof: string[] }> };
      console.log(`rp nonce == result nonce: ${proof.nonce === ctx.nonce}`);

      const ok = await app.inject({ method: "POST", url: "/world/verify", payload: { ...proof, critic } });
      console.log(`verify -> ${ok.statusCode} ${ok.body.replace(/"sig":"0x[0-9a-f]+"/, '"sig":"<voucher>"')}`);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().nullifier).toMatch(/^0x[0-9a-f]{64}$/);

      // The same human, a new request, a second critic wallet.
      const second = "0x00000000000000000000000000000000000000c2";
      const round2 = await roundFor(second);
      const sim2 = await fetch(SIMULATOR_MCP, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "complete_test_request", arguments: { connect_url: round2.request.connectorURI } },
        }),
      });
      expect(await sim2.text()).toContain("proof_delivered");
      const done2 = await round2.request.pollUntilCompletion({ timeout: 180_000 });
      if (!done2.success) throw new Error(`idkit completion failed: ${done2.error}`);
      const again = await app.inject({
        method: "POST",
        url: "/world/verify",
        payload: { ...done2.result, critic: second },
      });
      console.log(`second critic, same human -> ${again.statusCode} ${again.body}`);
      expect(again.statusCode).toBe(403);
      expect(again.json().reason).toBe("duplicate_human");

      const tampered = structuredClone(proof);
      const p0 = tampered.responses[0]?.proof[0] as string;
      (tampered.responses[0] as { proof: string[] }).proof[0] = p0.slice(0, -1) + (p0.endsWith("1") ? "2" : "1");
      const ctx2 = (await app.inject({ method: "POST", url: "/world/rp-context" })).json();
      const bad = await app.inject({
        method: "POST",
        url: "/world/verify",
        payload: { ...tampered, nonce: ctx2.nonce, critic },
      });
      console.log(`tampered proof -> ${bad.statusCode} ${bad.body}`);
      expect(bad.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
