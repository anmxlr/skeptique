import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.live.test.ts", "**/*.e2e.test.ts", "demo/dev2-flow.test.ts"] },
});
