import { createRequire } from "node:module";
import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { ServiceDetailView } from "../apps/web/components/service-detail";
import { ListingError, type ListingForm, listService } from "../apps/web/lib/sell";
import { serviceRegistryAbi } from "../packages/shared/abi/ServiceRegistry";
import { DEFAULT_ROUND_CONFIG, suiteHash } from "../packages/shared/src/index";

const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { encodeFunctionData } = webRequire("viem") as typeof import("viem");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");

const serve =
  (name: string): ServiceStarter =>
  async () => {
    const service = serviceByName(name);
    if (!service) throw new Error(`Unknown demo service ${name}`);
    const { server, url } = await startService(service, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

/** An EIP-1193 wallet over the local chain's unlocked accounts. */
const wallet = (rpcUrl: string, onSend: () => void = () => {}): Provider => ({
  async request({ method, params }) {
    if (method === "eth_requestAccounts") return rpc(rpcUrl, "eth_accounts");
    if (method === "eth_sendTransaction") onSend();
    return rpc(rpcUrl, method, params ?? []);
  },
});

/** A wallet whose user declines every transaction, as MetaMask reports it. */
const decliningWallet = (rpcUrl: string): Provider => ({
  async request({ method, params }) {
    if (method === "eth_sendTransaction") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
    if (method === "eth_requestAccounts") return rpc(rpcUrl, "eth_accounts");
    return rpc(rpcUrl, method, params ?? []);
  },
});

describe("seller lists from the web form", () => {
  let stack: Stack;
  let form: ListingForm;
  let registry: `0x${string}`;

  const serviceCount = async () =>
    BigInt(
      await rpc<string>(stack.rpcUrl, "eth_call", [
        { to: registry, data: encodeFunctionData({ abi: serviceRegistryAbi, functionName: "serviceCount" }) },
        "latest",
      ]),
    );
  const blockNumber = () => rpc<string>(stack.rpcUrl, "eth_blockNumber");

  beforeAll(async () => {
    stack = await startStack({ services: { "unit-convert": serve("unit-convert") } });
    registry = stack.contracts.ServiceRegistry as `0x${string}`;
    const origin = stack.services["unit-convert"];
    form = {
      name: "unit-convert",
      category: "conversion",
      endpoint: `${origin}/call`,
      price: "0.00000001",
      suiteUrl: `${origin}/suite.json`,
      fee: String(DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE),
    };
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  it("refuses a fee below the minimum before any transaction", async () => {
    let sent = 0;
    const before = await blockNumber();
    const error = await listService({
      provider: wallet(stack.rpcUrl, () => sent++),
      registry,
      form: { ...form, fee: "0.5" },
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ListingError);
    expect(error.kind).toBe("invalid");
    expect(error.message).toContain(`${DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE}`);
    expect(sent).toBe(0);
    expect(await blockNumber()).toBe(before);
  });

  it("shows a bad suite URL as an error before any transaction", async () => {
    let sent = 0;
    const error = await listService({
      provider: wallet(stack.rpcUrl, () => sent++),
      registry,
      form: { ...form, suiteUrl: `${stack.services["unit-convert"]}/nope.json` },
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ListingError);
    expect(error.kind).toBe("suite");
    expect(sent).toBe(0);
  });

  it("leaves no listing when the wallet rejects the transaction, and says why", async () => {
    const error = await listService({ provider: decliningWallet(stack.rpcUrl), registry, form }).catch((e) => e);
    expect(error).toBeInstanceOf(ListingError);
    expect(error.kind).toBe("rejected");
    expect(error.message).toContain("rejected");
    expect(await serviceCount()).toBe(0n);
    const services = await (await fetch(`${stack.apiUrl}/services`)).json();
    expect(services).toEqual([]);
  });

  it("previews the suite hash, lists from the seller's wallet, and the service page shows the bounty and a pending ENS name", async () => {
    const [, seller] = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    const suite = await (await fetch(form.suiteUrl)).json();
    const listed = await listService({ provider: wallet(stack.rpcUrl), registry, form });
    expect(listed.specHash).toBe(suiteHash(suite));
    expect(listed.serviceId).toBe(1);

    const service = await (await fetch(`${stack.apiUrl}/services/${listed.serviceId}`)).json();
    expect(service).toMatchObject({ id: 1, name: "unit-convert", specHash: listed.specHash, ensName: "" });
    expect(service.seller.toLowerCase()).toBe(seller.toLowerCase());

    const html = renderToString(createElement(ServiceDetailView, { state: { status: "ready", service } }));
    expect(html).toContain("unit-convert");
    expect(html).toContain(`${DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE} HBAR`);
    expect(html).toContain("Pending");
  });
});
