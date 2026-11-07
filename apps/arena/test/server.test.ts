import { afterEach, describe, expect, it } from "vitest";
import { hashBatch } from "../src/batch";
import type { Llm } from "../src/llm";
import type { BatchEvent } from "../src/schema";
import { buildArenaServer } from "../src/server";
import { TASK_PACK } from "../src/tasks";
import { FX, FXREF, fakePay, GAMER, GOOD, policy, scriptedLlm } from "./fakes";

const ORIGIN = "http://web.test";
const PROMPT = "Convert 451 °F to Celsius"; // a TASK_PACK prompt, so the task parser never calls the model
const SELLER = "0.0.999";

/** The scripted model, held until `release()` so a run can be observed while in progress. */
function gatedLlm(): Llm & { release: () => void } {
  const inner = scriptedLlm();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    model: inner.model,
    release,
    ask: async (args) => {
      await gate;
      return inner.ask(args);
    },
  };
}

function server(llm: Llm = scriptedLlm(), userPay = fakePay()) {
  const paid: string[] = [];
  const llmRequests: { model: string; apiKey?: string }[] = [];
  const app = buildArenaServer({
    apiUrl: "http://api.test",
    llm,
    network: "test",
    provenance: "test",
    port: 80, // inject() sends Host: localhost:80
    webOrigin: ORIGIN,
    sides: {
      baseline: { payAndCall: fakePay(paid), signer: null, payer: "0.0.10", policy: policy(null) },
      skeptique: {
        payAndCall: fakePay(paid),
        signer: null,
        payer: "0.0.11",
        policy: policy({ minMedian: 70, minRounds: 1 }),
      },
    },
    fetchImpl: async () => Response.json([GOOD, GAMER, FX, FXREF]),
    llmFor: (options) => {
      llmRequests.push(options);
      return scriptedLlm();
    },
    userPayAndCall: () => userPay,
    sellerAccountId: SELLER,
  });
  return { app, paid, llmRequests };
}

let app: ReturnType<typeof buildArenaServer> | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

/** Parses an SSE body into its events. */
const sseEvents = (body: string) =>
  body
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("event: "))
    .map((chunk) => JSON.parse(chunk.split("\ndata: ")[1] ?? "null"));

async function waitFor(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out");
}

