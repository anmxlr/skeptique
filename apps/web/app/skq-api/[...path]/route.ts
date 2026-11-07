import { buildChainApp } from "@skeptique/api/chain-app";
import { DeploymentSchema } from "@skeptique/shared/deployment";
import manifest from "../../../../../contracts/deployments/hedera-testnet.json";

/*
 * The API's read-only routes, served by a Vercel function on the web origin: NEXT_PUBLIC_API_URL=<site>/skq-api.
 * It reads everything from the chain per request. World onboarding, evidence uploads, buyer spend state and the
 * /events stream need a long-running API (`pnpm --filter @skeptique/api start`), so they are refused here.
 * When SKQ_API_PROXY is set, next.config rewrites /skq-api to that API instead and this route is never reached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let app: ReturnType<typeof buildChainApp> | undefined;

function chainApp() {
  const rpcUrl = process.env.HEDERA_RPC_URL;
  if (!rpcUrl) throw new Error("HEDERA_RPC_URL must be set");
  app ??= buildChainApp({
    rpcUrl,
    deployment: DeploymentSchema.parse(manifest),
    ensParentName: process.env.ENS_PARENT_NAME,
    readOnly: true,
  }).catch((cause: unknown) => {
    app = undefined; // retry on the next request instead of caching a failed start
    throw cause;
  });
  return app;
}

const PASSED_HEADERS = ["content-type", "cache-control", "access-control-allow-origin"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/skq-api/, "") || "/";
  if (path === "/events") return new Response("Live events need the standalone API", { status: 404 });
  let api: Awaited<ReturnType<typeof chainApp>>;
  try {
    api = await chainApp();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "API failed to start";
    return Response.json({ error: message }, { status: 503 });
  }
  const res = await api.inject({ method: "GET", url: `${path}${url.search}` });
  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = res.headers[name];
    if (value !== undefined) headers.set(name, String(value));
  }
  return new Response(new Uint8Array(res.rawPayload), { status: res.statusCode, headers });
}

function readOnly() {
  return new Response("This API is read-only", { status: 405, headers: { allow: "GET" } });
}

export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
