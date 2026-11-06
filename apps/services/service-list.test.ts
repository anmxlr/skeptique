import { describe, expect, it } from "vitest";
import { demoServiceListings, demoServices, seedDemoServices } from "./catalog";

const origins = Object.fromEntries(
  demoServices.map((service, index) => [service.name, `http://127.0.0.1:${4100 + index}`]),
);

describe("ticket 13 marketplace service seed", () => {
  it("lists all five ticket 13 services with suite hashes", async () => {
    const registered: Array<{ name: string; specHash: string }> = [];
    await seedDemoServices((service) => {
      registered.push({ name: service.name, specHash: service.specHash });
    }, origins);
    expect(registered.map((service) => service.name)).toEqual([
      "unit-convert",
      "csv-clean",
      "json-extract",
      "flaky-fx",
      "suite-gamer",
    ]);
    expect(registered.every((service) => /^0x[0-9a-f]{64}$/.test(service.specHash))).toBe(true);
    const listings = demoServiceListings(origins);
    expect(listings).toHaveLength(5);
    expect(listings.every((listing) => new URL(listing.endpoint).pathname === "/call")).toBe(true);
    expect(listings[0]!.endpoint).toBe(`${origins["unit-convert"]}/call`);
  });

  it("validates every configured origin before registering any service", async () => {
    const registered: string[] = [];
    await expect(
      seedDemoServices(
        (service) => {
          registered.push(service.name);
        },
        { ...origins, "flaky-fx": "file:///tmp/fx" },
      ),
    ).rejects.toThrow("origin");
    expect(registered).toEqual([]);
    expect(() => demoServiceListings({})).toThrow("origin");
    for (const url of ["http://localhost:PORT", "https://example.com/service", "https://user:secret@example.com"]) {
      expect(() => demoServiceListings({ ...origins, "unit-convert": url })).toThrow("origin");
    }
  });
});
