import { defineConfig, devices } from "@playwright/test";
import { PLAYWRIGHT_PUBLIC_ENV } from "./playwright/fixtures";

const port = 3107;

export default defineConfig({
  testDir: "playwright",
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Desktop Chrome"] },
  webServer: {
    command: `pnpm exec next dev --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    env: PLAYWRIGHT_PUBLIC_ENV,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
