import type { ServiceView } from "@skeptique/shared";
import type { PayAndCall } from "@skeptique/x402-client";
import { describe, expect, it, vi } from "vitest";
import { explainPick, NoCandidateError, pickService, publishBuyerRun, runBuyer } from "../src/index";

const view = (overrides: Partial<ServiceView>): ServiceView => ({
  id: 1,
  name: "svc",
  category: "conversion",
  endpoint: "http://127.0.0.1:4001/call",
  pricePerCall: "2",
  seller: "0x0000000000000000000000000000000000000001",
  ensName: "",
  median: 80,
  confidence: 1,
  rank: 80,
  nRounds: 2,
  lastRoundAt: "2026-11-06T00:00:00.000Z",
  popularityCalls: 0,
  ...overrides,
});

const good = view({ id: 1, name: "unit-convert", median: 100, rank: 100, popularityCalls: 3 });
const gamer = view({ id: 2, name: "suite-gamer", median: 40, rank: 40, popularityCalls: 1000 });
const unrated = view({ id: 3, name: "brand-new", median: null, confidence: 0, rank: 0, nRounds: 0, lastRoundAt: null });
const otherCategory = view({ id: 4, name: "csv-clean", category: "data-cleaning", rank: 200, popularityCalls: 5000 });
const listing = [gamer, unrated, otherCategory, good];

describe("pickService", () => {
  it("skeptique buyer picks the highest rank in the category and skips unrated services", () => {
    expect(pickService(listing, "conversion", "skeptique").name).toBe("unit-convert");
    expect(() => pickService([unrated], "conversion", "skeptique")).toThrow(NoCandidateError);
  });

  it("popularity buyer picks the most paid calls in the category, ignoring scores", () => {
    expect(pickService(listing, "conversion", "popularity").name).toBe("suite-gamer");
  });

  it("breaks ties by lowest id and throws when the category is empty", () => {
    expect(pickService([view({ id: 9, name: "b" }), view({ id: 5, name: "a" })], "conversion", "skeptique").id).toBe(5);
    expect(() => pickService(listing, "translation", "popularity")).toThrow(NoCandidateError);
  });
});

describe("explainPick", () => {
  it("explains a skeptique pick from its numbers and names the runner-up", () => {
    const text = explainPick(good, listing, "skeptique");
    expect(text).toContain("unit-convert");
    expect(text).toContain("median score 100/100");
    expect(text).toContain("2 rounds");
    expect(text).toContain("confidence 100%");
    expect(text).toContain("suite-gamer");
    expect(text).toContain("1 unrated");
  });

  it("explains a popularity pick and says quality was not considered", () => {
    const text = explainPick(gamer, listing, "popularity");
    expect(text).toContain("1000 paid calls");
    expect(text).toContain("unit-convert");
    expect(text).toMatch(/not consider/i);
  });
});

describe("runBuyer", () => {
  const services = (body: unknown) =>
    vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("http://api.test/services");
      return new Response(JSON.stringify(body), { status: 200 });
    });

  it("pays the picked service once at its listed price with no approval step", async () => {
    const payAndCall = vi.fn<PayAndCall>(async () => ({ response: { result: 300 }, txId: "0.0.7@1.2", paid: true }));
    const run = await runBuyer({
      apiUrl: "http://api.test",
      category: "conversion",
      task: { value: 3, from: "m", to: "cm" },
      strategy: "skeptique",
      payAndCall,
      signer: "signer",
      fetchImpl: services(listing),
      now: () => new Date("2026-11-06T10:00:00.000Z"),
    });
    expect(payAndCall).toHaveBeenCalledOnce();
    expect(payAndCall).toHaveBeenCalledWith({
      url: good.endpoint,
      body: { value: 3, from: "m", to: "cm" },
      maxPrice: "2",
      signer: "signer",
    });
    expect(run).toMatchObject({
      strategy: "skeptique",
      pick: { name: "unit-convert" },
      response: { result: 300 },
      txId: "0.0.7@1.2",
      paid: true,
      at: "2026-11-06T10:00:00.000Z",
    });
  });

  it("refuses a malformed marketplace listing before paying", async () => {
    const payAndCall = vi.fn<PayAndCall>();
    await expect(
      runBuyer({
        apiUrl: "http://api.test",
        category: "conversion",
        task: {},
        strategy: "skeptique",
        payAndCall,
        signer: null,
        fetchImpl: services([{ name: "broken" }]),
      }),
    ).rejects.toThrow();
    expect(payAndCall).not.toHaveBeenCalled();
  });
});

describe("publishBuyerRun", () => {
  it("posts the run to the API", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    const run = {
      strategy: "skeptique" as const,
      category: "conversion",
      task: {},
      pick: good,
      explanation: "x",
      response: {},
      txId: null,
      paid: false,
      at: "2026-11-06T00:00:00.000Z",
    };
    await publishBuyerRun("http://api.test", run, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(new URL("http://api.test/buyer/runs"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(run),
    });
  });
});
