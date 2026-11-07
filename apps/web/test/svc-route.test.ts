import { suiteHash } from "@skeptique/shared";
import { describe, expect, it } from "vitest";
import { GET, POST } from "../app/svc/[name]/[...path]/route";

const params = (name: string, ...path: string[]) => ({ params: Promise.resolve({ name, path }) });

describe("demo services served from the web origin at /svc/<name>", () => {
  it("serves a service's public suite, so a listing at <site>/svc/<name>/call verifies", async () => {
    const res = await GET(
      new Request("https://web.test/svc/unit-convert/suite.json"),
      params("unit-convert", "suite.json"),
    );
    expect(res.status).toBe(200);
    const suite = await res.json();
    expect(suite.serviceName).toBe("unit-convert");
    expect(suiteHash(suite)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("runs a call (free without x402 config) and 404s an unknown service", async () => {
    const call = await POST(
      new Request("https://web.test/svc/unit-convert/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: 1, from: "km", to: "m" }),
      }),
      params("unit-convert", "call"),
    );
    expect(call.status).toBe(200);
    expect((await GET(new Request("https://web.test/svc/nope/suite.json"), params("nope", "suite.json"))).status).toBe(
      404,
    );
  });
});
