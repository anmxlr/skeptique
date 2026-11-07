import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { MOCK_API_URL } from "../playwright.config";
import { PLAYWRIGHT_PUBLIC_ENV } from "./fixtures";

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
// Public deployment fixture only; these addresses are never used for network transactions.
const DEPLOYMENT = {
  version: 1,
  network: "hedera-testnet",
  chainId: 296,
  deployedAt: "2026-11-06T00:00:00.000Z",
  deploymentBlock: "42",
  contracts: {
    ServiceRegistry: `0x${"11".repeat(20)}`,
    CriticRegistry: `0x${"22".repeat(20)}`,
    RoundManager: `0x${"33".repeat(20)}`,
  },
  transactions: [],
  config: {
    minStakeTinybars: "500000000",
    minListingFeeTinybars: "2000000000",
    withdrawCooldown: 300,
    commitSeconds: 90,
    revealSeconds: 45,
    kMin: 3,
    kMax: 7,
    tolerance: 10,
    slashBps: 2000,
  },
};
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

const ARENA_HEALTH = {
  ok: true,
  model: "claude-haiku-5-5",
  network: "hedera:testnet",
  apiUrl: MOCK_API_URL,
  busy: false,
  paywall: { "unit-convert": "402 payment required ✓" },
  provenance: "local-chain",
  models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
  acceptsUserCredentials: true,
};
const ARENA_TASKS = [
  { id: "m-cm", prompt: "Convert 3 metres to centimetres", why: "off the public suite", group: "general" },
  { id: "hbar-tb", prompt: "Convert 2 HBAR to tinybars", why: "web3 units", group: "web3" },
];

