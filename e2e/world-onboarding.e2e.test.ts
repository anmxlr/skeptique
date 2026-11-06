import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Onboarding, registerWithWorld } from "../apps/critic/src/onboard";

// World's packages live in the API's dependencies, not the repo root's.
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { hashSignal } = apiRequire("@worldcoin/idkit-core/hashing") as typeof import("@worldcoin/idkit-core/hashing");
const { signRequest } = apiRequire("@worldcoin/idkit-server") as typeof import("@worldcoin/idkit-server");

// Test fixtures, never product values: Hardhat's dev account #9 is the attestor deployLocal trusts, and the
// World nullifier below stands for one staging (simulator) identity.
const LOCAL_ATTESTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const HUMAN = `0x${"0c".repeat(32)}`;
const ACTION = "register-critic";

/** A staging IDKit 4.0 result proving `critic` as the signal (shape from spec/notes/world.md). */
const idkitResult = (nonce: string, critic: string) => ({
  protocol_version: "4.0",
  nonce,
  action: ACTION,
  environment: "staging",
  responses: [
    {
      identifier: "proof_of_human",
      issuer_schema_id: 1,
      nullifier: HUMAN,
      proof: ["mock", "1", "2", "3", "4"],
      expires_at_min: 1_900_000_000,
      signal_hash: hashSignal(critic.toLowerCase()),
    },
  ],
});

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await res.json()) as { result: T }).result;
}

describe("world onboarding", () => {
  let stack: Stack;
  let clock = Date.now();

  beforeAll(async () => {
    stack = await startStack({
      api: {
        world: {
          rpId: "rp_local",
          action: ACTION,
          environment: "staging",
          signRequest: (action) => signRequest({ signingKeyHex: randomBytes(32).toString("hex"), action }),
          // Local stand-in for World's verify API: accepts the mocked staging proof, rejects any altered one.
          verifyProof: async (result) => {
            const proof = (result as ReturnType<typeof idkitResult>).responses[0]?.proof;
            return proof?.[0] === "mock" ? { success: true } : { success: false, code: "all_verifications_failed" };
          },
          attestorKey: LOCAL_ATTESTOR_KEY,
          now: () => clock,
        },
      },
    });
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  const nonce = async () =>
    ((await (await fetch(`${stack.apiUrl}/world/rp-context`, { method: "POST" })).json()) as { nonce: string }).nonce;
  const critics = async () => (await (await fetch(`${stack.apiUrl}/critics`)).json()) as { address: string }[];
  const txCount = async (address: string) =>
    BigInt(await rpc<string>(stack.rpcUrl, "eth_getTransactionCount", [address, "latest"]));

  /** Runs the critic's onboarding and reports how many transactions it sent. */
  const onboard = async (critic: `0x${string}`, result: object): Promise<{ outcome: Onboarding; sent: bigint }> => {
    const before = await txCount(critic);
    const outcome = await registerWithWorld({
      apiUrl: stack.apiUrl,
      result,
      critic,
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
    });
    return { outcome, sent: (await txCount(critic)) - before };
  };

  const expectDenied = async (critic: `0x${string}`, result: object, reason: string) => {
    const { outcome, sent } = await onboard(critic, result);
    expect(outcome).toMatchObject({ status: "denied", reason });
    expect(sent).toBe(0n);
  };

  it("registers a verified human's critic and blocks every denied path without a registration tx", async () => {
    const [, , alice, bob] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");

    await expectDenied(alice, {}, "unverified");
    await expectDenied(alice, { success: false, error: "user_rejected" }, "cancelled");
    const stale = await nonce();
    clock += 301_000;
    await expectDenied(alice, idkitResult(stale, alice), "expired");
    const altered = idkitResult(await nonce(), alice);
    altered.responses[0]!.proof[0] = "altered";
    await expectDenied(alice, altered, "invalid_proof");
    await expectDenied(bob, idkitResult(await nonce(), alice), "wrong_signal");
    expect(await critics()).toEqual([]);

    const { outcome, sent } = await onboard(alice, idkitResult(await nonce(), alice));
    expect(outcome).toMatchObject({ status: "registered", nullifier: HUMAN });
    expect(sent).toBe(1n);
    expect((await critics()).map((c) => c.address.toLowerCase())).toEqual([alice.toLowerCase()]);

    await expectDenied(bob, idkitResult(await nonce(), bob), "duplicate_human");
    expect(await critics()).toHaveLength(1);
  });
});
