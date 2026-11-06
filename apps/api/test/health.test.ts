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

it("public GET responses allow browser reads without granting POST or credentialed CORS", async () => {
  const app = buildApp({
    publicClient: { getChainId: async () => 296 },
    contracts: {},
    critics: { list: async () => [], get: async () => undefined },
    rounds: { get: async () => undefined },
  });
  try {
    for (const url of ["/health", "/critics", "/rounds/1"]) {
      const response = await app.inject({ method: "GET", url, headers: { origin: "http://localhost:3000" } });
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    }
    const post = await app.inject({ method: "POST", url: "/critics", headers: { origin: "http://localhost:3000" } });
    expect(post.headers["access-control-allow-origin"]).toBeUndefined();
  } finally {
    await app.close();
  }
});