async function mockApi(page: Page) {
  await page.route(`${PLAYWRIGHT_PUBLIC_ENV.NEXT_PUBLIC_ARENA_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/health" ? ARENA_HEALTH : path === "/tasks" ? ARENA_TASKS : undefined;
    await route.fulfill(
      body === undefined
        ? { status: 404, json: { error: "Not found" }, headers: { "access-control-allow-origin": "*" } }
        : { status: 200, json: body, headers: { "access-control-allow-origin": "*" } },
    );
  });
  await page.route(`${MOCK_API_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    // The event stream with no rounds yet; tests that need round events route /events themselves.
    if (path === "/events")
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
        body: "retry: 60000\n\n",
      });
    if (path === "/deployment") return route.fulfill({ json: DEPLOYMENT });
    const body =
      path === "/services"
        ? SERVICES
        : /^\/services\/\d+\/(rounds|reviews)$/.test(path)
          ? []
          : path.startsWith("/services/")
            ? SERVICES.find((s) => s.id === Number(path.split("/")[2]))
            : path === "/critics"
              ? CRITICS
              : path === "/buyer/runs"
                ? RUNS
                : path === "/buyer/approvals"
                  ? []
                  : path === "/buyer/limits"
                    ? null
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
  { path: "/arena", heading: "Arena" },
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
        if (path === "/audit") await expect(page.getByRole("region", { name: "Verified deployment" })).toBeVisible();
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
        committed: [],
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

test("arena: a multi-part run with user keys renders both cards and the verdict with no accessibility violations", async ({
  page,
}) => {
  await mockApi(page);
  const arena = PLAYWRIGHT_PUBLIC_ENV.NEXT_PUBLIC_ARENA_URL;
  const headers = { "access-control-allow-origin": "*" };
  const TX = "0.0.9185802@1793949293.996636002";
  // Test-only fake key material: never a real account key.
  const FAKE_KEY = `0x${"ab".repeat(32)}`;
  const tasks = [
    { category: "conversion", input: { value: 3, from: "m", to: "cm" } },
    { category: "currency-conversion", input: { amount: 120, from: "USD", to: "EUR" } },
  ];
  // Real service shapes: unit-convert answers {result, unit}; FX answers {from, to, amount, rate, converted}.
  const answers = [
    { right: { result: 300, unit: "cm" }, wrong: { result: 1, unit: "cm" }, expected: { result: 300, unit: "cm" } },
    {
      right: { from: "USD", to: "EUR", amount: 120, rate: 0.92, converted: 110.4 },
      wrong: { from: "USD", to: "EUR", amount: 120, rate: 0.01, converted: 1.2 },
      expected: { converted: 110.4, to: "EUR" },
    },
  ];
  const sources = [
    { label: "NIST SI units", url: "https://www.nist.gov/pml/owm/metric-si/si-units" },
    { label: "Demo reference rates (fixed table)", url: "https://example.test/fx" },
  ];
  const part = (index: number, outcome: "correct" | "wrong" | "blocked") => ({
    part: index,
    task: tasks[index],
    option: 1,
    pick: {
      option: 1,
      id: 1,
      name: outcome === "correct" ? "unit-convert" : "suite-gamer",
      endpoint: "x",
      pricePerCall: "1",
    },
    policy:
      outcome === "blocked"
        ? { allowed: false, checks: [{ rule: "evidence", pass: false, detail: "score 40 < 70" }] }
        : { allowed: true, checks: [{ rule: "budget", pass: true, detail: "ok" }] },
    payment: outcome === "blocked" ? null : { txId: TX, paid: true, tinybars: "1" },
    response: outcome === "blocked" ? null : answers[index][outcome === "correct" ? "right" : "wrong"],
    verdict:
      outcome === "blocked"
        ? null
        : {
            correct: outcome === "correct",
            expected: answers[index].expected,
            actual: answers[index][outcome === "correct" ? "right" : "wrong"],
            note: "n",
            source: sources[index],
          },
    outcome,
    error: null,
  });
  const side = (name: "baseline" | "skeptique", second: "wrong" | "blocked") => ({
    side: name,
    prompt: `listings shown to ${name}`,
    decision: {
      choices: [
        { part: 0, option: 1 },
        { part: 1, option: 1 },
      ],
      reason: `${name} reason`,
      signalsUsed: [],
    },
    llm: { model: "claude-sonnet-5-5", costUsd: null, ms: 1, raw: "{}" },
    parts: [part(0, "correct"), part(1, second)],
    correctParts: 1,
    totalParts: 2,
    paidTinybars: second === "wrong" ? "2" : "1",
    wastedTinybars: second === "wrong" ? "1" : "0",
    outcome: "partial",
    error: null,
    grounding:
      name === "baseline"
        ? { numbers: [{ value: "94", found: false }], signals: [{ name: "paidCallsByBuyers", found: true }], ok: false }
        : {
            numbers: [{ value: "1", found: true }],
            signals: [{ name: "skeptiqueMedianScore", found: true }],
            ok: true,
          },
  });
  const baseline = side("baseline", "wrong");
  const skeptique = side("skeptique", "blocked");
  const events = [
    {
      type: "run-started",
      runId: "r1",
      task: { kind: "tasks", parts: tasks },
      prompt: "Convert 3 metres to centimetres",
    },
    { type: "decided", side: "baseline", decision: baseline.decision },
    { type: "part", side: "baseline", part: 0, result: baseline.parts[0] },
    { type: "graded", side: "baseline", result: baseline },
    { type: "graded", side: "skeptique", result: skeptique },
    {
      type: "run-finished",
      record: {
        version: 3,
        runId: "r1",
        prompt: "p",
        mode: "may-refuse",
        credentialSource: "user",
        marketplace: { apiUrl: MOCK_API_URL },
        sides: { baseline, skeptique },
      },
      hash: "0xabc",
    },
  ];
  let posted: Record<string, unknown> | null = null;
  await page.route(`${arena}/runs`, (route) => {
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { runId: "r1" }, headers });
  });
  await page.route(`${arena}/runs/r1/events`, (route) =>
    route.fulfill({
      status: 200,
      headers: { ...headers, "content-type": "text/event-stream" },
      body: events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""),
    }),
  );
  await page.goto("/arena");

  await page.getByRole("button", { name: "Use your own keys" }).click();
  const dialog = page.getByRole("dialog", { name: "Use your own keys" });
  await dialog.getByLabel("Hedera testnet account ID").fill("12345");
  await dialog.getByLabel("Hedera private key").fill(FAKE_KEY);
  await dialog.getByLabel("Model").selectOption("claude-sonnet-5-5");
  await dialog.getByRole("button", { name: "Use these keys" }).click();
  await expect(dialog).toContainText("Use the form 0.0.12345.");
  await dialog.getByLabel("Hedera testnet account ID").fill("0.0.4242");
  await dialog.getByRole("button", { name: "Use these keys" }).click();
  await expect(page.getByText("Using your keys · 0.0.4242")).toBeVisible();

  await page.getByRole("button", { name: /Convert 3 metres/ }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("region", { name: "Verdict" })).toContainText("0xabc");
  await expect(page.getByRole("region", { name: "With Skeptique" })).toContainText("1/2");
  await expect(page.getByRole("region", { name: "With Skeptique" })).toContainText("score 40 < 70");
  await expect(page.getByRole("region", { name: "Without Skeptique" })).toContainText("got 1.2 EUR · right: 110.4 EUR");
  const withCard = page.getByRole("region", { name: "With Skeptique" });
  await withCard.getByText("Where this came from").click();
  // One "Test results" link per part; both parts bought the same reviewed vendor here.
  await expect(withCard.getByRole("link", { name: "Test results" }).first()).toHaveAttribute(
    "href",
    `${MOCK_API_URL}/services/1/reviews`,
  );
  await expect(withCard).toContainText("Every number it quoted appears in what it was shown");
  const withoutCard = page.getByRole("region", { name: "Without Skeptique" });
  await withoutCard.getByText("Where this came from").click();
  await expect(withoutCard).toContainText("It quoted 94, which was not directly in its data");
  expect(posted).toMatchObject({
    prompt: "Convert 3 metres to centimetres",
    mode: "may-refuse",
    credentials: { hederaAccountId: "0.0.4242", hederaPrivateKey: FAKE_KEY, model: "claude-sonnet-5-5" },
  });
  expect(await page.content()).not.toContain(FAKE_KEY);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })),
  ).not.toContain("abab");

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => `${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});
