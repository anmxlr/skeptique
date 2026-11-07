import { randomUUID } from "node:crypto";
import { type Approval, ApprovalRequestSchema, type SpendLimits, SpendLimitsSchema } from "@skeptique/shared";
import type { FastifyInstance } from "fastify";

const PREFIXES = ["/buyer/limits", "/buyer/approvals"];

/**
 * The buyer's spend limits and the queue of payments waiting for a human. The owner sets limits on the
 * Buyer page; the buyer agent queues an approval for any payment above the threshold and polls it.
 * Unauthenticated, like every other demo route: anyone who can reach the API can answer an approval.
 */
export function registerBuyerSpendRoutes(app: FastifyInstance): void {
  let limits: SpendLimits | null = null;
  const approvals = new Map<string, Approval>();

  // The Buyer page writes from another origin.
  app.addHook("onRequest", async (request, reply) => {
    if (!PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;
    reply.header("access-control-allow-origin", "*");
    if (request.method === "OPTIONS")
      return reply
        .header("access-control-allow-methods", "GET, POST, PUT, OPTIONS")
        .header("access-control-allow-headers", "content-type")
        .code(204)
        .send();
  });

  app.get("/buyer/limits", async () => limits);

  app.put("/buyer/limits", async (request, reply) => {
    const parsed = SpendLimitsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ reason: "Invalid spend limits" });
    limits = parsed.data;
    return limits;
  });

  app.get("/buyer/approvals", async () => [...approvals.values()]);

  app.post("/buyer/approvals", async (request, reply) => {
    const parsed = ApprovalRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ reason: "Invalid approval request" });
    const approval: Approval = {
      id: randomUUID(),
      ...parsed.data,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    approvals.set(approval.id, approval);
    return reply.code(201).send(approval);
  });

  app.get<{ Params: { id: string } }>("/buyer/approvals/:id", async (request, reply) => {
    const approval = approvals.get(request.params.id);
    return approval ?? reply.code(404).send({ reason: "Unknown approval" });
  });

  for (const [action, status] of [
    ["approve", "approved"],
    ["deny", "denied"],
  ] as const)
    app.post<{ Params: { id: string } }>(`/buyer/approvals/:id/${action}`, async (request, reply) => {
      const approval = approvals.get(request.params.id);
      if (!approval) return reply.code(404).send({ reason: "Unknown approval" });
      if (approval.status !== "pending") return reply.code(409).send({ reason: `Already ${approval.status}` });
      approval.status = status;
      return approval;
    });
}
