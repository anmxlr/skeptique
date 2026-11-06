import { afterEach, describe, expect, it } from "vitest";
import { createTestingLab } from "./testing-lab";

const servers: ReturnType<typeof createTestingLab>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start() {
  const app = createTestingLab();
  servers.push(app);
  await app.listen({ host: "127.0.0.1", port: 0 });
  return app;
}

describe("local testing lab", () => {
  it("exposes memorized answers using real HTTP calls and the existing critic evaluator", async () => {
    const app = await start();
    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        services: ["unit-convert", "suite-gamer"],
        scenario: "baseline",
        budget: 100,
      },
    });
    expect(response.statusCode).toBe(200);
    const run = response.json();
    expect(run.mode).toBe("local-fixture");
    expect(run.results.map((r: { publicPass: number }) => r.publicPass)).toEqual([100, 100]);
    expect(run.results.map((r: { score: number }) => r.score)).toEqual([100, 40]);
    expect(run.results[1].evidence.probes.every((p: { passed: boolean }) => !p.passed)).toBe(true);
    expect(run.results[0].evidence.x402Txs).toEqual([]);
    expect(run.results[0].evidenceHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(run.calls).toBe(46);
    expect((await app.inject("/runs")).json()[0].id).toBe(run.id);
  });

  it("stops before making a call beyond the shared budget", async () => {
    const app = await start();
    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        services: ["unit-convert", "suite-gamer"],
        scenario: "baseline",
        budget: 2,
      },
    });
    const run = response.json();
    expect(run.calls).toBe(2);
    expect(run.results.every((r: { error: string }) => r.error.includes("budget"))).toBe(true);
    expect(run.results.every((r: { score?: number }) => r.score === undefined)).toBe(true);
  });

  it("records service outages as failed checks, without fabricating success", async () => {
    const app = await start();
    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        services: ["unit-convert"],
        scenario: "outage",
        budget: 100,
      },
    });
    const result = response.json().results[0];
    expect(result.score).toBe(0);
    expect(result.evidence.suite[0].error).toContain("503");
  });

  it("times out slow services and keeps the report inspectable", async () => {
    const app = await start();
    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        services: ["unit-convert"],
        scenario: "slow",
        budget: 100,
      },
    });
    const run = response.json();
    expect(run.calls).toBe(23);
    expect(run.results[0].score).toBe(0);
    expect(run.results[0].evidence.suite.every((c: { passed: boolean; error?: string }) => !c.passed && c.error)).toBe(
      true,
    );
  });

  it("evaluates CSV string outputs and reveals parsing failures", async () => {
    const app = await start();
    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        services: ["csv-clean"],
        scenario: "baseline",
        budget: 100,
      },
    });
    const result = response.json().results[0];
    expect(result.error).toBeUndefined();
    expect(result.cases.find((c: { id: string }) => c.id === "trim").passed).toBe(true);
    expect(result.cases.find((c: { id: string }) => c.id === "unicode-normalization").passed).toBe(false);
    expect(result.score).toBeLessThan(100);
  });

  it("rejects arbitrary service targets, invalid budgets and cross-origin requests", async () => {
    const app = await start();
    for (const payload of [
      { services: ["http://example.com"], scenario: "baseline", budget: 100 },
      { services: ["unit-convert"], scenario: "baseline", budget: 0 },
      { services: ["unit-convert", "unit-convert"], scenario: "baseline", budget: 100 },
    ])
      expect((await app.inject({ method: "POST", url: "/runs", payload })).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/runs",
          headers: { origin: "https://example.com" },
          payload: { services: ["unit-convert"], scenario: "baseline", budget: 100 },
        })
      ).statusCode,
    ).toBe(403);
  });
});
