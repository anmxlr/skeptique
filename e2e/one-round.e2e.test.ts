import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRoundAgent, FileRoundStateStore } from "../apps/critic/src/round-agent";
import { createViemRoundContract } from "../apps/critic/src/round-chain";
import { fetchAndRunCriticSuite, publishCriticEvidence } from "../apps/critic/src/runner";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { ServiceDetailView } from "../apps/web/components/service-detail";
import { type RoundView, RoundViewSchema } from "../packages/shared/src/index";
import { createLocalPayAndCall } from "../packages/x402-client/src/index";
import { finalizeRound } from "../scripts/demo/finalize-round";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");

// Hardhat's well-known dev account #9: the local attestor deployLocal trusts. A test fixture, never a product value.
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

describe("one round end to end", () => {
  let stack: Stack;
  let stateDir: string;

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "skeptique-e2e-round-"));
    stack = await startStack({ services: { "unit-convert": serve("unit-convert") } });
  }, 240_000);

  afterAll(async () => {
    await stack?.stop();
    if (stateDir) await rm(stateDir, { recursive: true, force: true });
  });

  it("a listing opens round 1, the critic commits and reveals after a restart, anyone finalises, the score shows", async () => {
    const [, seller, critic, anyone] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    const warp = async (seconds: number) => {
      await rpc(stack.rpcUrl, "evm_increaseTime", [seconds]);
      await rpc(stack.rpcUrl, "evm_mine");
    };
    await registerDemoCritic({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
      critic,
      nullifier: `0x${"ab".repeat(32)}`,
      attestorKey: LOCAL_ATTESTOR_KEY,
    });
    await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller,
      origins: { "unit-convert": stack.services["unit-convert"] },
    });

    // The listing opened round 1: the service is in probation, in its commit phase.
    const opened = RoundViewSchema.parse(await (await fetch(`${stack.apiUrl}/rounds/1`)).json());
    expect(opened).toMatchObject({ id: 1, serviceId: 1, phase: "commit", median: null, committed: [], reveals: [] });
    expect((await (await fetch(`${stack.apiUrl}/services/1`)).json()).median).toBeNull();

    // The critic finds the open round, tests the service, publishes its evidence and commits.
    const [round] = (await (await fetch(`${stack.apiUrl}/services/1/rounds`)).json()) as RoundView[];
    const service = await (await fetch(`${stack.apiUrl}/services/1`)).json();
    const { evidence } = await fetchAndRunCriticSuite({
      suiteUrl: `${stack.apiUrl}/services/1/suite`,
      specHash: service.specHash,
      roundId: round.id,
      critic,
      endpoint: service.endpoint,
      maxPrice: service.pricePerCall,
      signer: {},
      judge: async () => true,
      model: "fixed-judge",
      payAndCall: createLocalPayAndCall({ priceFor: async () => service.pricePerCall }),
    });
    const evidenceHash = (await publishCriticEvidence({ evidence, url: `${stack.apiUrl}/evidence` })) as `0x${string}`;
    const contract = createViemRoundContract({
      rpcUrl: stack.rpcUrl,
      address: stack.contracts.RoundManager,
      account: critic,
    });
    const statePath = join(stateDir, "critic-state.json");
    await createRoundAgent({ critic, contract, store: new FileRoundStateStore(statePath) }).commit({
      roundId: round.id,
      score: evidence.score,
      evidenceHash,
      claimedCost: evidence.claimedCost,
    });
    const committed: string[] = (await (await fetch(`${stack.apiUrl}/rounds/1`)).json()).committed;
    expect(committed.map((address) => address.toLowerCase())).toEqual([critic.toLowerCase()]);

    // The critic process dies after committing; a fresh one reveals from its saved salt and score.
    await warp(91);
    await createRoundAgent({ critic, contract, store: new FileRoundStateStore(statePath) }).reveal(round.id);
    const revealing = await (await fetch(`${stack.apiUrl}/rounds/1`)).json();
    expect(revealing.reveals).toMatchObject([{ score: evidence.score, honest: null }]);
    expect(revealing.reveals[0].critic.toLowerCase()).toBe(critic.toLowerCase());

    // Anyone finalises once the reveal window has closed.
    await warp(46);
    await finalizeRound({ rpcUrl: stack.rpcUrl, manager: stack.contracts.RoundManager, caller: anyone, roundId: 1 });

    const finalized = RoundViewSchema.parse(await (await fetch(`${stack.apiUrl}/rounds/1`)).json());
    expect(finalized).toMatchObject({ phase: "finalized", median: evidence.score });
    expect(finalized.reveals).toMatchObject([{ score: evidence.score, honest: true }]);

    const listed = await (await fetch(`${stack.apiUrl}/services`)).json();
    expect(listed[0]).toMatchObject({ id: 1, median: evidence.score, nRounds: 1 });

    const rounds = await (await fetch(`${stack.apiUrl}/services/1/rounds`)).json();
    const html = renderToString(
      createElement(ServiceDetailView, { state: { status: "ready", service: listed[0], rounds } }),
    );
    expect(html).toContain(`Score ${evidence.score}`);
    expect(html).toContain("Round timeline");
    expect(html).toContain("Round 1: Finalised");
    expect(html).toContain("committed and revealed");
  });
});
