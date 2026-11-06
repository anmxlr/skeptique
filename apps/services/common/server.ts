import { createServer, type IncomingMessage, type Server } from "node:http";
import type { TestSuite } from "@skeptique/shared";
import { suiteHash } from "@skeptique/shared";
import { createPaywall, type Paywall } from "./paywall";
import { reportPaidCalls } from "./report";

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
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    // The suite and health are public; the seller form reads the suite from the browser.
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(value));
}

export function createServiceServer(service: DemoService, options: { paywall?: Paywall } = {}): Server {
  const { paywall } = options;
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/health")
      return send(response, 200, { status: "ok", service: service.name });
    if (request.method === "GET" && url.pathname === "/suite.json") return send(response, 200, service.suite);
    if (request.method !== "POST" || url.pathname !== "/call") return send(response, 404, { error: "Not found" });
    try {
      if (paywall && !(await paywall.guard(request, response))) return;
      const input = await readJson(request);
      const result = await service.handle(input);
      if (!paywall) return send(response, 200, result);
      const settled = await paywall.settle(request);
      if ("failure" in settled) {
        response.writeHead(settled.failure.status, {
          "content-type": "application/json; charset=utf-8",
          ...settled.failure.headers,
        });
        return response.end(JSON.stringify(settled.failure.body ?? {}));
      }
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "PAYMENT-RESPONSE",
        ...settled.headers,
      });
      return response.end(JSON.stringify(result));
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
  options: { paywall?: Paywall } = {},
): Promise<{ server: Server; url: string }> {
  const server = createServiceServer(service, options);
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

/** A paywall when the x402 env is present (facilitator + seller account), otherwise null: local mode stays free. */
export async function paywallFromEnv(
  price: string,
  env: Record<string, string | undefined> = process.env,
): Promise<Paywall | null> {
  const facilitatorUrl = env.X402_FACILITATOR_URL;
  const payTo = env.SELLER_ACCOUNT_ID;
  if (!facilitatorUrl || !payTo) return null;
  const { API_URL: apiUrl, SERVICE_ID: serviceId } = env;
  return createPaywall({
    facilitatorUrl,
    payTo,
    price,
    onSettled: (txId, payer) => {
      console.log(`x402 settled ${txId}`);
      if (apiUrl && serviceId !== undefined) void reportPaidCalls({ apiUrl, serviceId: Number(serviceId) })(txId, payer);
    },
  });
}
