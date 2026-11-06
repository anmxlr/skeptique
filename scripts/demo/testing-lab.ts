import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { suiteHash, type TestCase, type TestSuite } from "@skeptique/shared";
import canonicalize from "canonicalize";
import Fastify from "fastify";
import { recordedProbeCases } from "../../apps/critic/src/probe-fixtures";
import { attachProbeEvidence, runProbeEvaluation } from "../../apps/critic/src/probes";
import { runCriticSuite } from "../../apps/critic/src/runner";
import { cleanCsv, csvCleanSuite } from "../../apps/services/csv-clean/src/index";
import { createSuiteGamer, suiteGamerSuite } from "../../apps/services/suite-gamer/src/index";
import { handleUnitConvert } from "../../apps/services/unit-convert/src/index";
import type { LabResult, LabRun } from "../../apps/web/lib/lab-types";

// Deliberately published local fixtures. These are not secret production probes or RL training.
const csvProbes: TestCase[] = [
  { id: "spaces", input: { csv: " x , y\n 8 , 9 " }, expect: { kind: "exact", value: "x,y\n8,9" }, weight: 1 },
  {
    id: "quoted-space",
    input: { csv: 'name,note\nRia,"keep,  two spaces"' },
    expect: { kind: "exact", value: 'name,note\nRia,"keep,  two spaces"' },
    weight: 1,
  },
  {
    id: "unicode-normalization",
    input: { csv: "city\nzu\u0308rich" },
    expect: { kind: "exact", value: "city\nzürich" },
    weight: 1,
  },
  { id: "empty-rows", input: { csv: "k,v\n1,2\n\n\n" }, expect: { kind: "exact", value: "k,v\n1,2" }, weight: 1 },
];

const services = [
  {
    id: "unit-convert",
    name: "Unit converter",
    category: "Conversion",
    description: "General-purpose conversion implementation.",
    suite: { ...suiteGamerSuite, serviceName: "unit-convert" },
    probes: recordedProbeCases,
    handle: handleUnitConvert,
  },
  {
    id: "suite-gamer",
    name: "Suite gamer",
    category: "Conversion",
    description: "Memorizes advertised answers. Can it handle unseen inputs?",
    suite: suiteGamerSuite,
    probes: recordedProbeCases,
    handle: createSuiteGamer(),
  },
  {
    id: "csv-clean",
    name: "CSV cleaner",
    category: "Data cleaning",
    description: "Trims cells and empty rows. Test its handling of real-world text.",
    suite: {
      ...csvCleanSuite,
      cases: csvCleanSuite.cases.map((c) =>
        c.expect.kind === "judge" ? { ...c, expect: { kind: "exact" as const, value: "" } } : c,
      ),
    },
    probes: csvProbes,
    handle: (input: unknown) => cleanCsv(input as { csv: string }),
  },
];

