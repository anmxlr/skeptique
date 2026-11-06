import { expect, test } from "@playwright/test";
import { suiteHash } from "@skeptique/shared";

test("seller previews the canonical suite hash in the actual browser", async ({ page }) => {
  const suite = {
    version: 1 as const,
    serviceName: "unit-convert",
    category: "conversion",
    determinism: "none" as const,
    cases: [{ id: "one", input: { value: 1 }, expect: { kind: "exact" as const, value: 100 }, weight: 1 }],
  };
  await page.route("https://suite.example.test/suite.json", (route) =>
    route.fulfill({
      json: suite,
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto("/sell");
  await page.getByLabel("Name", { exact: true }).fill(suite.serviceName);
  await page.getByLabel("Category", { exact: true }).fill(suite.category);
  await page.getByLabel(/^Endpoint/).fill("https://suite.example.test/call");
  await page.getByLabel("Price per call (HBAR)", { exact: true }).fill("0.00000001");
  await page.getByLabel(/^Listing fee \(HBAR\)/).fill("20");
  await page.getByRole("button", { name: "Show suite hash" }).click();
  await expect(page.getByText(`Suite hash: ${suiteHash(suite)}`)).toBeVisible();
});
