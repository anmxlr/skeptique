import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { exclude: [...configDefaults.exclude, "playwright/**", "**/*.live.test.ts", "**/*.e2e.test.ts"] },
});
