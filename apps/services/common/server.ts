import { createServer, type IncomingMessage, type Server } from "node:http";
import type { TestSuite } from "@skeptic/shared";
import { suiteHash } from "@skeptic/shared";

export type DemoService = {
  name: string;
  suite: TestSuite;
  specHash: string;
  handle(input: unknown): Promise<unknown> | unknown;
};

export function defineService(name: string, suite: TestSuite, handle: DemoService["handle"]): DemoService {
  return { name, suite, specHash: suiteHash(suite), handle };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function send(response: import("node:http").ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export function createServiceServer(service: DemoService): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/health")
      return send(response, 200, { status: "ok", service: service.name });
    if (request.method === "GET" && url.pathname === "/suite.json") return send(response, 200, service.suite);
    if (request.method !== "POST" || url.pathname !== "/call") return send(response, 404, { error: "Not found" });
    try {
      const input = await readJson(request);
      return send(response, 200, await service.handle(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Service request failed";
      const status = message.includes("too large")
        ? 413
        : message.includes("valid JSON")
          ? 400
          : message.startsWith("Unsupported currency pair")
            ? 422
            : 500;
      return send(response, status, { error: message });
    }
  });
}

export async function startService(
  service: DemoService,
  port = Number(process.env.PORT ?? 0),
  host = "127.0.0.1",
): Promise<{ server: Server; url: string }> {
  const server = createServiceServer(service);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start service server");
  return { server, url: `http://${host}:${address.port}` };
}
