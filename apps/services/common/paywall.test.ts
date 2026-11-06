import { createServer, type Server } from "node:http";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { afterEach, describe, expect, it } from "vitest";
import { handleUnitConvert, unitConvertSuite } from "../unit-convert/src/index";
import { createPaywall } from "./paywall";
import { defineService, startService } from "./server";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function fakeFacilitator() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        kinds: [{ x402Version: 2, scheme: "exact", network: "hedera:testnet", extra: { feePayer: "0.0.9185802" } }],
        extensions: [],
        signers: { "hedera:*": ["0.0.9185802"] },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

const service = () => defineService("unit-convert", unitConvertSuite, handleUnitConvert);
const callInit = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(unitConvertSuite.cases[0]!.input),
};

describe("service paywall", () => {
  it("answers an unpaid /call with 402 at the listed price, payable to the seller", async () => {
    const paywall = await createPaywall({
      facilitatorUrl: await fakeFacilitator(),
      payTo: "0.0.11334361",
      price: "100000",
    });
    const running = await startService(service(), 0, "127.0.0.1", { paywall });
    servers.push(running.server);
    const res = await fetch(`${running.url}/call`, callInit);
    expect(res.status).toBe(402);
    const required = decodePaymentRequiredHeader(res.headers.get("payment-required")!);
    expect(required.accepts[0]).toMatchObject({
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "100000",
      payTo: "0.0.11334361",
    });
  });

  it("keeps health and suite free", async () => {
    const paywall = await createPaywall({ facilitatorUrl: await fakeFacilitator(), payTo: "0.0.11334361", price: "1" });
    const running = await startService(service(), 0, "127.0.0.1", { paywall });
    servers.push(running.server);
    expect((await fetch(`${running.url}/health`)).status).toBe(200);
    expect((await fetch(`${running.url}/suite.json`)).status).toBe(200);
  });

  it("local mode (no paywall) still serves /call free", async () => {
    const running = await startService(service());
    servers.push(running.server);
    expect((await fetch(`${running.url}/call`, callInit)).status).toBe(200);
  });
});
