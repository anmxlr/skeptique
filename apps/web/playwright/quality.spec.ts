import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { MOCK_API_URL } from "../playwright.config";

// Fixture API responses (test data only), served for the pages' fetches so every page renders real loaded states.
const service = (id: number, name: string, median: number | null) => ({
  id,
  name,
  category: "conversion",
  endpoint: `http://127.0.0.1:400${id}/call`,
  pricePerCall: "100000",
  seller: "0x0000000000000000000000000000000000000022",
  ensName: "",
  median,
  confidence: median === null ? 0 : 0.6,
  rank: median === null ? 0 : median - 6,
  nRounds: median === null ? 0 : 1,
  lastRoundAt: median === null ? null : "2026-11-06T10:00:00.000Z",
  popularityCalls: id * 3,
  specHash: `0x${"ab".repeat(32)}`,
  bounty: "500000000",
});
const SERVICES = [service(1, "unit-convert", 100), service(2, "suite-gamer", 40), service(3, "brand-new", null)];
const CRITICS = [
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", nullifier: `0x${"0c".repeat(32)}`, stake: "1000000000" },
];
const RUNS = [
  {
    strategy: "skeptique",
    category: "conversion",
    task: { value: 3, from: "m", to: "cm" },
    pick: SERVICES[0],
    explanation: "Picked unit-convert: rank 94.0.",
    response: { result: 300, unit: "cm" },
    txId: "0.0.9185802@1793949293.996636002",
    paid: true,
    at: "2026-11-06T10:00:00.000Z",
  },
];

async function mockApi(page: Page) {
  await page.route(`${MOCK_API_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    // The event stream with no rounds yet; tests that need round events route /events themselves.
    if (path === "/events")
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
        body: "retry: 60000\n\n",
      });
    const body =
      path === "/services"
        ? SERVICES
        : path.startsWith("/services/")
          ? SERVICES.find((s) => s.id === Number(path.split("/")[2]))
          : path === "/critics"
            ? CRITICS
            : path === "/buyer/runs"
              ? RUNS
              : undefined;
    await route.fulfill(
      body === undefined
        ? { status: 404, json: { error: "Not found" }, headers: { "access-control-allow-origin": "*" } }
        : { status: 200, json: body, headers: { "access-control-allow-origin": "*" } },
    );
  });
}

const PAGES = [
  { path: "/", heading: "Marketplace" },
  { path: "/services/1", heading: "unit-convert" },
  { path: "/critics", heading: "Critics" },
  { path: "/sell", heading: "Sell" },
  { path: "/buyer", heading: "Buyer" },
  { path: "/audit", heading: "Audit" },
  { path: "/limits", heading: "Limits" },
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`walkthrough in ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const { path, heading } of PAGES) {
      test(`${path} has no accessibility violations or console errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await mockApi(page);

        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await page.waitForLoadState("networkidle");

        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  });
}

test("keyboard: the skip link comes first and moves focus to the main content", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator("main")).toBeFocused();
});

test("a failed refresh shows a readable toast over the last good buyer runs", async ({ page }) => {
  let calls = 0;
  await page.route(`${MOCK_API_URL}/buyer/runs`, async (route) => {
    calls++;
    const headers = { "access-control-allow-origin": "*" };
    // Dev mode mounts effects twice, so the first two loads succeed; refreshes after that fail.
    await route.fulfill(calls <= 2 ? { json: RUNS, headers } : { status: 503, json: {}, headers });
  });
  await page.goto("/buyer");
  const toast = page.getByRole("alert").filter({ hasText: "Could not refresh buyer runs" });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Picked unit-convert: rank 94.0.")).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include(".toast").withTags(["wcag2aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  const box = await toast.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 40);
});

test("live updates: a round phase change appears on an open service page without a reload", async ({ page }) => {
  await mockApi(page);
  let finalized = false;
  const stream = (events: string[]) => ({
    status: 200,
    headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
    // retry: reconnect quickly when this mocked response ends, as a long-lived stream would keep going.
    body: `retry: 200\n\n${events.join("")}`,
  });
  await page.route(`${MOCK_API_URL}/events`, (route) =>
    route.fulfill(
      stream([
        `event: RoundOpened\ndata: {"roundId":1,"serviceId":1,"commitEnd":1,"revealEnd":2}\n\n`,
        ...(finalized
          ? [`event: RoundFinalized\ndata: {"roundId":1,"serviceId":1,"median":88,"nReveals":3,"void":false}\n\n`]
          : []),
      ]),
    ),
  );
  await page.route(`${MOCK_API_URL}/rounds/1`, (route) =>
    route.fulfill({
      json: {
        id: 1,
        serviceId: 1,
        phase: finalized ? "finalized" : "commit",
        commitEnd: "2026-11-06T10:00:00.000Z",
        revealEnd: "2026-11-06T10:05:00.000Z",
        median: finalized ? 88 : null,
        reveals: [],
      },
      headers: { "access-control-allow-origin": "*" },
    }),
  );

  await page.goto("/services/1");
  const latest = page.getByRole("region", { name: "Latest round" });
  await expect(latest).toContainText("Round #1");
  await expect(latest).toContainText("Commit");
  await page.evaluate(() => {
    (window as unknown as { marker: boolean }).marker = true;
  });

  finalized = true;
  await expect(latest).toContainText("Finalized · consensus score 88", { timeout: 10_000 });
  expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);
});
