import { configDefaults, defineConfig } from "vitest/config";

// The harness is exercised by `pnpm e2e`; it has no unit tests of its own.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.live.test.ts", "**/*.e2e.test.ts"], passWithNoTests: true },
});
