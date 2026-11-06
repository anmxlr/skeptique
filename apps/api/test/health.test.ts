import { afterAll, expect, it } from "vitest";
import { buildApp } from "../src/app";

const up = buildApp({ publicClient: { getChainId: async () => 296 }, contracts: {} });
const down = buildApp({
  publicClient: {
    getChainId: async () => {
      throw new Error("rpc down");
    },
  },
  contracts: {},
});
afterAll(() => Promise.all([up.close(), down.close()]));

it("GET /health reports the chain id", async () => {
  const res = await up.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true, chainId: 296 });
});

it("GET /health is 503 when the chain is unreachable", async () => {
  const res = await down.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(503);
});
