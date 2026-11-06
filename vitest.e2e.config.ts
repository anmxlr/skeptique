import { defineConfig } from "vitest/config";

// End-to-end tests against the local stack; ticket 07 adds the harness globalSetup.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts", "{apps,packages}/**/*.e2e.test.ts", "scripts/demo/dev2-flow.test.ts"],
    exclude: ["**/node_modules/**"],
    passWithNoTests: true,
    testTimeout: 60_000,
  },
});
