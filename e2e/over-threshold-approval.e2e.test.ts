import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import type { Approval, SpendLimits } from "@skeptique/shared";
import type { AuditMessage } from "@skeptique/shared/hcs";
import { createLocalPayAndCall } from "@skeptique/x402-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApprovalClient } from "../apps/buyer/src/approvals";
import { runBuyer } from "../apps/buyer/src/index";
import { createSpendControls } from "../apps/buyer/src/spend";
import { type DemoService, defineService, startService } from "../apps/services/common/server";
import { handleUnitConvert, unitConvertSuite } from "../apps/services/unit-convert/src/index";

const SELLER = "0x0000000000000000000000000000000000000022";
const TASK = { value: 3, from: "m", to: "cm" };

const serve =
  (service: DemoService): ServiceStarter =>
  async () => {
    const { server, url } = await startService(service, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

describe("over-threshold approval", () => {
  let stack: Stack;
  let calls = 0;
  let origin: string;
  const audits: AuditMessage[] = [];

  beforeAll(async () => {
    const counting = defineService("unit-convert", unitConvertSuite, async (input) => {
      calls += 1;
      return handleUnitConvert(input);
    });
    stack = await startStack({
      services: { "unit-convert": serve(counting) },
      api: {
        marketplace: {
          source: {
            list: () => [
              {
                id: 1,
                name: "unit-convert",
                category: "conversion",
                endpoint: `${stack.services["unit-convert"]}/call`,
                pricePerCall: "20",
                seller: SELLER,
                ensName: "",
                median: 90,
                nReveals: 3,
                nRounds: 1,
                lastRoundAt: new Date().toISOString(),
                popularityCalls: 0,
              },
            ],
          },
          isCritic: () => false,
        },
      },
    });
    origin = new URL(stack.services["unit-convert"] as string).origin;
    const limits: SpendLimits = { budget: "1000", perMerchantCap: "1000", allowlist: [origin], approvalThreshold: "10" };
    const put = await fetch(`${stack.apiUrl}/buyer/limits`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(limits),
    });
    expect(put.status).toBe(200);
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  const human = async (answer: "approve" | "deny") => {
    for (let i = 0; i < 100; i++) {
      const queue = (await (await fetch(`${stack.apiUrl}/buyer/approvals`)).json()) as Approval[];
      const pending = queue.find((item) => item.status === "pending");
      if (pending) {
        await fetch(`${stack.apiUrl}/buyer/approvals/${pending.id}/${answer}`, { method: "POST" });
        return pending;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("no approval was queued");
  };

  const buyerRun = (timeoutMs: number) => {
    const controls = createSpendControls({
      limits: async () => (await (await fetch(`${stack.apiUrl}/buyer/limits`)).json()) as SpendLimits,
      approve: createApprovalClient({ apiUrl: stack.apiUrl, timeoutMs, pollMs: 50 }),
      audit: async (message) => {
        audits.push(message);
      },
      payer: "0.0.7",
    });
    const priceFor = async () => "20";
    const payAndCall = controls.wrap((onBeforePay) => createLocalPayAndCall({ priceFor, onBeforePay }));
    return runBuyer({
      apiUrl: stack.apiUrl,
      category: "conversion",
      task: TASK,
      strategy: "skeptique",
      payAndCall,
      signer: null,
    });
  };

  it("pays only after a human approves, never after a denial or silence", async () => {
    const approving = buyerRun(5_000);
    const queued = await human("approve");
    expect(queued).toMatchObject({ merchant: origin, amount: "20" });
    await expect(approving).resolves.toMatchObject({ response: { result: 300, unit: "cm" } });
    expect(calls).toBe(1);

    const denying = buyerRun(5_000);
    const rejected = expect(denying).rejects.toThrow(/denied/);
    await human("deny");
    await rejected;
    expect(calls).toBe(1);

    await expect(buyerRun(300)).rejects.toThrow(/denied/);
    expect(calls).toBe(1);
    const queue = (await (await fetch(`${stack.apiUrl}/buyer/approvals`)).json()) as Approval[];
    expect(queue.map((item) => item.status)).toEqual(["approved", "denied", "denied"]);
  }, 30_000);
});
