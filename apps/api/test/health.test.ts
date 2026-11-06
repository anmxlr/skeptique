import { afterAll, expect, it } from "vitest";
import { buildApp } from "../src/app";

const app = buildApp();
afterAll(() => app.close());

it("GET /health returns ok", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
});
