import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const app = () => buildApp({ publicClient: { getChainId: async () => 31337 }, contracts: {} });
const limits = { budget: "100", perMerchantCap: "60", allowlist: ["http://127.0.0.1:4001"], approvalThreshold: "10" };

describe("buyer spend routes", () => {
  it("stores the owner's limits and rejects malformed ones", async () => {
    const server = app();
    expect((await server.inject({ method: "GET", url: "/buyer/limits" })).json()).toBeNull();
    expect((await server.inject({ method: "PUT", url: "/buyer/limits", payload: limits })).statusCode).toBe(200);
    const read = await server.inject({ method: "GET", url: "/buyer/limits" });
    expect(read.json()).toEqual(limits);
    expect(read.headers["access-control-allow-origin"]).toBe("*");
    const bad = await server.inject({ method: "PUT", url: "/buyer/limits", payload: { ...limits, budget: "-1" } });
    expect(bad.statusCode).toBe(400);
  });

  it("queues an approval that a human approves or denies once", async () => {
    const server = app();
    const created = await server.inject({
      method: "POST",
      url: "/buyer/approvals",
      payload: { merchant: "http://127.0.0.1:4001", amount: "11" },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect(created.json()).toMatchObject({ status: "pending", amount: "11" });
    expect((await server.inject({ method: "GET", url: "/buyer/approvals" })).json()).toHaveLength(1);

    const approved = await server.inject({ method: "POST", url: `/buyer/approvals/${id}/approve` });
    expect(approved.json()).toMatchObject({ id, status: "approved" });
    expect((await server.inject({ method: "GET", url: `/buyer/approvals/${id}` })).json().status).toBe("approved");
    expect((await server.inject({ method: "POST", url: `/buyer/approvals/${id}/deny` })).statusCode).toBe(409);
    expect((await server.inject({ method: "POST", url: "/buyer/approvals/nope/deny" })).statusCode).toBe(404);
  });

  it("allows the web app's cross-origin writes", async () => {
    const server = app();
    const preflight = await server.inject({
      method: "OPTIONS",
      url: "/buyer/limits",
      headers: { origin: "http://web.test", "access-control-request-method": "PUT" },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-methods"]).toContain("PUT");
  });
});
