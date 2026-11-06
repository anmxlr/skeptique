import { writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { EvidenceSchema, type RankingInput, rankServices } from "@skeptique/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryEvidenceStore, registerEvidenceRoutes } from "../../apps/api/src/evidence";
import { registerMarketplaceRoutes } from "../../apps/api/src/marketplace";
import { recordedProbeCases } from "../../apps/critic/src/probe-fixtures";
import { attachProbeEvidence, type ProbeModel, runProbeEvaluation } from "../../apps/critic/src/probes";
import { fetchAndRunCriticSuite, publishCriticEvidence } from "../../apps/critic/src/runner";
import { type DemoService, defineService, startService } from "../../apps/services/common/server";
import { createSuiteGamer, suiteGamerSuite } from "../../apps/services/suite-gamer/src/index";
import { handleUnitConvert, unitConvertSuite } from "../../apps/services/unit-convert/src/index";
import { createLocalPayAndCall, type PayAndCallResult } from "../../packages/x402-client/src/index";

// These are local fixture identities and deterministic oracles, never live-network evidence.
const CRITICS = [
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
] as const;
const SELLER = "0x0000000000000000000000000000000000000022";
const MODEL = "local-fixture/unit-conversion-oracle";
const servers: Server[] = [];
const applications: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function serve(service: DemoService) {
  const running = await startService(service, 0);
  servers.push(running.server);
  return running;
}

async function localConversionJudge(input: { rubric: string; input: unknown; output: unknown }): Promise<boolean> {
  if (input.rubric !== "Check that the returned conversion equals zero Celsius within 1e-8.")
    throw new Error("Missing local deterministic judge oracle");
  if (!input.output || typeof input.output !== "object") return false;
  const result = input.output as { result?: unknown; unit?: unknown };
  return typeof result.result === "number" && Math.abs(result.result) <= 1e-8 && result.unit === "C";
}

describe("Dev 2 local service review flow", () => {
  it("exposes the gamer through real HTTP calls, publishes auditable evidence and selects the genuine service", async () => {
    const startedAt = performance.now();
    const goodService = defineService("unit-convert", unitConvertSuite, handleUnitConvert);
    const gamerService = defineService("suite-gamer", suiteGamerSuite, createSuiteGamer());
    const good = await serve(goodService);
    const gamer = await serve(gamerService);
    const localCalls: PayAndCallResult[] = [];
    const localClient = createLocalPayAndCall({ priceFor: async () => "1", timeoutMs: 2_000 });
    const payAndCall: typeof localClient = async (args) => {
      const result = await localClient(args);
      localCalls.push(result);
      return result;
    };
    const model: ProbeModel = {
      generateProbes: async () => structuredClone(recordedProbeCases),
      judge: localConversionJudge,
    };
    const app = Fastify();
    applications.push(app);
    let rankingInputs: RankingInput[] = [];
    const now = Date.now();
    registerEvidenceRoutes(app, new MemoryEvidenceStore());
    registerMarketplaceRoutes(app, { list: () => rankingInputs }, () => now);
    const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });

    const services = [];
    for (const [index, entry] of [
      { service: goodService, url: good.url },
      { service: gamerService, url: gamer.url },
    ].entries()) {
      const reviews = [];
      for (const critic of CRITICS) {
        const suiteResult = await fetchAndRunCriticSuite({
          suiteUrl: `${entry.url}/suite.json`,
          specHash: entry.service.specHash,
          roundId: index + 1,
          critic,
          endpoint: `${entry.url}/call`,
          maxPrice: "1",
          signer: null,
          payAndCall,
          judge: localConversionJudge,
          model: MODEL,
          timeoutMs: 2_000,
          budgetMs: 10_000,
        });
        expect(suiteResult.suitePass).toBe(100);
        expect(suiteResult.errorRate).toBe(0);
        const probes = await runProbeEvaluation({
          suite: entry.service.suite,
          serviceDescription: "Converts length, mass, volume and temperature units.",
          model,
          seed: 17,
          timeoutMs: 2_000,
          budgetMs: 10_000,
          serviceCall: async (input, signal) =>
            (
              await payAndCall({
                url: `${entry.url}/call`,
                body: input,
                criticCall: true,
                maxPrice: "1",
                signer: null,
                signal,
              })
            ).response,
        });
        const evidence = attachProbeEvidence(suiteResult.evidence, probes);
        expect(EvidenceSchema.safeParse(evidence).success).toBe(true);
        expect(evidence.suite.every((result) => result.output !== undefined)).toBe(true);
        expect(evidence.probes.every((result) => result.output !== undefined)).toBe(true);
        expect(evidence.x402Txs).toEqual([]);
        expect(evidence.claimedCost).toBe("0");
        const evidenceHash = await publishCriticEvidence({ evidence, url: `${apiUrl}/evidence`, timeoutMs: 2_000 });
        const stored = await fetch(`${apiUrl}/evidence/${evidenceHash}`);
        expect(stored.status).toBe(200);
        expect(await stored.json()).toEqual(evidence);
        reviews.push({
          critic,
          suitePass: suiteResult.suitePass,
          probePass: probes.passRate,
          score: evidence.score,
          evidenceHash,
          rawEvidence: evidence,
        });
      }
      services.push({
        serviceId: index + 1,
        roundId: index + 1,
        serviceName: entry.service.name,
        specHash: entry.service.specHash,
        endpoint: `${entry.url}/call`,
        reviews,
      });
    }
    expect(services[0]!.reviews.every((review) => review.probePass === 100 && review.score === 100)).toBe(true);
    expect(services[1]!.reviews.every((review) => review.probePass === 0 && review.score === 40)).toBe(true);
    expect(services.every((service) => service.reviews.length === 3)).toBe(true);
    rankingInputs = services.map((service) => ({
      id: service.serviceId,
      name: service.serviceName,
      category: "conversion",
      endpoint: service.endpoint,
      pricePerCall: "1",
      seller: SELLER,
      ensName: "",
      median: service.reviews.map((review) => review.score).sort((a, b) => a - b)[1]!,
      nRounds: 1,
      nReveals: 3,
      lastRoundAt: new Date(now).toISOString(),
      popularityCalls: service.serviceName === "suite-gamer" ? 1_000 : 0,
    }));
    const ranked = rankServices(rankingInputs, now);
    expect(ranked.map((service) => service.name)).toEqual(["unit-convert", "suite-gamer"]);
    const marketplaceResponse = await fetch(`${apiUrl}/services`);
    expect(marketplaceResponse.status).toBe(200);
    expect(((await marketplaceResponse.json()) as Array<{ name: string }>).map((service) => service.name)).toEqual([
      "unit-convert",
      "suite-gamer",
    ]);
    const buyer = await payAndCall({
      url: ranked[0]!.endpoint,
      body: { value: 3, from: "m", to: "cm" },
      maxPrice: "1",
      signer: null,
    });
    expect(buyer.response).toEqual({ result: 300, unit: "cm" });
    expect(localCalls).toHaveLength(
      3 * (unitConvertSuite.cases.length + suiteGamerSuite.cases.length + 2 * recordedProbeCases.length) + 1,
    );
    expect(localCalls.every((result) => result.txId === null && result.paid === false)).toBe(true);

    if (process.env.DEV2_EVIDENCE_PATH) {
      await writeFile(
        process.env.DEV2_EVIDENCE_PATH,
        JSON.stringify(
          {
            mode: "LOCAL_ONLY",
            sponsorNetworkEvidence: false,
            transactionIds: [],
            judge: MODEL,
            elapsedMs: performance.now() - startedAt,
            services,
            rankingInputsAreLocalSnapshots: true,
            rankingInputs,
            ranked,
            buyer: { selectedService: ranked[0]!.name, ...buyer },
          },
          null,
          2,
        ),
      );
    }
  }, 60_000);

  it("refuses a changed public suite before any service call", async () => {
    const handle = vi.fn(handleUnitConvert);
    const service = defineService("unit-convert", unitConvertSuite, handle);
    const running = await serve(service);
    const payAndCall = vi.fn(createLocalPayAndCall({ priceFor: async () => "1" }));
    await expect(
      fetchAndRunCriticSuite({
        suiteUrl: `${running.url}/suite.json`,
        specHash: `0x${"0".repeat(64)}`,
        roundId: 1,
        critic: CRITICS[0],
        endpoint: `${running.url}/call`,
        maxPrice: "1",
        signer: null,
        payAndCall,
        judge: localConversionJudge,
        model: MODEL,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("Suite hash mismatch");
    expect(payAndCall).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("enforces a denied local payment policy before contacting the service", async () => {
    const handle = vi.fn(handleUnitConvert);
    const service = defineService("unit-convert", unitConvertSuite, handle);
    const running = await serve(service);
    const client = createLocalPayAndCall({ priceFor: async () => "1", onBeforePay: () => false });
    await expect(
      client({ url: `${running.url}/call`, body: { value: 3, from: "m", to: "cm" }, maxPrice: "1", signer: null }),
    ).rejects.toThrow("Payment denied");
    await expect(
      fetchAndRunCriticSuite({
        suiteUrl: `${running.url}/suite.json`,
        specHash: service.specHash,
        roundId: 1,
        critic: CRITICS[0],
        endpoint: `${running.url}/call`,
        maxPrice: "1",
        signer: null,
        payAndCall: client,
        judge: localConversionJudge,
        model: MODEL,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("Payment denied");
    expect(handle).not.toHaveBeenCalled();
  });

  it("records offline endpoint failures without fabricating settled transactions", async () => {
    const service = defineService("unit-convert", unitConvertSuite, handleUnitConvert);
    const suiteServer = await serve(service);
    const offline = await serve(service);
    await new Promise<void>((resolve) => offline.server.close(() => resolve()));
    const result = await fetchAndRunCriticSuite({
      suiteUrl: `${suiteServer.url}/suite.json`,
      specHash: service.specHash,
      roundId: 1,
      critic: CRITICS[0],
      endpoint: `${offline.url}/call`,
      maxPrice: "1",
      signer: null,
      payAndCall: createLocalPayAndCall({ priceFor: async () => "1", timeoutMs: 1_000 }),
      judge: localConversionJudge,
      model: MODEL,
      timeoutMs: 1_000,
      budgetMs: 10_000,
    });
    expect(result.suitePass).toBe(0);
    expect(result.errorRate).toBe(1);
    expect(result.evidence.suite.every((result) => !result.passed && typeof result.error === "string")).toBe(true);
    expect(result.evidence.x402Txs).toEqual([]);
    expect(result.evidence.claimedCost).toBe("0");
  }, 15_000);
});
