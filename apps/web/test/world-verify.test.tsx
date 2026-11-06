import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { type RpContextResponse, runWorldVerification, WorldVerifyView } from "../components/world-verify";

const CRITIC = "0x00000000000000000000000000000000000000C1";
const context: RpContextResponse = {
  app_id: "app_test",
  action: "register-critic",
  environment: "staging",
  rp_id: "rp_test",
  nonce: "0x01",
  created_at: 1,
  expires_at: 301,
  signature: "0xsig",
};
const voucher = { nullifier: `0x${"0c".repeat(32)}`, expiry: "1793960000", sig: "0xvoucher" };

function fakes(completion: unknown, verify: { status: number; body: unknown }) {
  const post = vi.fn(async (path: string, _body?: unknown) =>
    path === "/world/rp-context" ? { status: 200, body: context } : verify,
  );
  const request = vi.fn(async (_ctx: RpContextResponse, _signal: string) => ({
    connectorURI: "https://world.org/verify?t=wld&i=abc",
    pollUntilCompletion: vi.fn(async () => completion),
  }));
  return { post, request, onWaiting: vi.fn() };
}

describe("world verify flow", () => {
  it("binds the proof to the critic, forwards IDKit's result to the API and returns the voucher", async () => {
    const result = { protocol_version: "4.0", nonce: "0x01", responses: [] };
    const f = fakes({ success: true, result }, { status: 200, body: voucher });
    const state = await runWorldVerification({ ...f, critic: CRITIC, abort: new AbortController().signal });
    expect(state).toEqual({ status: "verified", voucher });
    expect(f.request).toHaveBeenCalledWith(context, CRITIC.toLowerCase());
    expect(f.onWaiting).toHaveBeenCalledWith(
      "https://world.org/verify?t=wld&i=abc",
      "https://simulator.worldcoin.org/?connect_url=https%3A%2F%2Fworld.org%2Fverify%3Ft%3Dwld%26i%3Dabc",
    );
    expect(f.post).toHaveBeenLastCalledWith("/world/verify", { ...result, critic: CRITIC });
  });

  it("sends an IDKit failure to the API too, so every denial gets the same server-decided reason", async () => {
    const f = fakes({ success: false, error: "user_rejected" }, { status: 403, body: { reason: "cancelled" } });
    const state = await runWorldVerification({ ...f, critic: CRITIC, abort: new AbortController().signal });
    expect(state).toEqual({ status: "denied", reason: "cancelled" });
    expect(f.post).toHaveBeenLastCalledWith("/world/verify", {
      success: false,
      error: "user_rejected",
      critic: CRITIC,
    });
  });

  it("offers no simulator link outside staging", async () => {
    const f = fakes({ success: false, error: "timeout" }, { status: 403, body: { reason: "expired" } });
    f.post.mockImplementationOnce(async () => ({ status: 200, body: { ...context, environment: "production" } }));
    await runWorldVerification({ ...f, critic: CRITIC, abort: new AbortController().signal });
    expect(f.onWaiting).toHaveBeenCalledWith(expect.any(String), undefined);
  });
});

describe("world verify view", () => {
  const render = (state: Parameters<typeof WorldVerifyView>[0]["state"], critic = CRITIC) =>
    renderToString(
      <WorldVerifyView
        state={state}
        critic={critic}
        onCriticChange={() => {}}
        onStart={() => {}}
        onCancel={() => {}}
      />,
    );

  it("only lets a valid critic address start verification", () => {
    expect(render({ status: "idle" })).not.toMatch(/<button[^>]*disabled/);
    expect(render({ status: "idle" }, "not-an-address")).toMatch(/<button[^>]*disabled/);
  });

  it("shows the World App link, the simulator link in staging, and a cancel button while waiting", () => {
    const html = render({ status: "waiting", connectorURI: "https://world.org/v?x=1", simulatorURL: "https://sim/" });
    expect(html).toContain('href="https://world.org/v?x=1"');
    expect(html).toContain('href="https://sim/"');
    expect(html).toContain("Cancel");
  });

  it("explains each denial and says the critic was not registered", () => {
    for (const [reason, text] of [
      ["unverified", "No valid World ID proof"],
      ["cancelled", "cancelled"],
      ["expired", "expired"],
      ["duplicate_human", "already has a registered critic"],
      ["invalid_proof", "World rejected the proof"],
      ["wrong_signal", "different critic wallet"],
    ]) {
      const html = render({ status: "denied", reason });
      expect(html).toContain('role="alert"');
      expect(html).toContain(text);
      expect(html).toContain("Your critic was not registered.");
    }
  });

  it("shows the voucher the critic agent registers with", () => {
    const html = render({ status: "verified", voucher });
    expect(html).toContain(voucher.nullifier);
    expect(html).toContain("0xvoucher");
    expect(html).toContain("stakes and registers");
  });
});
