import { type ServiceStarter, type Stack, startStack } from "@skeptic/harness";
import type { BuyerRun, RankingInput } from "@skeptic/shared";
import { createLocalPayAndCall } from "@skeptic/x402-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DemoService, defineService, startService } from "../../services/common/server";
import { createSuiteGamer, suiteGamerSuite } from "../../services/suite-gamer/src/index";
import { handleUnitConvert, unitConvertSuite } from "../../services/unit-convert/src/index";
import { publishBuyerRun, runBuyer } from "../src/index";

// Local fixtures: critic and buyer identities, and the finalized round results Dev 2's review flow produces
// for these two services (good service 100, suite-gamer 40 once probes expose it).
const CRITICS = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"];
const BUYERS = ["0x0000000000000000000000000000000000000b01", "0x0000000000000000000000000000000000000b02"];
const SELLER = "0x0000000000000000000000000000000000000022";
const ROUND_RESULTS: Record<string, { id: number; median: number }> = {
  "unit-convert": { id: 1, median: 100 },
  "suite-gamer": { id: 2, median: 40 },
};
const TASK = { value: 3, from: "m", to: "cm" };

const serve =
  (service: DemoService): ServiceStarter =>
  async () => {
    const { server, url } = await startService(service, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

describe("buyer picks by score", () => {
  let stack: Stack;
  const listing = (): RankingInput[] =>
    Object.entries(ROUND_RESULTS).map(([name, { id, median }]) => ({
      id,
      name,
      category: "conversion",
      endpoint: `${stack.services[name]}/call`,
      pricePerCall: "1",
      seller: SELLER,
      ensName: "",
      median,
      nReveals: 3,
      nRounds: 1,
      lastRoundAt: new Date().toISOString(),
      popularityCalls: 0,
    }));

  beforeAll(async () => {
    stack = await startStack({
      services: {
        "unit-convert": serve(defineService("unit-convert", unitConvertSuite, handleUnitConvert)),
        "suite-gamer": serve(defineService("suite-gamer", suiteGamerSuite, createSuiteGamer())),
      },
      api: {
        marketplace: {
          source: { list: listing },
          isCritic: (address) => CRITICS.some((critic) => critic.toLowerCase() === address.toLowerCase()),
        },
      },
    });
  }, 60_000);

  afterAll(async () => {
    await stack?.stop();
  });

  // What a service does after each settled payment (wired to x402 settlement in ticket 15).
  const reportPaidCall = async (serviceId: number, payer: string) => {
    const res = await fetch(`${stack.apiUrl}/calls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceId, payer }),
    });
    expect(res.status).toBe(202);
  };

  it("skeptic buyer pays the good service, popularity buyer pays the gamer, critic calls never count", async () => {
    const payAndCall = createLocalPayAndCall({ priceFor: async () => "1", timeoutMs: 5_000 });
    const good = `${stack.services["unit-convert"]}/call`;

    for (let i = 0; i < 20; i++) {
      await payAndCall({ url: good, body: TASK, maxPrice: "1", signer: null, criticCall: true });
      await reportPaidCall(1, CRITICS[i % CRITICS.length] as string);
    }
    await reportPaidCall(1, BUYERS[0] as string);
    for (let i = 0; i < 5; i++) await reportPaidCall(2, BUYERS[i % BUYERS.length] as string);

    const popularity: RankingInput[] = await (await fetch(`${stack.apiUrl}/services`)).json();
    expect(Object.fromEntries(popularity.map((s: RankingInput) => [s.name, s.popularityCalls]))).toEqual({
      "unit-convert": 1,
      "suite-gamer": 5,
    });

    const runs: BuyerRun[] = [];
    for (const strategy of ["skeptic", "popularity"] as const) {
      const run = await runBuyer({
        apiUrl: stack.apiUrl,
        category: "conversion",
        task: TASK,
        strategy,
        payAndCall,
        signer: null,
      });
      await publishBuyerRun(stack.apiUrl, run);
      runs.push(run);
    }

    expect(runs[0]).toMatchObject({ pick: { name: "unit-convert" }, response: { result: 300, unit: "cm" } });
    expect(runs[0]?.explanation).toContain("suite-gamer");
    expect(runs[1]).toMatchObject({ pick: { name: "suite-gamer" } });
    expect(runs[1]?.explanation).toMatch(/does not consider quality/);

    const shown: BuyerRun[] = await (await fetch(`${stack.apiUrl}/buyer/runs`)).json();
    expect(shown.map((run: BuyerRun) => [run.strategy, run.pick.name])).toEqual([
      ["skeptic", "unit-convert"],
      ["popularity", "suite-gamer"],
    ]);
  }, 60_000);
});
