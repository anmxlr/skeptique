import type { SpendLimits } from "@skeptique/shared";
import type { AuditMessage } from "@skeptique/shared/hcs";
import type { PayAndCall } from "@skeptique/x402-client";
import { describe, expect, it, vi } from "vitest";
import { createApprovalClient } from "../src/approvals";
import { createSpendControls } from "../src/spend";

const MERCHANT = "http://127.0.0.1:4001";
const OTHER = "http://127.0.0.1:4002";
const limits = (overrides: Partial<SpendLimits> = {}): SpendLimits => ({
  budget: "100",
  perMerchantCap: "60",
  allowlist: [MERCHANT, OTHER],
  approvalThreshold: "10",
  ...overrides,
});

/** An inner pay function that asks the guard first, as the x402 client does, and settles with a tx id. */
function setup(config: SpendLimits, approve = vi.fn(async (_request: { merchant: string; amount: string }) => true)) {
  const audit = vi.fn(async (_message: AuditMessage) => {});
  const settle = vi.fn();
  const controls = createSpendControls({
    limits: async () => config,
    approve,
    audit,
    payer: "0.0.7",
    now: () => 1_700_000_000_000,
  });
  const payAndCall = controls.wrap(
    (onBeforePay): PayAndCall =>
      async ({ url, maxPrice }) => {
        if (!(await onBeforePay(maxPrice, new URL(url).origin))) throw new Error("Payment denied");
        settle(url, maxPrice);
        return { response: { ok: true }, txId: `0.0.7@${settle.mock.calls.length}`, paid: true };
      },
  );
  const pay = (price: string, merchant = MERCHANT) =>
    payAndCall({ url: `${merchant}/call`, body: {}, maxPrice: price, signer: null });
  return { pay, audit, settle, approve, controls };
}

describe("spend controls", () => {
  it("denies a payment that would exceed the total budget", async () => {
    const { pay, settle } = setup(limits({ budget: "12", perMerchantCap: "100", approvalThreshold: "100" }));
    await pay("8");
    await expect(pay("5")).rejects.toThrow(/denied/);
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("denies a payment that would exceed the per-merchant cap, but not another merchant", async () => {
    const { pay, settle } = setup(limits({ perMerchantCap: "8", approvalThreshold: "100" }));
    await pay("5");
    await expect(pay("5")).rejects.toThrow(/denied/);
    await pay("5", OTHER);
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it("denies a merchant that is not on the allowlist", async () => {
    const { pay, settle } = setup(limits());
    await expect(pay("1", "http://127.0.0.1:9999")).rejects.toThrow(/denied/);
    expect(settle).not.toHaveBeenCalled();
  });

  it("denies everything when the allowlist is empty or no limits are set", async () => {
    const { pay } = setup(limits({ allowlist: [] }));
    await expect(pay("1")).rejects.toThrow(/denied/);
    const closed = createSpendControls({ limits: async () => null, approve: async () => true, audit: async () => {} });
    const payAndCall = closed.wrap(
      (onBeforePay): PayAndCall =>
        async ({ url }) => {
          if (!(await onBeforePay("1", new URL(url).origin))) throw new Error("Payment denied");
          return { response: null, txId: "x", paid: true };
        },
    );
    await expect(payAndCall({ url: `${MERCHANT}/call`, body: {}, maxPrice: "1", signer: null })).rejects.toThrow(
      /denied/,
    );
  });

  it("pays below the threshold with no prompt", async () => {
    const { pay, approve, settle } = setup(limits());
    await pay("10");
    expect(settle).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
  });

  it("pays above the threshold only when a human approves", async () => {
    const yes = setup(
      limits(),
      vi.fn(async () => true),
    );
    await yes.pay("11");
    expect(yes.approve).toHaveBeenCalledWith({ merchant: MERCHANT, amount: "11" });
    expect(yes.settle).toHaveBeenCalledTimes(1);

    const no = setup(
      limits(),
      vi.fn(async () => false),
    );
    await expect(no.pay("11")).rejects.toThrow(/denied/);
    expect(no.settle).not.toHaveBeenCalled();
    expect(no.audit).not.toHaveBeenCalled();
  });

  it("never asks a human about a payment the limits already deny", async () => {
    const { pay, approve } = setup(limits({ budget: "5" }));
    await expect(pay("11")).rejects.toThrow(/denied/);
    expect(approve).not.toHaveBeenCalled();
  });

  it("does not pay when the approval check itself fails", async () => {
    const { pay, settle } = setup(
      limits(),
      vi.fn(async () => {
        throw new Error("api down");
      }),
    );
    await expect(pay("11")).rejects.toThrow(/denied/);
    expect(settle).not.toHaveBeenCalled();
  });

  it("emits exactly one agent_spend per payment, and none for a denied one", async () => {
    const { pay, audit } = setup(limits({ budget: "9", approvalThreshold: "100" }));
    await pay("4");
    await expect(pay("6")).rejects.toThrow(/denied/);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      type: "agent_spend",
      payer: "0.0.7",
      merchant: MERCHANT,
      amount: "4",
      txId: "0.0.7@1",
      ts: 1_700_000_000_000,
    });
  });

  it("frees the reserved budget when the payment fails after approval", async () => {
    const controls = createSpendControls({
      limits: async () => limits({ budget: "5", approvalThreshold: "100" }),
      approve: async () => true,
      audit: async () => {},
    });
    let fail = true;
    const payAndCall = controls.wrap(
      (onBeforePay): PayAndCall =>
        async ({ url, maxPrice }) => {
          await onBeforePay(maxPrice, new URL(url).origin);
          if (fail) throw new Error("service down");
          return { response: null, txId: "t1", paid: true };
        },
    );
    const args = { url: `${MERCHANT}/call`, body: {}, maxPrice: "5", signer: null };
    await expect(payAndCall(args)).rejects.toThrow(/service down/);
    fail = false;
    await expect(payAndCall(args)).resolves.toMatchObject({ paid: true });
  });
});

describe("spend approval client", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const approval = (status: string) => ({
    id: "a1",
    merchant: MERCHANT,
    amount: "11",
    status,
    createdAt: "2026-11-07T00:00:00.000Z",
  });

  it("queues the request and resolves with the human's answer", async () => {
    for (const [final, expected] of [
      ["approved", true],
      ["denied", false],
    ] as const) {
      const answers = [approval("pending"), approval("pending"), approval(final)];
      const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) =>
        init?.method === "POST" ? json(approval("pending"), 201) : json(answers.shift()),
      );
      const client = createApprovalClient({
        apiUrl: "http://api.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: async () => {},
        timeoutMs: 1_000,
      });
      await expect(client({ merchant: MERCHANT, amount: "11" })).resolves.toBe(expected);
    }
  });

  it("treats an unanswered request as denied and withdraws it", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) =>
      init?.method === "POST" ? json(approval("pending"), 201) : json(approval("pending")),
    );
    const client = createApprovalClient({
      apiUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {
        clock += 500;
      },
      now: () => clock,
      timeoutMs: 2_000,
    });
    await expect(client({ merchant: MERCHANT, amount: "11" })).resolves.toBe(false);
    const last = fetchImpl.mock.calls.at(-1);
    expect(String(last?.[0])).toContain("/buyer/approvals/a1/deny");
  });
});
