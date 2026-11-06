import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { type ServiceStarter, startStack } from "../src/index";

const echoService: ServiceStarter = async () => {
  const server = createServer((_req, res) => res.end(JSON.stringify({ ok: true })));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
};

async function isListening(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

describe("harness boots", () => {
  it("boots chain, contracts, API and services, then tears everything down", async () => {
    const stack = await startStack({ services: { echo: echoService } });
    const urls = [stack.rpcUrl, stack.apiUrl, stack.services.echo];

    const health = await fetch(`${stack.apiUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, chainId: stack.chainId });
    expect(stack.chainId).toBe(31337);
    expect(await (await fetch(stack.services.echo)).json()).toEqual({ ok: true });

    await stack.stop();
    for (const url of urls) expect(await isListening(url)).toBe(false);
  });

  it("starts from a fresh chain on a second boot", async () => {
    const stack = await startStack();
    try {
      const res = await fetch(stack.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      expect(((await res.json()) as { result: string }).result).toBe("0x0");
    } finally {
      await stack.stop();
    }
  });
});
