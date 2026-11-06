import { defineConfig } from "vitest/config";

// End-to-end tests against the local stack; ticket 07 adds the harness globalSetup.
export default defineConfig({
  // e2e tests render web components (apps/web) with the automatic JSX runtime.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["e2e/**/*.e2e.test.ts", "{apps,packages}/**/*.e2e.test.ts", "scripts/demo/dev2-flow.test.ts"],
    exclude: ["**/node_modules/**"],
    passWithNoTests: true,
    // Each worker boots an EVM or a Next build; bound concurrency to avoid startup starvation.
    maxWorkers: 2,
    testTimeout: 60_000,
  },
});
