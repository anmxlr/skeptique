import { describe, expect, it } from "vitest";
import { paymentModeFromEnv } from "../src/mode";

const x402 = { X402_FACILITATOR_URL: "https://f.test", BUYER_ACCOUNT_ID: "0.0.7", BUYER_PRIVATE_KEY: "key" };

describe("hedera mode", () => {
  it("is chosen with the buyer account as signer when the x402 env is set", () => {
    expect(paymentModeFromEnv(x402)).toEqual({
      mode: "hedera",
      signer: { accountId: "0.0.7", privateKey: "key" },
    });
  });

  it("falls back to local mode when any x402 variable is missing", () => {
    expect(paymentModeFromEnv({})).toEqual({ mode: "local", signer: null });
    for (const missing of Object.keys(x402))
      expect(paymentModeFromEnv({ ...x402, [missing]: undefined }).mode).toBe("local");
  });
});
