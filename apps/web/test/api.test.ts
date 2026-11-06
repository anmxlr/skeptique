import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, createApiClient } from "../lib/api";

describe("typed API client", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects incomplete or wrong-chain deployment data before it can supply contract addresses", async () => {
    const client = createApiClient("http://api.test", (async () =>
      Response.json({ chainId: 1, contracts: {} })) as typeof fetch);
    await expect(client.getDeployment()).rejects.toThrow();
  });

  it("GETs a route relative to the base URL and returns its body", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, chainId: 296 }));
    const client = createApiClient("http://api.test", fetchImpl as unknown as typeof fetch);

    await expect(client.get("/health")).resolves.toEqual({ ok: true, chainId: 296 });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe("http://api.test/health");
  });

  it("throws ApiError with the status on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    const client = createApiClient("http://api.test", fetchImpl as unknown as typeof fetch);

    await expect(client.get("/health")).rejects.toEqual(new ApiError(503, "/health"));
  });

  it("POSTs JSON and hands back refusals with their status and body instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ reason: "expired" }, { status: 403 }));
    const client = createApiClient("http://api.test", fetchImpl as unknown as typeof fetch);

    await expect(client.post("/world/verify", { a: 1 })).resolves.toEqual({ status: 403, body: { reason: "expired" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://api.test/world/verify");
    expect(init).toMatchObject({ method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } });
  });

  it("requires NEXT_PUBLIC_API_URL instead of falling back to a hard-coded URL", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(() => apiClient()).toThrow("NEXT_PUBLIC_API_URL must be set");
  });
});
