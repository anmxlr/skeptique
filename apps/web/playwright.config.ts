import { defineConfig, devices } from "@playwright/test";

const port = 3107;
/** Never a real host (.test is reserved); playwright/quality.spec.ts answers it with fixtures via page.route. */
export const MOCK_API_URL = "http://api.skeptique.test";

export default defineConfig({
  testDir: "playwright",
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Desktop Chrome"] },
  webServer: {
    command: `pnpm exec next dev --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    env: { NEXT_PUBLIC_API_URL: MOCK_API_URL },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
