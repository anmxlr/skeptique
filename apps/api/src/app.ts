import Fastify, { type FastifyServerOptions } from "fastify";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.get("/health", async () => ({ ok: true }));
  return app;
}
