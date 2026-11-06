import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { exclude: [...configDefaults.exclude, "**/*.live.test.ts", "**/*.e2e.test.ts"] },
});
