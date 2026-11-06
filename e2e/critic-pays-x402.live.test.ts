import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serviceByName } from "../apps/services/catalog";
import { createPaywall } from "../apps/services/common/paywall";
import { startService } from "../apps/services/common/server";
import { hashscanTxUrl } from "../packages/shared/src/index";
import { createHederaPayAndCall } from "../packages/x402-client/src/index";

if (existsSync(".env")) process.loadEnvFile(".env");

const keys = [
  "X402_FACILITATOR_URL",
  "SELLER_ACCOUNT_ID",
  "CRITIC_ACCOUNT_IDS",
  "CRITIC_PRIVATE_KEYS",
  "HEDERA_MIRROR_NODE_URL",
];
const PRICE = "100000"; // tinybars (0.001 HBAR)

// Mirror node REST uses the dashed id: 0.0.x-secs-nanos.
const mirrorId = (txId: string) => txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");

describe.skipIf(keys.some((key) => !process.env[key]))("critic pays via x402", () => {
  it("settles one real HBAR payment on Hedera testnet and the mirror node confirms the transfer", async () => {
    const env = process.env as Record<string, string>;
    const critic = {
      accountId: env.CRITIC_ACCOUNT_IDS!.split(",")[0]!.trim(),
      privateKey: env.CRITIC_PRIVATE_KEYS!.split(",")[0]!.trim(),
    };
    const settledByServer: string[] = [];
    const paywall = await createPaywall({
      facilitatorUrl: env.X402_FACILITATOR_URL!,
      payTo: env.SELLER_ACCOUNT_ID!,
      price: PRICE,
      onSettled: (txId) => settledByServer.push(txId),
    });
    const service = serviceByName("unit-convert")!;
    const running = await startService(service, 0, "127.0.0.1", { paywall });
    try {
      const approvals: Array<[string, string]> = [];
      const payAndCall = createHederaPayAndCall({
        onBeforePay: (price, merchant) => (approvals.push([price, merchant]), true),
      });
      const result = await payAndCall({
        url: `${running.url}/call`,
        body: service.suite.cases[0]!.input,
        maxPrice: PRICE,
        signer: critic,
        criticCall: true,
      });

      expect(result.paid).toBe(true);
      expect(result.txId).toMatch(/^\d+\.\d+\.\d+@\d+\.\d+$/);
      expect(settledByServer).toEqual([result.txId]);
      expect(approvals).toEqual([[PRICE, env.SELLER_ACCOUNT_ID]]);
      const url = hashscanTxUrl(result.txId!);
      console.log(`x402 settled tx id: ${result.txId}\nhashscan: ${url}`);

      let tx: { result: string; name: string; transfers: Array<{ account: string; amount: number }> } | undefined;
      for (let attempt = 0; attempt < 15 && !tx; attempt++) {
        const res = await fetch(`${env.HEDERA_MIRROR_NODE_URL}/api/v1/transactions/${mirrorId(result.txId!)}`);
        if (res.ok) tx = (await res.json()).transactions?.[0];
        else await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      expect(tx, "mirror node has the transaction").toBeDefined();
      console.log(`mirror: ${tx!.name} ${tx!.result}`, JSON.stringify(tx!.transfers));
      expect(tx!.result).toBe("SUCCESS");
      const amountFor = (account: string) => tx!.transfers.find((t) => t.account === account)?.amount;
      expect(amountFor(critic.accountId)).toBe(-Number(PRICE));
      expect(amountFor(env.SELLER_ACCOUNT_ID!)).toBe(Number(PRICE));
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});
