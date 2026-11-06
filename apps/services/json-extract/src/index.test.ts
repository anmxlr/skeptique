import { suiteHash, TestSuiteSchema } from "@skeptique/shared";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  createJsonExtract,
  createOpenAICompatibleExtractor,
  type JsonExtractor,
  jsonExtractExpected,
  jsonExtractSpecHash,
  jsonExtractSuite,
} from "./index";

describe("json-extract service", () => {
  it("validates and hashes a 12-case mixed suite", () => {
    expect(jsonExtractSuite.cases).toHaveLength(12);
    expect(new Set(jsonExtractSuite.cases.map((testCase) => testCase.expect.kind))).toEqual(
      new Set(["exact", "schema", "judge"]),
    );
    expect(TestSuiteSchema.safeParse(jsonExtractSuite).success).toBe(true);
    expect(jsonExtractSpecHash).toBe(suiteHash(jsonExtractSuite));
  });

  it("passes at least 85 percent with a deterministic LLM stub and validates output", async () => {
    const fixtures = new Map(
      jsonExtractSuite.cases.map((testCase) => [
        (testCase.input as { text: string }).text,
        jsonExtractExpected[testCase.id],
      ]),
    );
    const llm: JsonExtractor = { extract: async (text) => fixtures.get(text) };
    const handle = createJsonExtract(llm);
    let passed = 0;
    for (const testCase of jsonExtractSuite.cases) {
      const output = await handle({ ...(testCase.input as object), caseId: testCase.id });
      if (testCase.expect.kind === "exact" && JSON.stringify(output) === JSON.stringify(testCase.expect.value))
        passed++;
      if (testCase.expect.kind === "schema" && new Ajv().validate(testCase.expect.schema, output)) passed++;
      if (
        testCase.expect.kind === "regex" &&
        typeof output === "string" &&
        new RegExp(testCase.expect.pattern).test(output)
      )
        passed++;
      if (
        testCase.expect.kind === "judge" &&
        JSON.stringify(output) === JSON.stringify(jsonExtractExpected[testCase.id])
      )
        passed++;
    }
    expect((passed / jsonExtractSuite.cases.length) * 100).toBeGreaterThanOrEqual(85);
  });

  it("rejects a provider response that does not match the requested fields schema", async () => {
    const handle = createJsonExtract({ extract: async () => ({ unexpected: "value" }) });
    await expect(handle({ text: "name: Ria", fields: ["name"] })).rejects.toThrow("schema");
  });

  it("bounds a stalled provider request and propagates cancellation to fetch", async () => {
    let signal: AbortSignal | null | undefined;
    const extractor = createOpenAICompatibleExtractor({
      apiKey: "fixture",
      model: "fixture",
      timeoutMs: 10,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal;
          signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
        }),
    });
    await expect(extractor.extract("name: Mira", ["name"])).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });

  it("rejects invalid provider deadlines before making a request", () => {
    for (const timeoutMs of [0, -1, NaN, Infinity]) {
      expect(() => createOpenAICompatibleExtractor({ apiKey: "fixture", model: "fixture", timeoutMs })).toThrow(
        "timeoutMs",
      );
    }
  });
});
