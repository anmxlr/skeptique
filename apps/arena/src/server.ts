import { randomUUID } from "node:crypto";
import { type ServiceView, ServiceViewSchema } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { hashBatch, scoreBatch } from "./batch";
import type { Llm } from "./llm";
import { message, type RunArenaArgs, runArena, type SideConfig } from "./runner";
import { type ArenaEvent, type ArenaRecord, type BatchEvent, BUY_MODES, MODELS, type Model, type Side } from "./schema";
import { parseTask, TASK_PACK } from "./tasks";

export type ArenaServerDeps = {
  apiUrl: string;
  llm: Llm;
  sides: Record<Side, SideConfig>;
  network: ArenaRecord["network"];
  /** Recorded in every run, e.g. "api" or "local-chain". */
  provenance: string;
  /** Port the server listens on; requests must carry Host 127.0.0.1:<port> or localhost:<port>. */
  port: number;
  /** Origin allowed to call the arena from a browser (the web app). */
  webOrigin: string;
  /** Startup facts shown in the UI, e.g. which endpoints answered 402 without payment. */
  health?: () => Record<string, unknown>;
  fetchImpl?: typeof fetch;
  /** Builds the model for a run that brings its own model choice and optional Anthropic key. */
  llmFor: (options: { model: Model; apiKey?: string }) => Llm;
  /** A fresh payer for a run with user credentials; both sides share it, so it must serialise payments. */
  userPayAndCall: () => PayAndCall;
  /** User credentials naming this account are refused: payments to yourself move no money. */
  sellerAccountId?: string;
};

type Stream<E> = { events: E[]; listeners: Set<(e: E) => void>; done: boolean };

const ModeSchema = z.enum(BUY_MODES).default("may-refuse");
/** Optional per-request credentials. Never stored, logged or echoed: the record keeps only the account id. */
export const CredentialsSchema = z.object({
  hederaAccountId: z.string().regex(/^0\.0\.\d{1,12}$/),
  hederaPrivateKey: z.string().regex(/^(0x)?[0-9a-fA-F]{64,100}$/),
  anthropicApiKey: z.string().trim().min(20).max(300).optional(),
  model: z.enum(MODELS).default("claude-haiku-5-5"),
});
type Credentials = z.infer<typeof CredentialsSchema>;
const RunRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(300),
  mode: ModeSchema,
  credentials: CredentialsSchema.optional(),
});
const BatchRequestSchema = z
  .object({ mode: ModeSchema, credentials: CredentialsSchema.optional() })
  .default({ mode: "may-refuse" });
const KEEPALIVE_MS = 15_000;
const SERVICES_TIMEOUT_MS = 10_000;
const MAX_RUNS = 50;
const TERMINAL = new Set(["run-finished", "run-failed", "batch-finished", "batch-failed"]);
/** A 400 message naming the invalid fields, never their values (they may be keys). */
function badRequest(error: z.ZodError, fallback: string): string {
  const fields = error.issues.filter((i) => i.path[0] === "credentials").map((i) => i.path.join("."));
  return fields.length > 0 ? `invalid ${[...new Set(fields)].join(", ")}` : fallback;
}

type RunSetup = Pick<RunArenaArgs, "llm" | "sides" | "credentialSource" | "modelKeySource" | "secrets">;

/** A replayable event log: keeps the last MAX_RUNS streams in `map`. */
function openStream<E>(map: Map<string, Stream<E>>, id: string) {
  const state: Stream<E> = { events: [], listeners: new Set(), done: false };
  map.set(id, state);
  if (map.size > MAX_RUNS) map.delete(map.keys().next().value as string);
  const emit = (event: E) => {
    state.events.push(event);
    for (const listener of state.listeners) listener(event);
  };
  return { state, emit };
}

