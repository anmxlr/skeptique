import { describe, expect, it, vi } from "vitest";
import { type OnboardDeps, onboardCritic } from "../lib/onboard";

const critic = "0x00000000000000000000000000000000000000c1";
const rp = { rp_id: "rp_x", nonce: "0x1", created_at: 1, expires_at: 2, signature: "0xsig" };
const voucher = { nullifier: `0x${"ab".repeat(32)}`, expiry: 1_900_000_000, sig: "0xvoucher" };

function deps(overrides: Partial<OnboardDeps> = {}) {
  const register = vi.fn(async () => "0xtx");
  const steps: string[] = [];
  const base: OnboardDeps = {
    critic,
    rpContext: async () => rp,
    startWorld: () => ({
      connectorURI: "https://world.org/verify?x=1",
      complete: async () => ({ success: true, result: { nonce: "0x1", responses: [{ nullifier: "0x9" }] } }),
    }),
    verify: async () => ({ status: 200, body: voucher }),
    register,
    onStep: (step) => steps.push(step),
    ...overrides,
  };
  return { base, register, steps };
}

describe("onboardCritic", () => {
  it("walks start, complete, validate, register and reports the registration", async () => {
    const { base, register, steps } = deps();
    expect(await onboardCritic(base)).toEqual({ status: "registered", txHash: "0xtx", nullifier: voucher.nullifier });
    expect(steps).toEqual(["starting", "awaiting-world", "verifying", "registering"]);
    expect(register).toHaveBeenCalledWith(voucher);
  });

  it("sends the critic address along with the unchanged IDKit result", async () => {
    const verify = vi.fn(async () => ({ status: 200, body: voucher }));
    await onboardCritic(deps({ verify }).base);
    expect(verify).toHaveBeenCalledWith({ nonce: "0x1", responses: [{ nullifier: "0x9" }], critic });
  });

  it.each([["unverified"], ["expired"], ["cancelled"], ["duplicate_human"], ["tampered_payload"]])(
    "a 403 %s is denied with that reason and never registers",
    async (reason) => {
      const { base, register } = deps({ verify: async () => ({ status: 403, body: { reason } }) });
      const outcome = await onboardCritic(base);
      expect(outcome).toMatchObject({ status: "denied", reason });
      expect(outcome.status === "denied" && outcome.message.length).toBeGreaterThan(5);
      expect(register).not.toHaveBeenCalled();
    },
  );

  it("a cancelled World session is reported to the server and never registers", async () => {
    const verify = vi.fn(async () => ({ status: 403, body: { reason: "cancelled" } }));
    const { base, register } = deps({
      startWorld: () => ({ connectorURI: "u", complete: async () => ({ success: false, error: "cancelled" }) }),
      verify,
    });
    expect(await onboardCritic(base)).toMatchObject({ status: "denied", reason: "cancelled" });
    expect(verify).toHaveBeenCalledWith({ error: "cancelled", critic });
    expect(register).not.toHaveBeenCalled();
  });

  it("does not trust a 200 without a voucher, and treats an unreachable server as denied", async () => {
    const bad = deps({ verify: async () => ({ status: 200, body: { ok: true } }) });
    expect(await onboardCritic(bad.base)).toMatchObject({ status: "denied", reason: "unavailable" });
    expect(bad.register).not.toHaveBeenCalled();
    const down = deps({
      verify: async () => {
        throw new Error("network");
      },
    });
    expect(await onboardCritic(down.base)).toMatchObject({ status: "denied", reason: "unavailable" });
    expect(down.register).not.toHaveBeenCalled();
  });

  it("reports a failed registration transaction as such, not as a denial", async () => {
    const { base } = deps({
      register: async () => {
        throw new Error("user rejected the transaction");
      },
    });
    expect(await onboardCritic(base)).toMatchObject({ status: "failed", message: "user rejected the transaction" });
  });
});
