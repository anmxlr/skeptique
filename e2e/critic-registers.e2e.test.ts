import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CriticsView } from "../apps/web/components/critics";
import { DEFAULT_ROUND_CONFIG } from "../packages/shared/src/index";
import { registerDemoCritic } from "../scripts/demo/register-critic";

// React lives in the web app's dependencies, not the repo root's.
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");

// Hardhat's well-known dev account #9: the local attestor deployLocal trusts. A test fixture, never a product value.
const LOCAL_ATTESTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const nullifier = `0x${"ab".repeat(32)}` as const;

async function rpc<T>(url: string, method: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });
  return ((await res.json()) as { result: T }).result;
}

describe("critic registers", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  it("the seed registers a critic with a voucher and stake, the API lists it, the page shows its stake", async () => {
    expect(await (await fetch(`${stack.apiUrl}/critics`)).json()).toEqual([]);

    const [, , critic] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    await registerDemoCritic({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
      critic,
      nullifier,
      attestorKey: LOCAL_ATTESTOR_KEY,
    });

    const stake = (BigInt(DEFAULT_ROUND_CONFIG.S_MIN) * 10n ** 8n).toString();
    const critics = await (await fetch(`${stack.apiUrl}/critics`)).json();
    expect(critics).toHaveLength(1);
    expect(critics[0]).toMatchObject({ nullifier, stake });
    expect(critics[0].address.toLowerCase()).toBe(critic.toLowerCase());

    const detail = await fetch(`${stack.apiUrl}/critics/${critic.toUpperCase().replace("0X", "0x")}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(critics[0]);
    expect((await fetch(`${stack.apiUrl}/critics/0x${"00".repeat(20)}`)).status).toBe(404);
    expect((await fetch(`${stack.apiUrl}/critics/not-an-address`)).status).toBe(404);

    const html = renderToString(createElement(CriticsView, { state: { status: "ready", critics } }));
    expect(html).toContain(`${DEFAULT_ROUND_CONFIG.S_MIN} HBAR`);
    expect(html).toContain(critics[0].address);
  });
});