describe("arena server: runs", () => {
  it("accepts a run, rejects a concurrent one, streams events and serves the record", async () => {
    const llm = gatedLlm();
    const s = server(llm);
    app = s.app;
    const first = await app.inject({ method: "POST", url: "/runs", payload: { prompt: PROMPT } });
    expect(first.statusCode).toBe(202);
    const { runId } = first.json();
    const second = await app.inject({ method: "POST", url: "/runs", payload: { prompt: PROMPT } });
    expect(second.statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/batches" })).statusCode).toBe(409);
    expect((await app.inject(`/runs/${runId}`)).json()).toMatchObject({ type: "pending" });

    const live = app.inject(`/runs/${runId}/events`); // subscribes while the run is held
    llm.release();
    const streamed = await live;
    expect(streamed.headers["content-type"]).toBe("text/event-stream");
    const types = sseEvents(streamed.body).map((e) => e.type);
    expect(types[0]).toBe("run-started");
    expect(types.at(-1)).toBe("run-finished");
    expect(types).toHaveLength(8);

    const replay = await app.inject(`/runs/${runId}/events`);
    expect(sseEvents(replay.body).map((e) => e.type)).toEqual(types);

    const record = (await app.inject(`/runs/${runId}`)).json();
    expect(record.type).toBe("run-finished");
    expect(record.record.runId).toBe(runId);
    expect(record.record.taskSource).toBe("preset");
    expect(record.record.sides.baseline.outcome).toBe("wrong");
    expect(record.record.sides.skeptique.outcome).toBe("correct");
    expect(record.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.paid.sort()).toEqual([GAMER.endpoint, GOOD.endpoint].sort());
    expect((await app.inject({ method: "POST", url: "/runs", payload: { prompt: PROMPT } })).statusCode).toBe(202);
  });

  it("rejects a bad prompt and unknown ids", async () => {
    app = server().app;
    expect((await app.inject({ method: "POST", url: "/runs", payload: { prompt: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/runs", payload: {} })).statusCode).toBe(400);
    expect((await app.inject("/runs/nope")).statusCode).toBe(404);
    expect((await app.inject("/runs/nope/events")).statusCode).toBe(404);
    expect((await app.inject("/batches/nope/events")).statusCode).toBe(404);
  });

  it("rejects requests for any host other than 127.0.0.1 or localhost on its port", async () => {
    app = server().app;
    expect((await app.inject({ url: "/health", headers: { host: "127.0.0.1:80" } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/health", headers: { host: "evil.test:80" } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/health", headers: { host: "localhost:4320" } })).statusCode).toBe(403);
    const post = await app.inject({ method: "POST", url: "/batches", headers: { host: "evil.test" } });
    expect(post.statusCode).toBe(403);
  });

  it("sends CORS headers for the configured origin", async () => {
    app = server().app;
    const health = await app.inject("/health");
    expect(health.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const preflight = await app.inject({ method: "OPTIONS", url: "/runs" });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });
});

describe("arena server: batches", () => {
  it("runs the whole task pack and publishes a hashed scoreboard", async () => {
    const s = server();
    app = s.app;
    const started = await app.inject({ method: "POST", url: "/batches" });
    expect(started.statusCode).toBe(202);
    const { batchId } = started.json();
    let events: BatchEvent[] = [];
    await waitFor(async () => {
      events = sseEvents((await app?.inject(`/batches/${batchId}/events`))?.body ?? "");
      return events.at(-1)?.type === "batch-finished";
    });

    expect(events[0]).toMatchObject({
      type: "batch-started",
      batchId,
      tasks: TASK_PACK.map(({ id, prompt }) => ({ id, prompt })),
    });
    const tasks = events.filter((e) => e.type === "batch-task");
    expect(tasks.map((e) => e.taskId)).toEqual(TASK_PACK.map((t) => t.id));
    // The gamer echoes its input, so it is only right on -40 °C → °F; baseline buys the popular stale FX.
    expect(tasks.find((e) => e.taskId === "suite-mix")?.sides.baseline).toMatchObject({
      outcome: "partial",
      correctParts: 1,
      totalParts: 3,
    });
    expect(tasks.find((e) => e.taskId === "usd-inr")?.sides).toEqual({
      baseline: {
        outcome: "wrong",
        answeredCorrect: false,
        noAnswer: false,
        paidTinybars: "1000",
        wastedTinybars: "1000",
        correctParts: 0,
        totalParts: 1,
      },
      skeptique: {
        outcome: "correct",
        answeredCorrect: true,
        noAnswer: false,
        paidTinybars: "1000",
        wastedTinybars: "0",
        correctParts: 1,
        totalParts: 1,
      },
    });

    const finished = events.at(-1);
    if (finished?.type !== "batch-finished") throw new Error("no batch-finished");
    expect(finished.scoreboard).toEqual({
      tasks: 8,
      sides: {
        baseline: {
          answeredCorrect: 0,
          noAnswer: 0,
          correctParts: 1,
          totalParts: 17,
          correct: 0,
          partial: 1,
          wrong: 7,
          refused: 0,
          blocked: 0,
          error: 0,
          totalTinybars: "17000",
          wastedTinybars: "16000",
          paidToCorrectShare: 1 / 17,
        },
        skeptique: {
          answeredCorrect: 8,
          noAnswer: 0,
          correctParts: 17,
          totalParts: 17,
          correct: 8,
          partial: 0,
          wrong: 0,
          refused: 0,
          blocked: 0,
          error: 0,
          totalTinybars: "17000",
          wastedTinybars: "0",
          paidToCorrectShare: 1,
        },
      },
    });
    expect(finished.runHashes).toEqual(tasks.map((e) => e.hash));
    expect(finished.hash).toBe(hashBatch(finished.scoreboard, finished.runHashes));
    expect(hashBatch(finished.scoreboard, finished.runHashes.slice(1))).not.toBe(finished.hash);

    // Every task is a normal run: its record is served and hashes to the published run hash.
    const first = tasks[0];
    const run = (await app.inject(`/runs/${first?.runId}`)).json();
    expect(run.hash).toBe(first?.hash);
    expect((await app.inject("/health")).json().busy).toBe(false);
    expect((await app.inject({ method: "POST", url: "/batches" })).statusCode).toBe(202);
  });

  it("holds the run lock while a batch is in progress", async () => {
    const llm = gatedLlm();
    app = server(llm).app;
    expect((await app.inject({ method: "POST", url: "/batches" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/runs", payload: { prompt: PROMPT } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/batches" })).statusCode).toBe(409);
    llm.release();
    await waitFor(async () => (await app?.inject("/health"))?.json().busy === false);
  });
});

describe("arena server: user credentials", () => {
  const KEY = `0x${"ab".repeat(32)}`;
  const API_KEY = "sk-ant-test-0123456789-secret";
  const credentials = { hederaAccountId: "0.0.4242", hederaPrivateKey: KEY, anthropicApiKey: API_KEY };

  it("lists the allowed models and says it accepts user credentials", async () => {
    app = server().app;
    expect((await app.inject("/health")).json()).toMatchObject({
      models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
      acceptsUserCredentials: true,
    });
  });

  it("rejects invalid credentials and the seller account with 400, without echoing them", async () => {
    app = server().app;
    const bad = [
      { ...credentials, hederaAccountId: "4242" },
      { ...credentials, hederaPrivateKey: "not-a-key" },
      { ...credentials, hederaPrivateKey: KEY.slice(0, 20) },
      { ...credentials, model: "claude-opus-5-5" },
      { ...credentials, anthropicApiKey: "short" },
      { hederaAccountId: "0.0.4242" },
      { ...credentials, hederaAccountId: SELLER },
    ];
    for (const c of bad) {
      for (const [url, payload] of [
        ["/runs", { prompt: PROMPT, credentials: c }],
        ["/batches", { credentials: c }],
      ] as const) {
        const res = await app.inject({ method: "POST", url, payload });
        expect(res.statusCode, JSON.stringify(c)).toBe(400);
        expect(res.body).toContain("credentials");
        expect(res.body).not.toContain(KEY);
        expect(res.body).not.toContain("not-a-key");
      }
    }
    expect((await app.inject("/health")).json().busy).toBe(false);
  });

  it("pays from the user's account on both sides with the user's model and key, and never leaks the keys", async () => {
    const userPaid: string[] = [];
    const pay = fakePay(userPaid);
    // A payment library error that quotes the key must not carry it into the record or the stream.
    const leaky: typeof pay = async (a) => {
      if (a.url === GOOD.endpoint) throw new Error(`signing failed for ${KEY} (${KEY.slice(2)})`);
      return pay(a);
    };
    const s = server(scriptedLlm(), leaky);
    app = s.app;
    const started = await app.inject({
      method: "POST",
      url: "/runs",
      payload: { prompt: PROMPT, credentials: { ...credentials, model: "claude-sonnet-5-5" } },
    });
    expect(started.statusCode).toBe(202);
    const { runId } = started.json();
    let body = "";
    await waitFor(async () => {
      body = (await app?.inject(`/runs/${runId}/events`))?.body ?? "";
      return body.includes("event: run-finished");
    });
    const { record, hash } = (await app.inject(`/runs/${runId}`)).json();
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s.llmRequests).toEqual([{ model: "claude-sonnet-5-5", apiKey: API_KEY }]);
    expect(record).toMatchObject({ credentialSource: "user", version: 3 });
    expect(record.agents.baseline.payer).toBe("0.0.4242");
    expect(record.agents.skeptique.payer).toBe("0.0.4242");
    expect(s.paid).toEqual([]); // the server wallets paid nothing
    expect(userPaid).toEqual([GAMER.endpoint]);
    expect(record.sides.skeptique.parts[0].error).toContain("[redacted]");
    for (const text of [JSON.stringify(record), body, JSON.stringify(sseEvents(body))]) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(KEY.slice(2));
      expect(text).not.toContain(API_KEY);
    }
  });
});
