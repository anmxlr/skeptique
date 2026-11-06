import { createRequire } from "node:module";
import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchAndRunCriticSuite, publishCriticEvidence } from "../apps/critic/src/runner";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { ServiceDetailView } from "../apps/web/components/service-detail";
import { EvidenceSchema } from "../packages/shared/src/index";
import { createLocalPayAndCall } from "../packages/x402-client/src/index";
import { listDemoServices } from "../scripts/demo/list-services";

// React lives in the web app's dependencies, not the repo root's.
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");

const serve =
  (name: string): ServiceStarter =>
  async () => {
    const service = serviceByName(name);
    if (!service) throw new Error(`Unknown demo service ${name}`);
    const { server, url } = await startService(service, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

async function rpc<T>(url: string, method: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });
  return ((await res.json()) as { result: T }).result;
}

describe("critic publishes evidence", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack({ services: { "unit-convert": serve("unit-convert") } });
  }, 240_000);

  afterAll(async () => {
    await stack?.stop();
  });

  it("the critic tests a listed service, the API stores the evidence by hash, the service page shows it", async () => {
    const [, seller, critic] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller,
      origins: { "unit-convert": stack.services["unit-convert"] },
    });
    const service = await (await fetch(`${stack.apiUrl}/services/1`)).json();

    const { evidence, suitePass, errorRate } = await fetchAndRunCriticSuite({
      suiteUrl: `${stack.apiUrl}/services/1/suite`,
      specHash: service.specHash,
      roundId: 1,
      critic,
      endpoint: service.endpoint,
      maxPrice: service.pricePerCall,
      signer: {},
      // The suite carries judge cases; a fixed judge keeps the test off any LLM provider.
      judge: async () => true,
      model: "fixed-judge",
      payAndCall: createLocalPayAndCall({ priceFor: async () => service.pricePerCall }),
    });
    expect(suitePass).toBe(100);
    expect(errorRate).toBe(0);
    expect(evidence.x402Txs).toEqual([]);

    const hash = await publishCriticEvidence({ evidence, url: `${stack.apiUrl}/evidence` });
    const stored = await fetch(`${stack.apiUrl}/evidence/${hash}`);
    expect(stored.status).toBe(200);
    expect(EvidenceSchema.parse(await stored.json())).toEqual(evidence);

    expect((await fetch(`${stack.apiUrl}/evidence/0x${"00".repeat(32)}`)).status).toBe(404);
    const rejected = await fetch(`${stack.apiUrl}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...evidence, score: 101 }),
    });
    expect(rejected.status).toBe(400);

    const html = renderToString(createElement(ServiceDetailView, { state: { status: "ready", service, evidence } }));
    expect(html).toContain("Evidence");
    expect(html).toContain(`${evidence.suite.length} public cases`);
    expect(html).toContain(`${evidence.probes.length} private probes`);
    expect(html).toContain("Public suite");
    expect(html).toContain("Private probes");
    expect(html).toContain(`Review score ${evidence.score}`);
    expect(html).toContain("p95");
  });
});
