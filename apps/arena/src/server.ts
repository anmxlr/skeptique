import { randomUUID } from "node:crypto";
import { type ServiceView, ServiceViewSchema } from "@skeptique/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { Llm } from "./llm";
import { runArena, type SideConfig } from "./runner";
import type { ArenaEvent, ArenaRecord, Side } from "./schema";
import { parseTask, TASK_PACK } from "./tasks";

export type ArenaServerDeps = {
  apiUrl: string;
  llm: Llm;
  sides: Record<Side, SideConfig>;
  network: ArenaRecord["network"];
  /** Origin allowed to call the arena from a browser (the web app). */
  webOrigin: string;
  /** Startup facts shown in the UI, e.g. which endpoints answered 402 without payment. */
  health?: () => Record<string, unknown>;
  fetchImpl?: typeof fetch;
};

type RunState = { events: ArenaEvent[]; listeners: Set<(e: ArenaEvent) => void>; done: boolean };

const RunRequestSchema = z.object({ prompt: z.string().trim().min(3).max(300) });
const KEEPALIVE_MS = 15_000;
const MAX_RUNS = 50;

export function buildArenaServer(deps: ArenaServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const runs = new Map<string, RunState>();
  let busy = false;
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.addHook("onRequest", async (req, reply) => {
    reply.header("access-control-allow-origin", deps.webOrigin);
    reply.header("access-control-allow-headers", "content-type");
    reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
    reply.header("cache-control", "no-store");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

  async function listServices(): Promise<ServiceView[]> {
    const res = await fetchImpl(new URL("/services", deps.apiUrl));
    if (!res.ok) throw new Error(`GET /services responded ${res.status}`);
    return ServiceViewSchema.array().parse(await res.json());
  }

  app.get("/health", async () => ({
    ok: true,
    model: deps.llm.model,
    network: deps.network,
    apiUrl: deps.apiUrl,
    busy,
    ...deps.health?.(),
  }));

  app.get("/tasks", async () => TASK_PACK.map(({ id, prompt, why }) => ({ id, prompt, why })));

  app.post("/runs", async (req, reply) => {
    const body = RunRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "prompt must be 3-300 characters" });
    // One run at a time: both agents share the demo wallet and the budget is per run.
    if (busy) return reply.code(409).send({ error: "a run is in progress" });
    busy = true;
    const runId = randomUUID();
    const state: RunState = { events: [], listeners: new Set(), done: false };
    runs.set(runId, state);
    if (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value as string);
    const emit = (event: ArenaEvent) => {
      state.events.push(event);
      for (const listener of state.listeners) listener(event);
    };
    void (async () => {
      try {
        const [task, services] = await Promise.all([parseTask(deps.llm, body.data.prompt), listServices()]);
        await runArena({
          runId,
          prompt: body.data.prompt,
          task,
          services,
          apiUrl: deps.apiUrl,
          llm: deps.llm,
          sides: deps.sides,
          network: deps.network,
          emit,
        });
      } catch (error) {
        emit({ type: "run-failed", error: error instanceof Error ? error.message : String(error) });
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

  // SSE: replays every event so far, then streams the rest; closes after the run ends.
  app.get<{ Params: { id: string } }>("/runs/:id/events", (req, reply) => {
    const state = runs.get(req.params.id);
    if (!state) return reply.code(404).send({ error: "unknown run" });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "access-control-allow-origin": deps.webOrigin,
    });
    let closed = false;
    const send = (event: ArenaEvent) => {
      if (closed) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "run-finished" || event.type === "run-failed") close();
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
  });

  return app;
}
