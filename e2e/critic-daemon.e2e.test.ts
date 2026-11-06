import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCriticFromEnv } from "../apps/critic/src/main";
import { recordedProbeCases } from "../apps/critic/src/probe-fixtures";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { type RoundView, RoundViewSchema } from "../packages/shared/src/index";
import { finalizeRound } from "../scripts/demo/finalize-round";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

// Hardhat's well-known dev accounts #2-#4 (critics) and #9 (the attestor deployLocal trusts). Test fixtures only.
const CRITIC_KEYS = [
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as const;
const LOCAL_ATTESTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

const serve =
  (name: string): ServiceStarter =>
  async () => {
    const service = serviceByName(name);
    if (!service) throw new Error(`Unknown demo service ${name}`);
    const { server, url } = await startService(service, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await res.json()) as { result: T }).result;
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string): Promise<T> {
  const stop = Date.now() + 45_000;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > stop) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("critic daemon", () => {
  let stack: Stack;
  let stateDir: string;
  const stoppers: Array<() => void> = [];

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "skeptique-e2e-daemon-"));
    stack = await startStack({ services: { "unit-convert": serve("unit-convert") } });
  }, 240_000);

  afterAll(async () => {
    for (const stop of stoppers) stop();
    await stack?.stop();
    if (stateDir) await rm(stateDir, { recursive: true, force: true });
  });

  it("critic daemon reviews a round: three unattended critics commit and reveal, the test only warps and finalises", async () => {
    const [, seller, ...rest] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    const warp = async (seconds: number) => {
      await rpc(stack.rpcUrl, "evm_increaseTime", [seconds]);
      await rpc(stack.rpcUrl, "evm_mine");
    };
    const critics = rest.slice(0, 3).map((address) => ({ address }));
    const anyone = rest[3];
    for (const [index, account] of critics.entries()) {
      await registerDemoCritic({
        rpcUrl: stack.rpcUrl,
        registry: stack.contracts.CriticRegistry,
        critic: account.address,
        nullifier: `0x${String(index + 1)
          .padStart(2, "0")
          .repeat(32)}`,
        attestorKey: LOCAL_ATTESTOR_KEY,
      });
    }
    await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller,
      origins: { "unit-convert": stack.services["unit-convert"] },
    });

    const deployment = {
      version: 1,
      network: "hedera-testnet",
      chainId: 296,
      deployedAt: new Date().toISOString(),
      deploymentBlock: "0",
      contracts: stack.contracts,
      transactions: [],
      config: {},
    } as never;
    const probeModel = {
      generateProbes: async () => structuredClone(recordedProbeCases),
      judge: async () => true,
    };
    for (const [index, account] of critics.entries()) {
      const { daemon } = await createCriticFromEnv(
        {
          HEDERA_RPC_URL: stack.rpcUrl,
          API_URL: stack.apiUrl,
          CRITIC_PRIVATE_KEY: CRITIC_KEYS[index],
          X402_MODE: "local",
          CRITIC_STATE_PATH: join(stateDir, `${account.address}.json`),
        },
        { loadDeployment: async () => deployment, probeModel, log: () => {} },
      );
      const controller = new AbortController();
      stoppers.push(() => controller.abort());
      void daemon.run(controller.signal, 200);
    }

    const committed = await until(
      async () => (await (await fetch(`${stack.apiUrl}/rounds/1`)).json()).committed as string[],
      (list) => list.length === 3,
      "three commits",
    );
    expect(committed.map((a) => a.toLowerCase()).sort()).toEqual(critics.map((c) => c.address.toLowerCase()).sort());

    await warp(91);
    const revealing = await until(
      async () => (await (await fetch(`${stack.apiUrl}/rounds/1`)).json()) as RoundView,
      (round) => round.reveals.length === 3,
      "three reveals",
    );
    expect(new Set(revealing.reveals.map((r) => r.score)).size).toBe(1);

    await warp(46);
    await finalizeRound({ rpcUrl: stack.rpcUrl, manager: stack.contracts.RoundManager, caller: anyone, roundId: 1 });
    const finalized = RoundViewSchema.parse(await (await fetch(`${stack.apiUrl}/rounds/1`)).json());
    expect(finalized.phase).toBe("finalized");
    expect(finalized.reveals).toHaveLength(3);
    expect(finalized.reveals.every((r) => r.honest === true)).toBe(true);
  });
});
