import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoServices, serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { suiteHash } from "../packages/shared/src/index";
import { listDemoServices } from "../scripts/demo/list-services";

const serve =
  (name: string): ServiceStarter =>
  async () => {
    const service = serviceByName(name);
    if (!service) throw new Error(`Unknown demo service ${name}`);
    const { server, url } = await startService(service, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

async function accounts(url: string): Promise<`0x${string}`[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_accounts", params: [] }),
  });
  return ((await res.json()) as { result: `0x${string}`[] }).result;
}

describe("five services listed", () => {
  let stack: Stack;
  const names = demoServices.map((s) => s.name);

  beforeAll(async () => {
    stack = await startStack({ services: Object.fromEntries(names.map((n) => [n, serve(n)])) });
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  it("the seed lists all five and the API returns each with its suite hash", async () => {
    const [, seller] = await accounts(stack.rpcUrl);
    const listed = await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller,
      origins: Object.fromEntries(names.map((n) => [n, stack.services[n]])),
    });
    expect(listed.map((l) => l.name)).toEqual(names);
    expect(names).toHaveLength(5);

    const services = (await (await fetch(`${stack.apiUrl}/services`)).json()) as { id: number; name: string }[];
    expect(services.map((s) => s.name).sort()).toEqual([...names].sort());
    for (const { id, name } of services) {
      const suite = await (await fetch(`${stack.apiUrl}/services/${id}/suite`)).json();
      expect(suiteHash(suite), name).toBe(serviceByName(name)?.specHash);
    }
  });
});
