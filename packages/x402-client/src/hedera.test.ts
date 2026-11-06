import { createServer, type Server } from "node:http";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHederaPayAndCall, PaymentPolicyError, settledTxId } from "./index";

const signer = { accountId: "0.0.11334607", privateKey: `0x${"11".repeat(32)}` };
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function paywall(amount: string) {
  const seen = { paid: 0, total: 0 };
  const server = createServer((req, res) => {
    seen.total++;
    if (req.headers["payment-signature"]) seen.paid++;
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/call`;
    res.writeHead(402, {
      "content-type": "application/json",
      "payment-required": encodePaymentRequiredHeader({
        x402Version: 2,
        resource: { url },
        accepts: [
          {
            scheme: "exact",
            network: "hedera:testnet",
            amount,
            asset: "0.0.0",
            payTo: "0.0.11334361",
            maxTimeoutSeconds: 180,
            extra: { feePayer: "0.0.9185802" },
          },
        ],
      }),
    });
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/call`, seen };
}

describe("hedera payAndCall", () => {
  it("a denying onBeforePay prevents any payment", async () => {
    const { url, seen } = await paywall("100");
    const onBeforePay = vi.fn(async () => false);
    const call = createHederaPayAndCall({ onBeforePay });
    await expect(call({ url, body: {}, maxPrice: "1000", signer })).rejects.toBeInstanceOf(PaymentPolicyError);
    expect(onBeforePay).toHaveBeenCalledWith("100", "0.0.11334361");
    expect(seen).toEqual({ paid: 0, total: 1 });
  });

  it("refuses a price above maxPrice before asking the hook or paying", async () => {
    const { url, seen } = await paywall("1001");
    const onBeforePay = vi.fn(async () => true);
    const call = createHederaPayAndCall({ onBeforePay });
    await expect(call({ url, body: {}, maxPrice: "1000", signer })).rejects.toThrow("Price exceeds maxPrice");
    expect(onBeforePay).not.toHaveBeenCalled();
    expect(seen).toEqual({ paid: 0, total: 1 });
  });

  it("rejects a signer that is not a Hedera account + key", async () => {
    const { url } = await paywall("1");
    const call = createHederaPayAndCall({});
    await expect(call({ url, body: {}, maxPrice: "1", signer: {} })).rejects.toThrow(/signer/i);
  });
});

describe("settledTxId", () => {
  const header = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64");
  it("reads the settled tx id from PAYMENT-RESPONSE", () => {
    const h = new Headers({
      "payment-response": header({ success: true, transaction: "0.0.9185802@1793949293.996636002" }),
    });
    expect(settledTxId(h)).toBe("0.0.9185802@1793949293.996636002");
  });
  it("is null for a free response and for a failed settlement", () => {
    expect(settledTxId(new Headers())).toBeNull();
    expect(settledTxId(new Headers({ "payment-response": header({ success: false, transaction: "x" }) }))).toBeNull();
  });
});
