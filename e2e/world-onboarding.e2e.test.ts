import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OnboardingView } from "../apps/web/components/critic-onboarding";
import { type OnboardDeps, onboardCritic, type RpContext, type WorldCompletion } from "../apps/web/lib/onboard";
import { criticRegistryAbi } from "../packages/shared/abi/CriticRegistry";

// React and IDKit live in the web and api apps' dependencies, not the repo root's.
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");
const { hashSignal } = webRequire("@worldcoin/idkit-core") as typeof import("@worldcoin/idkit-core");
const { createWalletClient, http, createPublicClient } = webRequire("viem") as typeof import("viem");

// Hardhat's well-known dev account #9: the local attestor deployLocal trusts. A test fixture, never a product value.
const LOCAL_ATTESTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
// Test-only World signing key; the real one is never loaded here. Proofs are mocked, as the event provides.
const TEST_SIGNING_KEY = `0x${"0c".repeat(32)}`;
const HUMAN_A = "0x1e1c0c2bcdf61aa3c3cb7c1306f0fdebef3971b2cec64bd2c7b11d4482490554";

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
  let skewSecs = 0;
  let accounts: `0x${string}`[];

  beforeAll(async () => {
    stack = await startStack({
      api: {
        world: {
          rpId: "rp_test",
          signingKey: TEST_SIGNING_KEY,
          environment: "staging",
          attestorKey: LOCAL_ATTESTOR_KEY,
          now: () => Math.floor(Date.now() / 1000) + skewSecs,
          // Mocked World: a proof is valid unless its first element says otherwise.
          verify: async (body) =>
            body.responses[0]?.proof[0] === "0xbad" ? { ok: false, code: "all_verifications_failed" } : { ok: true },
        },
      },
    });
    accounts = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  const post = async (path: string, body?: object) => {
    const res = await fetch(`${stack.apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  function journey(
    critic: `0x${string}`,
    world: (rp: RpContext) => WorldCompletion | Promise<WorldCompletion>,
    tweak: Partial<OnboardDeps> = {},
  ) {
    const registrations: string[] = [];
    const deps: OnboardDeps = {
      critic: critic.toLowerCase(),
      rpContext: async () => (await post("/world/rp-context")).body as RpContext,
      startWorld: (rp) => ({ connectorURI: "https://world.org/mock", complete: async () => world(rp) }),
      verify: (body) => post("/world/verify", body),
      register: async (voucher) => {
        const transport = http(stack.rpcUrl);
        const wallet = createWalletClient({ account: critic, transport });
        const client = createPublicClient({ transport });
        const hash = await wallet.writeContract({
          address: stack.contracts.CriticRegistry as `0x${string}`,
          abi: criticRegistryAbi,
          functionName: "registerCritic",
          args: [voucher.nullifier as `0x${string}`, BigInt(voucher.expiry), voucher.sig as `0x${string}`],
          value: await client.readContract({
            address: stack.contracts.CriticRegistry as `0x${string}`,
            abi: criticRegistryAbi,
            functionName: "minStake",
          }),
          chain: null,
        });
        await client.waitForTransactionReceipt({ hash });
        registrations.push(hash);
        return hash;
      },
      ...tweak,
    };
    return { deps, registrations };
  }

  const proofFor = (
    rp: RpContext,
    critic: string,
    over: Record<string, unknown> = {},
    proof0 = "0x1",
  ): WorldCompletion => ({
    success: true,
    result: {
      protocol_version: "4.0",
      nonce: rp.nonce,
      action: "register-critic",
      environment: "staging",
      responses: [
        {
          identifier: "proof_of_human",
          issuer_schema_id: 1,
          nullifier: HUMAN_A,
          proof: [proof0, "0x2", "0x3", "0x4", "0x5"],
          expires_at_min: 1_900_000_000,
          signal_hash: hashSignal(critic.toLowerCase()),
        },
      ],
      ...over,
    },
  });

  async function chainState(critic: string) {
    return {
      block: await rpc<string>(stack.rpcUrl, "eth_blockNumber"),
      nonce: await rpc<string>(stack.rpcUrl, "eth_getTransactionCount", [critic, "latest"]),
      critics: await (await fetch(`${stack.apiUrl}/critics`)).json(),
    };
  }

  it("a verified human registers a critic with the server's voucher", async () => {
    const critic = accounts[2] as `0x${string}`;
    const { deps, registrations } = journey(critic, (rp) => proofFor(rp, critic));
    const outcome = await onboardCritic(deps);
    expect(outcome).toMatchObject({ status: "registered", nullifier: HUMAN_A });
    expect(registrations).toHaveLength(1);
    const critics = await (await fetch(`${stack.apiUrl}/critics`)).json();
    expect(critics).toHaveLength(1);
    expect(critics[0]).toMatchObject({ nullifier: HUMAN_A });
    expect(critics[0].address.toLowerCase()).toBe(critic.toLowerCase());
  });

  describe("denied paths: a 403 with a reason, and no registration transaction is sent", () => {
    const cases: Array<{
      name: string;
      reason: string;
      who: number;
      world: (rp: RpContext, critic: `0x${string}`) => WorldCompletion;
      before?: () => void;
      after?: () => void;
    }> = [
      {
        name: "unverified",
        reason: "unverified",
        who: 3,
        world: (rp, c) => proofFor(rp, c, {}, "0xbad"),
      },
      {
        name: "cancelled",
        reason: "cancelled",
        who: 4,
        world: () => ({ success: false, error: "cancelled" }),
      },
      {
        name: "expired",
        reason: "expired",
        who: 5,
        world: (rp, c) => {
          skewSecs = 10_000;
          return proofFor(rp, c);
        },
        after: () => {
          skewSecs = 0;
        },
      },
      {
        name: "duplicate human",
        reason: "duplicate_human",
        who: 6,
        // HUMAN_A already registered a critic in the first test.
        world: (rp, c) => proofFor(rp, c),
      },
      {
        name: "tampered payload",
        reason: "tampered_payload",
        who: 7,
        world: (rp, c) => proofFor(rp, c, { action: "something-else" }),
      },
    ];

    for (const scenario of cases) {
      it(scenario.name, async () => {
        const critic = accounts[scenario.who] as `0x${string}`;
        const before = await chainState(critic);
        const { deps, registrations } = journey(critic, (rp) => scenario.world(rp, critic));
        const outcome = await onboardCritic(deps);
        scenario.after?.();
        expect(outcome).toMatchObject({ status: "denied", reason: scenario.reason });
        expect(registrations).toHaveLength(0);
        expect(await chainState(critic)).toEqual(before);

        const html = renderToString(createElement(OnboardingView, { state: outcome }));
        expect(html).toContain('role="alert"');
        expect(html).toContain(outcome.status === "denied" ? outcome.message : "never");
      });
    }

    it("a client that skips the page and posts straight to the server still gets no voucher", async () => {
      const critic = accounts[8] as `0x${string}`;
      const before = await chainState(critic);
      const forged = await post("/world/verify", { critic, nonce: "0xforged", responses: [] });
      expect(forged.status).toBe(403);
      expect(forged.body).toEqual({ reason: "tampered_payload" });
      expect(await chainState(critic)).toEqual(before);
    });
  });
});
