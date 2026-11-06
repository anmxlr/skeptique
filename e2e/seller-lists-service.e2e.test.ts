import { createRequire } from "node:module";
import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { MarketplaceView } from "../apps/web/components/marketplace";
import { DEFAULT_ROUND_CONFIG, ServiceViewSchema, suiteHash } from "../packages/shared/src/index";
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

describe("seller lists a service", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack({ services: { "unit-convert": serve("unit-convert") } });
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  it("the seed lists unit-convert, the API returns it with a matching hash, the page renders it in probation", async () => {
    const [, seller] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    const listed = await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller,
      origins: { "unit-convert": stack.services["unit-convert"] },
    });
    expect(listed).toEqual([{ name: "unit-convert", serviceId: 1 }]);

    const services = await (await fetch(`${stack.apiUrl}/services`)).json();
    expect(services).toHaveLength(1);
    const [service] = services;
    ServiceViewSchema.parse(service);
    const minFeeTinybars = BigInt(DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE) * 10n ** 8n;
    expect(service).toMatchObject({
      id: 1,
      name: "unit-convert",
      category: "conversion",
      endpoint: `${stack.services["unit-convert"]}/call`,
      median: null,
      nRounds: 0,
      bounty: minFeeTinybars.toString(),
    });
    expect(service.seller.toLowerCase()).toBe(seller.toLowerCase());

    const detail = await fetch(`${stack.apiUrl}/services/1`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(service);

    const suite = await fetch(`${stack.apiUrl}/services/1/suite`);
    expect(suite.status).toBe(200);
    expect(suiteHash(await suite.json())).toBe(service.specHash);

    const html = renderToString(createElement(MarketplaceView, { state: { status: "ready", services } }));
    expect(html).toContain("unit-convert");
    expect(html).toContain("Probation");
    expect(html).toContain(`${DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE} HBAR`);
  });
});
