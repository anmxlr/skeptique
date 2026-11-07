import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("GET /health", () => {
  it("tells the web app when this API only serves reads", async () => {
    const readOnly = buildApp({ publicClient: { getChainId: async () => 296 }, contracts: {}, readOnly: true });
    const full = buildApp({ publicClient: { getChainId: async () => 296 }, contracts: {} });

    expect((await readOnly.inject("/health")).json()).toEqual({ ok: true, chainId: 296, readOnly: true });
    expect((await full.inject("/health")).json()).toEqual({ ok: true, chainId: 296 });
  });
});
