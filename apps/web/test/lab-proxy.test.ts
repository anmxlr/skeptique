import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/lab/[resource]/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const context = { params: Promise.resolve({ resource: "runs" }) };

describe("local lab proxy", () => {
  it("is disabled unless the preview is explicitly enabled", async () => {
    vi.stubEnv("SKEPTIQUE_LAB_ENABLED", "");
    expect((await GET(new Request("http://localhost:3100/api/lab/runs"), context)).status).toBe(503);
  });
  it("accepts the browser's original host when Next normalizes the internal URL", async () => {
    vi.stubEnv("SKEPTIQUE_LAB_ENABLED", "1");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ mode: "local-fixture" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost:3100/api/lab/runs", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" },
        body: "{}",
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:4318/runs");
  });
  it("rejects remote or malformed origins and unknown resources before calling the runner", async () => {
    vi.stubEnv("SKEPTIQUE_LAB_ENABLED", "1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const origin of ["https://evil.example", "not a URL", "http://localhost:4000"]) {
      const response = await POST(
        new Request("http://localhost:3100/api/lab/runs", {
          method: "POST",
          headers: { origin, host: "localhost:3100" },
          body: "{}",
        }),
        context,
      );
      expect(response.status).toBe(403);
    }
    expect(
      (
        await GET(new Request("http://localhost:3100/api/lab/unknown"), {
          params: Promise.resolve({ resource: "unknown" }),
        })
      ).status,
    ).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
