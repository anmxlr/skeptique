import { hashSignal } from "@worldcoin/idkit-core";
import { encodeAbiParameters, keccak256, parseAbiParameters, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import type { WorldDeps, WorldProofResult } from "./world";

const ATTESTOR_KEY = `0x${"0a".repeat(32)}` as const;
const SIGNING_KEY = `0x${"0b".repeat(32)}`;
const SECRETS = [ATTESTOR_KEY.slice(2), SIGNING_KEY.slice(2)];
const critic = "0x00000000000000000000000000000000000000c1";
const otherCritic = "0x00000000000000000000000000000000000000c2";
const CHAIN_ID = 31337;

function setup(overrides: Partial<WorldDeps> = {}) {
  const clock = { now: Math.floor(Date.now() / 1000) };
  const verified: unknown[] = [];
  const verify: WorldDeps["verify"] = async (body) => {
    verified.push(body);
    return { ok: true };
  };
  const app = buildApp({
    publicClient: { getChainId: async () => CHAIN_ID },
    contracts: {},
    world: {
      rpId: "rp_test",
      signingKey: SIGNING_KEY,
      environment: "staging",
      attestorKey: ATTESTOR_KEY,
      now: () => clock.now,
      verify,
      ...overrides,
    },
  });
  return { app, clock, verified };
}

async function rpContext(app: ReturnType<typeof setup>["app"]) {
  const res = await app.inject({ method: "POST", url: "/world/rp-context" });
  expect(res.statusCode).toBe(200);
  return res.json() as { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
}

function proof(
  nonce: string,
  who = critic,
  nullifier = "0x1e1c0c2bcdf61aa3c3cb7c1306f0fdebef3971b2cec64bd2c7b11d4482490554",
) {
  return {
    protocol_version: "4.0",
    nonce,
    action: "register-critic",
    environment: "staging",
    responses: [
      {
        identifier: "proof_of_human",
        issuer_schema_id: 1,
        nullifier,
        proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
        expires_at_min: 1_800_100_000,
        signal_hash: hashSignal(who),
      },
    ],
  } satisfies WorldProofResult;
}

const post = (app: ReturnType<typeof setup>["app"], body: unknown) =>
  app.inject({ method: "POST", url: "/world/verify", payload: body as object });

describe("world verify", () => {
  it("success: validates on the server, derives the nullifier and signs a voucher the contract accepts", async () => {
    const { app, clock, verified } = setup();
    const ctx = await rpContext(app);
    const res = await post(app, { ...proof(ctx.nonce), critic });
    expect(res.statusCode).toBe(200);
    const { nullifier, expiry, sig } = res.json();
    expect(nullifier).toBe("0x1e1c0c2bcdf61aa3c3cb7c1306f0fdebef3971b2cec64bd2c7b11d4482490554");
    expect(expiry).toBeGreaterThan(clock.now);
    expect(verified).toHaveLength(1);
    const digest = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, address, uint64, uint256"), [
        nullifier,
        critic,
        BigInt(expiry),
        BigInt(CHAIN_ID),
      ]),
    );
    expect(await recoverMessageAddress({ message: { raw: digest }, signature: sig })).toBe(
      privateKeyToAccount(ATTESTOR_KEY).address,
    );
  });

  it("normalises a decimal nullifier to bytes32", async () => {
    const { app } = setup();
    const ctx = await rpContext(app);
    const res = await post(app, { ...proof(ctx.nonce, critic, "255"), critic });
    expect(res.json().nullifier).toBe(`0x${"00".repeat(31)}ff`);
  });

  it("expired: a request past its rp_context expiry is refused and never reaches World", async () => {
    const { app, clock, verified } = setup();
    const ctx = await rpContext(app);
    clock.now = ctx.expires_at + 1;
    const res = await post(app, { ...proof(ctx.nonce), critic });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ reason: "expired" });
    expect(verified).toHaveLength(0);
  });

  it("expired and cancelled: client-reported failures are 403s with a reason and no voucher", async () => {
    const { app } = setup();
    for (const [error, reason] of [
      ["timeout", "expired"],
      ["rp_signature_expired", "expired"],
      ["cancelled", "cancelled"],
      ["user_rejected", "cancelled"],
    ] as const) {
      const res = await post(app, { error, critic });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ reason });
    }
  });

  it("unverified: World rejecting the proof is a 403 and signs nothing", async () => {
    const { app } = setup({ verify: async () => ({ ok: false, code: "all_verifications_failed" }) });
    const ctx = await rpContext(app);
    const res = await post(app, { ...proof(ctx.nonce), critic });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ reason: "unverified" });
    expect(res.json().sig).toBeUndefined();
  });

  it("unverified: a World outage never authorises", async () => {
    const { app } = setup({
      verify: async () => {
        throw new Error("network down");
      },
    });
    const ctx = await rpContext(app);
    const res = await post(app, { ...proof(ctx.nonce), critic });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ reason: "unverified" });
  });

  it("duplicate human: a second critic with the same nullifier is refused", async () => {
    const { app } = setup();
    const first = await post(app, { ...proof((await rpContext(app)).nonce), critic });
    expect(first.statusCode).toBe(200);
    const second = await post(app, { ...proof((await rpContext(app)).nonce, otherCritic), critic: otherCritic });
    expect(second.statusCode).toBe(403);
    expect(second.json()).toMatchObject({ reason: "duplicate_human" });
  });

  it("tampered payload: wrong action, environment, unknown nonce, swapped critic or junk are all refused before World", async () => {
    const { app, verified } = setup();
    const ctx = await rpContext(app);
    const good = proof(ctx.nonce);
    const cases: unknown[] = [
      { ...good, action: "other-action", critic },
      { ...good, environment: "production", critic },
      { ...proof("0xdeadbeef"), critic },
      { ...good, critic: otherCritic }, // proof was bound to a different wallet
      { ...good, critic: "not-an-address" },
      { ...good, responses: [], critic },
      { critic },
      "junk",
    ];
    for (const body of cases) {
      const res = await post(app, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(403);
      expect(res.json()).toMatchObject({ reason: "tampered_payload" });
    }
    expect(verified).toHaveLength(0);
  });

  it("a nonce is single use", async () => {
    const { app } = setup();
    const ctx = await rpContext(app);
    expect((await post(app, { ...proof(ctx.nonce), critic })).statusCode).toBe(200);
    const again = await post(app, { ...proof(ctx.nonce, otherCritic, "0x2"), critic: otherCritic });
    expect(again.statusCode).toBe(403);
  });

  it("rp-context is signed server-side and never carries a secret", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/world/rp-context" });
    const text = res.body;
    expect(res.json()).toMatchObject({ rp_id: "rp_test" });
    expect(res.json().signature).toMatch(/^0x[0-9a-f]{130}$/);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    const denied = await post(app, "junk");
    for (const secret of SECRETS) expect(denied.body).not.toContain(secret);
  });
});
