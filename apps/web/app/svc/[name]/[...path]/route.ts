import { serviceByName } from "@skeptique/services";
import { paywallFromEnv, startService } from "@skeptique/services/server";

/*
 * The demo services, served from the web origin so they can be listed at a public endpoint:
 * <site>/svc/<name>/call (and <site>/svc/<name>/suite.json, which the API verifies against the listing's specHash).
 * Each function instance starts the unchanged service server on a loopback port and forwards to it. With
 * X402_FACILITATOR_URL and SELLER_ACCOUNT_ID set, /call is paywalled by x402 exactly as in `pnpm ... start`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const origins = new Map<string, Promise<string>>();

function serviceOrigin(name: string): Promise<string> | undefined {
  const service = serviceByName(name);
  if (!service) return undefined;
  let origin = origins.get(name);
  if (!origin) {
    origin = paywallFromEnv(process.env.PRICE_PER_CALL ?? "1", {
      X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
      SELLER_ACCOUNT_ID: process.env.SELLER_ACCOUNT_ID,
    })
      .then((paywall) => startService(service, 0, "127.0.0.1", { paywall: paywall ?? undefined }))
      .then(({ url }) => url)
      .catch((cause: unknown) => {
        origins.delete(name); // retry on the next request instead of caching a failed start
        throw cause;
      });
    origins.set(name, origin);
  }
  return origin;
}

// Hop-by-hop or recomputed by fetch; never copied between the two legs.
const DROPPED = new Set(["host", "connection", "content-length", "content-encoding", "transfer-encoding"]);

type Context = { params: Promise<{ name: string; path: string[] }> };

async function forward(request: Request, { params }: Context): Promise<Response> {
  const { name, path } = await params;
  const origin = serviceOrigin(name);
  if (!origin) return Response.json({ error: "Unknown service" }, { status: 404 });
  const target = `${await origin}/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROPPED.has(key)) headers.set(key, value);
  });
  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
  });
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!DROPPED.has(key)) out.set(key, value);
  });
  return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
}

export const GET = forward;
export const POST = forward;
