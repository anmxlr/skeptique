import { describe, expect, it } from "vitest";
import { missingKeys, parseEnv } from "../env-check.mjs";

const example = `# Hedera\nHEDERA_RPC_URL=\n# World\nWORLD_CLIENT_ID=\nWORLD_CLIENT_SECRET=\n`;

describe("env check", () => {
  it("names every key from .env.example that .env lacks", () => {
    expect(missingKeys(example, "HEDERA_RPC_URL=https://rpc\n")).toEqual([
      "WORLD_CLIENT_ID",
      "WORLD_CLIENT_SECRET",
    ]);
  });

  it("treats an empty value as missing", () => {
    expect(missingKeys(example, "HEDERA_RPC_URL=\nWORLD_CLIENT_ID=a\nWORLD_CLIENT_SECRET=b")).toEqual([
      "HEDERA_RPC_URL",
    ]);
  });

  it("accepts values from the process env", () => {
    expect(missingKeys(example, "", { HEDERA_RPC_URL: "x", WORLD_CLIENT_ID: "y", WORLD_CLIENT_SECRET: "z" })).toEqual(
      [],
    );
  });

  it("parses quotes, export and inline comments", () => {
    const env = parseEnv(`export A="1 # not a comment"\nB='2'\nC=3 # note\n# D=4`);
    expect(Object.fromEntries(env)).toEqual({ A: "1 # not a comment", B: "2", C: "3" });
  });
});
