import { expect, test } from "@playwright/test";
import { NAV_ITEMS } from "../lib/nav";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`web shell at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const { href, label } of NAV_ITEMS) {
      test(`renders the ${label} page`, async ({ page }) => {
        await page.goto(href);

        await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
        const nav = page.getByRole("navigation", { name: "Main" });
        for (const item of NAV_ITEMS) await expect(nav.getByRole("link", { name: item.label })).toBeVisible();
        await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test("nav links move between pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Buyer" }).click();
  await expect(page).toHaveURL(/\/buyer$/);
  await expect(page.getByRole("heading", { level: 1, name: "Buyer" })).toBeVisible();
});

test("theme toggle switches between light and dark and remembers the choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).toBe("rgb(12, 10, 9)");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