export function buildArenaServer(deps: ArenaServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const runs = new Map<string, Stream<ArenaEvent>>();
  const batches = new Map<string, Stream<BatchEvent>>();
  let busy = false;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const hosts = new Set([`127.0.0.1:${deps.port}`, `localhost:${deps.port}`]);

  app.addHook("onRequest", async (req, reply) => {
    // DNS rebinding: a page on another name that resolves to 127.0.0.1 must not drive the wallet.
    if (!hosts.has(req.headers.host ?? "")) return reply.code(403).send({ error: "forbidden host" });
    reply.header("access-control-allow-origin", deps.webOrigin);
    reply.header("access-control-allow-headers", "content-type");
    reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
    reply.header("cache-control", "no-store");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

  /** Server wallets and login, or the user's account (both sides) and model key for this run only. */
  function setup(credentials: Credentials | undefined): RunSetup {
    if (!credentials)
      return { llm: deps.llm, sides: deps.sides, credentialSource: "server", modelKeySource: "server", secrets: [] };
    const { hederaAccountId: accountId, hederaPrivateKey: privateKey, anthropicApiKey: apiKey, model } = credentials;
    const payAndCall = deps.userPayAndCall();
    const side = (s: Side): SideConfig => ({
      payAndCall,
      signer: { accountId, privateKey },
      payer: accountId,
      policy: deps.sides[s].policy,
    });
    return {
      llm: deps.llmFor({ model, apiKey }),
      sides: { baseline: side("baseline"), skeptique: side("skeptique") },
      credentialSource: "user",
      modelKeySource: apiKey ? "user" : "server",
      secrets: [
        privateKey,
        privateKey.replace(/^0x/, ""),
        privateKey.toLowerCase(),
        privateKey.toUpperCase(),
        privateKey.replace(/^0x/, "").toLowerCase(),
        apiKey ?? "",
      ],
    };
  }
  const sameAsSeller = (credentials: Credentials | undefined) =>
    credentials !== undefined && credentials.hederaAccountId === deps.sellerAccountId;
  const SELLER_ERROR = "credentials.hederaAccountId must differ from the seller account";

  async function listServices(): Promise<ServiceView[]> {
    const res = await fetchImpl(new URL("/services", deps.apiUrl), {
      signal: AbortSignal.timeout(SERVICES_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GET /services responded ${res.status}`);
    return ServiceViewSchema.array().parse(await res.json());
  }

  app.get("/health", async () => ({
    ok: true,
    model: deps.llm.model,
    network: deps.network,
    apiUrl: deps.apiUrl,
    busy,
    models: MODELS,
    acceptsUserCredentials: true,
    ...deps.health?.(),
  }));

  app.get("/tasks", async () => TASK_PACK.map(({ id, prompt, why }) => ({ id, prompt, why })));

  app.post("/runs", async (req, reply) => {
    const body = RunRequestSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: badRequest(body.error, "prompt must be 3-300 characters") });
    if (sameAsSeller(body.data.credentials)) return reply.code(400).send({ error: SELLER_ERROR });
    // One run at a time: both agents share the demo wallet and the budget is per run.
    if (busy) return reply.code(409).send({ error: "a run is in progress" });
    const run = setup(body.data.credentials);
    busy = true;
    const runId = randomUUID();
    const { state, emit } = openStream(runs, runId);
    void (async () => {
      try {
        const [{ task, source }, services] = await Promise.all([parseTask(run.llm, body.data.prompt), listServices()]);
        await runArena({
          ...run,
          runId,
          prompt: body.data.prompt,
          mode: body.data.mode,
          task,
          services,
          apiUrl: deps.apiUrl,
          network: deps.network,
          provenance: deps.provenance,
          taskSource: source,
          emit,
        });
      } catch (error) {
        emit({ type: "run-failed", error: message(error, run.secrets) });
      } finally {
        state.done = true;
        busy = false;
      }
    })();
    return reply.code(202).send({ runId });
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const state = runs.get(req.params.id);
    if (!state) return reply.code(404).send({ error: "unknown run" });
    const finished = state.events.find((e) => e.type === "run-finished");
    return finished ?? { type: "pending", events: state.events.length };
  });

  // Runs every TASK_PACK task in order through runArena, then publishes a hashed scoreboard.
  app.post("/batches", async (req, reply) => {
    const body = BatchRequestSchema.safeParse(req.body ?? undefined);
    if (!body.success)
      return reply.code(400).send({ error: badRequest(body.error, `mode must be one of ${BUY_MODES.join(", ")}`) });
    const { mode, credentials } = body.data;
    if (sameAsSeller(credentials)) return reply.code(400).send({ error: SELLER_ERROR });
    if (busy) return reply.code(409).send({ error: "a run is in progress" });
    const setupRun = setup(credentials);
    busy = true;
    const batchId = randomUUID();
    const batch = openStream(batches, batchId);
    void (async () => {
      try {
        batch.emit({ type: "batch-started", batchId, tasks: TASK_PACK.map(({ id, prompt }) => ({ id, prompt })) });
        const records: ArenaRecord[] = [];
        const runHashes: string[] = [];
        for (const [index, preset] of TASK_PACK.entries()) {
          const services = await listServices();
          const runId = randomUUID();
          const run = openStream(runs, runId);
          const { record, hash } = await runArena({
            ...setupRun,
            runId,
            prompt: preset.prompt,
            task: preset.task,
            mode,
            services,
            apiUrl: deps.apiUrl,
            network: deps.network,
            provenance: deps.provenance,
            taskSource: "preset",
            emit: run.emit,
          }).finally(() => {
            run.state.done = true;
          });
          records.push(record);
          runHashes.push(hash);
          batch.emit({ type: "batch-task", batchId, index, taskId: preset.id, runId, hash, sides: record.summary });
        }
        const scoreboard = scoreBatch(records);
        batch.emit({ type: "batch-finished", batchId, scoreboard, runHashes, hash: hashBatch(scoreboard, runHashes) });
      } catch (error) {
        batch.emit({ type: "batch-failed", batchId, error: message(error, setupRun.secrets) });
      } finally {
        batch.state.done = true;
        busy = false;
      }
    })();
    return reply.code(202).send({ batchId });
  });

  // SSE: replays every event so far, then streams the rest; closes after the run or batch ends.
  function sse<E extends { type: string }>(state: Stream<E> | undefined, req: FastifyRequest, reply: FastifyReply) {
    if (!state) return reply.code(404).send({ error: "unknown id" });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "access-control-allow-origin": deps.webOrigin,
    });
    let closed = false;
    const send = (event: E) => {
      if (closed) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (TERMINAL.has(event.type)) close();
    };
    const keepalive = setInterval(() => res.write(": keep-alive\n\n"), KEEPALIVE_MS);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(keepalive);
      state.listeners.delete(send);
      res.end();
    };
    for (const event of state.events) send(event);
    if (state.done) return close();
    state.listeners.add(send);
    req.raw.on("close", close);
  }

  app.get<{ Params: { id: string } }>("/runs/:id/events", (req, reply) => sse(runs.get(req.params.id), req, reply));
  app.get<{ Params: { id: string } }>("/batches/:id/events", (req, reply) =>
    sse(batches.get(req.params.id), req, reply),
  );

  return app;
}
