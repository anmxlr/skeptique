import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "playwright",
  testMatch: "lab.e2e.ts",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3100", ...devices["Desktop Chrome"] },
  webServer: [
    { command: "pnpm --dir ../.. lab:api", url: "http://127.0.0.1:4318/health", reuseExistingServer: !process.env.CI },
    {
      command: "pnpm --dir ../.. lab:web",
      url: "http://127.0.0.1:3100/lab",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
