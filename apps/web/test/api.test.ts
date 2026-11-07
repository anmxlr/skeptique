import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, apiUrl, createApiClient, fetchService } from "../lib/api";

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

  it("keeps a path prefix in the base URL, so the API can be served from /skq-api on the web origin", async () => {
    const fetchImpl = vi.fn(async () => Response.json([]));
    const client = createApiClient("https://web.test/skq-api", fetchImpl as unknown as typeof fetch);

    await client.get("/services");
    await fetchService(1, "https://web.test/skq-api/", fetchImpl as unknown as typeof fetch);
    expect((fetchImpl.mock.calls as unknown[][]).map((call) => String(call[0]))).toEqual([
      "https://web.test/skq-api/services",
      "https://web.test/skq-api/services/1",
    ]);
    expect(String(apiUrl("/events", "https://web.test/skq-api"))).toBe("https://web.test/skq-api/events");
  });

  it("throws ApiError with the status on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    const client = createApiClient("http://api.test", fetchImpl as unknown as typeof fetch);

    await expect(client.get("/health")).rejects.toEqual(new ApiError(503, "/health"));
  });

  it("requires NEXT_PUBLIC_API_URL instead of falling back to a hard-coded URL", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(() => apiClient()).toThrow("NEXT_PUBLIC_API_URL must be set");
  });
});
