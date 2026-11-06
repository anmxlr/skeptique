import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("evaluates real services, reveals the gaming failure and exports evidence", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(page.getByRole("heading", { name: "Evaluation report" })).toBeVisible();
  const gamer = page.getByRole("button", { name: /Suite gamer.*40\/100/ });
  await expect(gamer).toBeVisible();
  await gamer.click();
  await page.getByLabel("Failed only").check();
  await page.getByRole("button", { name: /Fail probe-meter-3m/ }).click();
  const evidence = page.getByRole("region", { name: "Case evidence" });
  await expect(evidence).toContainText('"result": 300');
  await expect(evidence).toContainText('"result": 3');
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^skeptique-.*\.json$/);
  const path = await download.path();
  if (!path) throw new Error("Evidence export was not saved");
  const report = JSON.parse(await readFile(path, "utf8"));
  expect(report.mode).toBe("local-fixture");
  expect(report.results.map((r: { score: number }) => r.score)).toEqual([100, 40]);
  const violations = (await new AxeBuilder({ page }).include("#main").analyze()).violations;
  expect(violations).toEqual([]);
  await page.screenshot({ path: "/private/tmp/skeptique-lab-desktop.png", fullPage: true });
});

test("enforces the budget and reports an injected outage", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Shared call budget").fill("2");
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(
    page.getByText("Call budget exhausted; evaluation stopped before the next request.").first(),
  ).toBeVisible();
  await page.getByLabel("Shared call budget").fill("100");
  await page.getByLabel("Environment").selectOption("outage");
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(page.getByRole("button", { name: /Suite gamer.*0\/100/ })).toBeVisible();
});

test("works on mobile and explains implemented versus planned capabilities", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Testing lab", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run evaluation" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("tab", { name: "What we have built" }).click();
  await expect(page.getByRole("heading", { name: "RL training" })).toBeVisible();
  await expect(page.getByText(/No training loop or model updates here/)).toBeVisible();
  expect((await new AxeBuilder({ page }).include("#main").analyze()).violations).toEqual([]);
  await page.screenshot({ path: "/private/tmp/skeptique-lab-mobile.png", fullPage: true });
});