export function createTestingLab() {
  const app = Fastify({ bodyLimit: 16_384 });
  const history: LabRun[] = [];
  let busy = false;
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin || request.headers["sec-fetch-site"] === "cross-site") {
      try {
        if (!origin || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)) throw new Error();
      } catch {
        return reply.code(403).send({ error: "The lab accepts local requests only." });
      }
    }
    reply.header("cache-control", "no-store");
  });
  app.get("/health", async () => ({ mode: "local-fixture", status: "ok" }));
  app.get("/services", async () =>
    services.map(({ id, name, category, description, suite, probes }) => ({
      id,
      name,
      category,
      description,
      publicCases: suite.cases.length,
      probes: probes.length,
    })),
  );
  app.get("/runs", async () => history);
  app.post<{ Params: { id: string }; Body: { input: unknown; scenario: string } }>(
    "/services/:id/call",
    async (request, reply) => {
      const service = services.find((s) => s.id === request.params.id);
      if (!service) return reply.code(404).send({ error: "Unknown fixture service" });
      if (request.body.scenario === "outage") return reply.code(503).send({ error: "Injected service outage" });
      if (request.body.scenario === "slow") await delay(220);
      const output = await service.handle(request.body.input);
      return reply.type("application/json").send(JSON.stringify(output));
    },
  );
  app.post<{ Body: { services: string[]; scenario: LabRun["scenario"]; budget: number } }>(
    "/runs",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["services", "scenario", "budget"],
          properties: {
            services: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              uniqueItems: true,
              items: { type: "string", enum: services.map((s) => s.id) },
            },
            scenario: { type: "string", enum: ["baseline", "slow", "outage"] },
            budget: { type: "integer", minimum: 1, maximum: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      if (busy) return reply.code(409).send({ error: "An evaluation is running. Try again when it finishes." });
      busy = true;
      const started = performance.now();
      const run: LabRun = {
        id: randomUUID(),
        mode: "local-fixture",
        startedAt: new Date().toISOString(),
        durationMs: 0,
        scenario: request.body.scenario,
        budget: request.body.budget,
        calls: 0,
        results: [],
      };
      try {
        const address = app.server.address();
        if (!address || typeof address === "string") throw new Error("Lab must be listening before evaluation");
        for (const id of request.body.services) {
          const service = services.find((s) => s.id === id);
          if (!service) throw new Error("Unknown fixture service");
          const result: LabResult = { id, name: service.name };
          run.results.push(result);
          const endpoint = `http://127.0.0.1:${address.port}/services/${id}/call`;
          const call = async (body: unknown, signal?: AbortSignal) => {
            if (run.calls >= run.budget)
              throw Object.assign(new Error("Call budget exhausted; evaluation stopped before the next request."), {
                code: "PAYMENT_POLICY_DENIED",
              });
            run.calls++;
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ input: body, scenario: run.scenario }),
              signal,
            });
            if (!response.ok) throw new Error(`Service returned HTTP ${response.status}`);
            return response.json();
          };
          try {
            const suite: TestSuite = service.suite;
            const publicResult = await runCriticSuite({
              suite,
              specHash: suiteHash(suite),
              roundId: 0,
              critic: "0x0000000000000000000000000000000000000001",
              endpoint,
              maxPrice: "0",
              signer: null,
              timeoutMs: run.scenario === "slow" ? 80 : 2000,
              budgetMs: 20_000,
              payAndCall: async ({ body, signal }) => ({ response: await call(body, signal), paid: false, txId: null }),
            });
            const probes = await runProbeEvaluation({
              suite,
              serviceDescription: service.description,
              seed: 1,
              serviceCall: call,
              timeoutMs: run.scenario === "slow" ? 80 : 2000,
              budgetMs: 20_000,
              model: {
                generateProbes: async () => service.probes,
                judge: async () => {
                  throw new Error("No LLM judge in fixture mode");
                },
              },
            });
            const evidence = attachProbeEvidence(publicResult.evidence, probes);
            const canonical = canonicalize(evidence);
            if (!canonical) throw new Error("Evidence could not be canonicalized");
            Object.assign(result, {
              publicPass: publicResult.suitePass,
              probePass: probes.passRate,
              score: evidence.score,
              evidence,
              evidenceHash: `0x${createHash("sha256").update(canonical).digest("hex")}`,
              cases: [
                ...evidence.suite.map((c, i) => ({
                  ...c,
                  id: c.caseId,
                  phase: "public",
                  input: suite.cases[i].input,
                  expected: suite.cases[i].expect,
                })),
                ...evidence.probes.map((c) => ({
                  ...c,
                  id: c.caseId,
                  phase: "probe",
                  input: c.case.input,
                  expected: c.case.expect,
                })),
              ],
              recommendation:
                run.scenario !== "baseline"
                  ? "Resolve the injected availability failure and rerun the baseline before judging service quality."
                  : probes.passRate < publicResult.suitePass - 20
                    ? "Public performance does not generalize. Inspect failed probes and implement missing general input handling; retest on fresh inputs."
                    : evidence.score < 100
                      ? "Inspect failed cases, fix parsing or normalization, then rerun both test populations."
                      : "Passed this fixture set. Expand coverage before relying on it for higher-stakes tasks.",
            });
          } catch (error) {
            result.error = error instanceof Error ? error.message : "Evaluation failed";
          }
        }
        run.durationMs = performance.now() - started;
        history.unshift(run);
        history.splice(20);
        return run;
      } finally {
        busy = false;
      }
    },
  );
  return app;
}
