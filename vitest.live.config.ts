import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests that need real sponsor networks. Each live test skips itself when its keys are absent,
// e.g. `describe.skipIf(!process.env.HEDERA_RPC_URL)`.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    include: ["**/*.live.test.ts"],
    exclude: ["**/node_modules/**"],
    passWithNoTests: true,
    testTimeout: 120_000,
  },
});
