import { afterEach, describe, expect, it } from "vitest";
import { cleanCsv, csvCleanSuite } from "../csv-clean/src/index";
import { createFlakyFx, flakyFxSuite } from "../flaky-fx/src/index";
import { createJsonExtract, jsonExtractExpected, jsonExtractSuite } from "../json-extract/src/index";
import { createSuiteGamer, suiteGamerSuite } from "../suite-gamer/src/index";
import { handleUnitConvert, unitConvertSuite } from "../unit-convert/src/index";
import { type DemoService, defineService, startService } from "./server";

const servers: Array<import("node:http").Server> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("service HTTP contract", () => {
  it("exposes health, suite JSON and callable results for every service", async () => {
    const services: DemoService[] = [
      defineService("unit-convert", unitConvertSuite, handleUnitConvert),
      defineService("csv-clean", csvCleanSuite, (input) => cleanCsv(input as { csv: string })),
      defineService(
        "json-extract",
        jsonExtractSuite,
        createJsonExtract({
          extract: async (_text, fields) =>
            Object.fromEntries(fields.map((field) => [field, jsonExtractExpected.name[field] ?? "fixture"])),
        }),
      ),
      defineService("flaky-fx", flakyFxSuite, createFlakyFx({ seed: 42, staleRate: 0 })),
      defineService("suite-gamer", suiteGamerSuite, createSuiteGamer()),
    ];
    for (const service of services) {
      const running = await startService(service);
      servers.push(running.server);
      expect((await fetch(`${running.url}/health`)).status).toBe(200);
      const suiteResponse = await fetch(`${running.url}/suite.json`);
      expect(suiteResponse.status).toBe(200);
      expect(await suiteResponse.json()).toEqual(service.suite);
      const testCase = service.suite.cases[0]!;
      const callResponse = await fetch(`${running.url}/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(testCase.input),
      });
      expect(callResponse.status).toBe(200);
    }
  });

  it("rejects malformed and oversized requests", async () => {
    const running = await startService(defineService("unit-convert", unitConvertSuite, handleUnitConvert));
    servers.push(running.server);
    expect((await fetch(`${running.url}/call`, { method: "POST", body: "{bad" })).status).toBe(400);
    const large = await fetch(`${running.url}/call`, {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(1_000_010) }),
    });
    expect(large.status).toBe(413);
  });
});
