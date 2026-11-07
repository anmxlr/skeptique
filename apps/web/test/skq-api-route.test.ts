import { describe, expect, it } from "vitest";
import { POST } from "../app/skq-api/[...path]/route";

describe("built-in read-only API route", () => {
  it("refuses writes: evidence, onboarding and spend state cannot live in a stateless function", async () => {
    const res = await POST();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });
});
