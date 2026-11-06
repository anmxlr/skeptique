import { randomBytes } from "node:crypto";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest } from "@worldcoin/idkit-server";
import { encodeAbiParameters, type Hex, keccak256, parseAbiParameters, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { createWorldVerifier, type WorldConfig } from "./world";

const ATTESTOR_KEY = `0x${"11".repeat(32)}` as Hex;
const CRITIC = "0x00000000000000000000000000000000000000c1";
const OTHER = "0x00000000000000000000000000000000000000c2";
const ACTION = "register-critic";
const HUMAN = `0x${"0a".repeat(31)}01`; // a World nullifier, as World returns it

type Result = Record<string, unknown> & { responses: Record<string, unknown>[] };

/** An IDKit 4.0 result shaped as spec/notes/world.md documents, proving `signal` for `nullifier`. */
const idkitResult = (nonce: string, signal: string, nullifier = HUMAN): Result => ({
  protocol_version: "4.0",
  nonce,
  action: ACTION,
  environment: "staging",
  responses: [
    {
      identifier: "proof_of_human",
      issuer_schema_id: 1,
      nullifier,
      proof: ["valid", "1", "2", "3", "4"],
      expires_at_min: 1_900_000_000,
      signal_hash: hashSignal(signal),
    },
  ],
});

function setup(overrides: Partial<WorldConfig> = {}) {
  let clock = Date.parse("2026-11-06T10:00:00Z");
  const verified: unknown[] = [];
  const world: WorldConfig = {
    rpId: "rp_test",
    action: ACTION,
    environment: "staging",
    signRequest: (action) => signRequest({ signingKeyHex: randomBytes(32).toString("hex"), action, ttl: 300 }),
    // Stands in for World's verify API: a proof is valid unless a field was tampered with.
    verifyProof: async (body) => {
      verified.push(body);
      const proof = (body as Result).responses[0]?.proof as string[];
      return proof[0] === "valid" ? { success: true } : { success: false, code: "all_verifications_failed" };
    },
    attestorKey: ATTESTOR_KEY,
    now: () => clock,
    ...overrides,
  };
  const app = buildApp({ publicClient: { getChainId: async () => 296 }, contracts: {}, world });
  const rpContext = async () => (await app.inject({ method: "POST", url: "/world/rp-context" })).json();
  const verify = (payload: object) => app.inject({ method: "POST", url: "/world/verify", payload });
  return { app, rpContext, verify, verified, advance: (ms: number) => (clock += ms) };
}

const expectDenied = async (response: { statusCode: number; json: () => unknown }, reason: string) => {
  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({ reason });
};

describe("world verify", () => {
  it("hands out a server-signed rp_context and never the signing key", async () => {
    const { app, rpContext } = setup();
    const context = await rpContext();
    expect(context).toMatchObject({ rp_id: "rp_test", nonce: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    expect(context.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(context.expires_at - context.created_at).toBe(300);
    expect(JSON.stringify(context)).not.toContain(ATTESTOR_KEY.slice(2));
    await app.close();
  });

  it("success: validates with World and returns an attestor voucher over (nullifier, critic, expiry, chainid)", async () => {
    const { app, rpContext, verify, verified } = setup();
    const { nonce } = await rpContext();
    const response = await verify({ ...idkitResult(nonce, CRITIC), critic: CRITIC });
    expect(response.statusCode).toBe(200);
    const { nullifier, expiry, sig } = response.json();
    expect(nullifier).toBe(`0x${BigInt(HUMAN).toString(16).padStart(64, "0")}`);
    expect(Number(expiry)).toBe(Date.parse("2026-11-06T10:00:00Z") / 1000 + 3600);
    expect(verified).toHaveLength(1);
    expect(verified[0]).not.toHaveProperty("critic");

    const digest = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, address, uint64, uint256"), [
        nullifier,
        CRITIC,
        BigInt(expiry),
        296n,
      ]),
    );
    expect(await recoverMessageAddress({ message: { raw: digest }, signature: sig })).toBe(
      privateKeyToAccount(ATTESTOR_KEY).address,
    );
    await app.close();
  });

  it("unverified: no proof, a nonce the server never issued, or a reused nonce", async () => {
    const { app, rpContext, verify, verified } = setup();
    await expectDenied(await verify({ critic: CRITIC }), "unverified");
    await expectDenied(await verify({ ...idkitResult(`0x${"00".repeat(32)}`, CRITIC), critic: CRITIC }), "unverified");
    const { nonce } = await rpContext();
    expect((await verify({ ...idkitResult(nonce, CRITIC), critic: CRITIC })).statusCode).toBe(200);
    await expectDenied(
      await verify({ ...idkitResult(nonce, CRITIC, `0x${"0b".repeat(32)}`), critic: CRITIC }),
      "unverified",
    );
    expect(verified).toHaveLength(1);
    await app.close();
  });

  it("expired: the request's rp_context is past its expiry, or IDKit reports a timeout", async () => {
    const { app, rpContext, verify, advance, verified } = setup();
    const { nonce } = await rpContext();
    advance(301_000);
    await expectDenied(await verify({ ...idkitResult(nonce, CRITIC), critic: CRITIC }), "expired");
    await expectDenied(await verify({ success: false, error: "rp_signature_expired", critic: CRITIC }), "expired");
    await expectDenied(await verify({ success: false, error: "timeout", critic: CRITIC }), "expired");
    expect(verified).toHaveLength(0);
    await app.close();
  });

  it("cancelled: the person cancelled in World App or the page aborted the request", async () => {
    const { app, verify, verified } = setup();
    for (const error of ["user_rejected", "verification_rejected", "cancelled"])
      await expectDenied(await verify({ success: false, error, critic: CRITIC }), "cancelled");
    expect(verified).toHaveLength(0);
    await app.close();
  });

  it("duplicate human: a second critic from the same person, in memory or already on chain", async () => {
    const { app, rpContext, verify } = setup();
    expect((await verify({ ...idkitResult((await rpContext()).nonce, CRITIC), critic: CRITIC })).statusCode).toBe(200);
    await expectDenied(
      await verify({ ...idkitResult((await rpContext()).nonce, OTHER), critic: OTHER }),
      "duplicate_human",
    );
    await app.close();

    const onChain = setup({
      isNullifierRegistered: async (n) => n === `0x${BigInt(HUMAN).toString(16).padStart(64, "0")}`,
    });
    await expectDenied(
      await onChain.verify({ ...idkitResult((await onChain.rpContext()).nonce, CRITIC), critic: CRITIC }),
      "duplicate_human",
    );
    await onChain.app.close();
  });

  it("tampered: an altered proof fails World's check; a proof for another wallet or app setting is refused", async () => {
    const { app, rpContext, verify, verified } = setup();
    const tampered = idkitResult((await rpContext()).nonce, CRITIC);
    (tampered.responses[0] as { proof: string[] }).proof[0] = "altered";
    await expectDenied(await verify({ ...tampered, critic: CRITIC }), "invalid_proof");
    expect(verified).toHaveLength(1);

    await expectDenied(
      await verify({ ...idkitResult((await rpContext()).nonce, CRITIC), critic: OTHER }),
      "wrong_signal",
    );
    await expectDenied(
      await verify({ ...idkitResult((await rpContext()).nonce, CRITIC), environment: "production", critic: CRITIC }),
      "wrong_environment",
    );
    await expectDenied(
      await verify({ ...idkitResult((await rpContext()).nonce, CRITIC), action: "other", critic: CRITIC }),
      "wrong_action",
    );
    expect(verified).toHaveLength(1);
    await app.close();
  });
});

describe("world verify: World's verify API", () => {
  const call = (status: number, body: unknown) => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { verify: createWorldVerifier({ rpId: "rp_test", environment: "staging", fetchImpl }), requests };
  };

  it("posts the result to the rp's verify endpoint with the server's environment", async () => {
    const { verify, requests } = call(200, { success: true, environment: "staging" });
    expect(await verify({ nonce: "0x1", environment: "production" })).toEqual({ success: true, code: undefined });
    expect(requests).toEqual([
      { url: "https://developer.world.org/api/v4/verify/rp_test", body: { nonce: "0x1", environment: "staging" } },
    ]);
  });

  it("fails on World's error code, an unexpected environment, or a non-JSON reply", async () => {
    expect(await call(400, { success: false, code: "all_verifications_failed" }).verify({})).toEqual({
      success: false,
      code: "all_verifications_failed",
    });
    expect((await call(200, { success: true, environment: "production" }).verify({})).success).toBe(false);
    expect(await call(502, "bad gateway").verify({})).toEqual({ success: false, code: "world_http_502" });
  });
});

describe("world verify: browser access", () => {
  it("answers the CORS preflight and allows the web app's origin on both routes", async () => {
    const { app } = setup();
    for (const url of ["/world/rp-context", "/world/verify"]) {
      const preflight = await app.inject({
        method: "OPTIONS",
        url,
        headers: { origin: "http://web.test", "access-control-request-method": "POST" },
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers["access-control-allow-origin"]).toBe("*");
      expect(preflight.headers["access-control-allow-headers"]).toContain("content-type");
    }
    const response = await app.inject({ method: "POST", url: "/world/rp-context" });
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    await app.close();
  });
});
