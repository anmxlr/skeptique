export const runtime = "nodejs";

async function proxy(request: Request, context: { params: Promise<{ resource: string }> }) {
  if (process.env.SKEPTIQUE_LAB_ENABLED !== "1")
    return Response.json(
      { error: "The local lab is disabled. Start it with pnpm lab:api and pnpm lab:web." },
      { status: 503 },
    );
  const { resource } = await context.params;
  if (!["services", "runs"].includes(resource) || (request.method === "POST" && resource !== "runs"))
    return Response.json({ error: "Not found" }, { status: 404 });
  // This development-only proxy has a fixed loopback target and accepts no user-provided URLs.
  const origin = request.headers.get("origin");
  let sameOrigin = !origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      sameOrigin =
        ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && parsed.host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
  }
  if (request.method === "POST" && (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site"))
    return Response.json({ error: "Use the lab from this browser origin." }, { status: 403 });
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && body.length > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
    const response = await fetch(`http://127.0.0.1:4318/${resource}`, {
      method: request.method,
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "The local test runner is unavailable. Start pnpm lab:api, then retry." },
      { status: 503 },
    );
  }
}

export { proxy as GET, proxy as POST };
