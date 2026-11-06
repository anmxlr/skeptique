import { suiteHash, type TestSuite } from "@skeptique/shared";
import type { PublicClient } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { createRegistrySource } from "./listings";

const REGISTRY = "0x00000000000000000000000000000000000000aa";
const SELLER = "0x0000000000000000000000000000000000000022";
const suite: TestSuite = {
  version: 1,
  serviceName: "length-convert",
  category: "conversion",
  determinism: "none",
  cases: [{ id: "m-to-cm", input: { value: 1 }, expect: { kind: "exact", value: 100 }, weight: 1 }],
};
const ensNode = `0x${"00".repeat(32)}`;

function chain(specHash: string) {
  const client = {
    getContractEvents: async () => [
      {
        args: {
          serviceId: 1n,
          seller: SELLER,
          specHash,
          endpoint: "http://svc.local/call",
          pricePerCall: 3n,
          ensNode,
        },
      },
    ],
    readContract: async () => ({ bounty: 2_000_000_000n }),
  };
  return client as unknown as Pick<PublicClient, "getContractEvents" | "readContract">;
}

const serveSuite = (served: unknown) => async (url: string | URL | Request) => {
  expect(String(url)).toBe("http://svc.local/suite.json");
  return new Response(JSON.stringify(served), { headers: { "content-type": "application/json" } });
};

function app(specHash: string, served: unknown = suite, ensParent?: string) {
  return buildApp({
    publicClient: { getChainId: async () => 31337 },
    contracts: { ServiceRegistry: REGISTRY },
    listings: createRegistrySource({
      client: chain(specHash),
      address: REGISTRY,
      ensParent,
      fetch: serveSuite(served),
    }),
  });
}

let current: ReturnType<typeof app> | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe("indexed service listings", () => {
  it("serves a new listing in probation with its price, bounty and suite-derived name", async () => {
    current = app(suiteHash(suite));
    const list = await current.inject({ method: "GET", url: "/services" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      {
        id: 1,
        name: "length-convert",
        category: "conversion",
        endpoint: "http://svc.local/call",
        pricePerCall: "3",
        seller: SELLER,
        ensName: "",
        median: null,
        confidence: 0,
        rank: 0,
        nRounds: 0,
        lastRoundAt: null,
        popularityCalls: 0,
        specHash: suiteHash(suite),
        bounty: "2000000000",
      },
    ]);
  });

  it("names a listing under svc of the configured ENS parent", async () => {
    current = app(suiteHash(suite), suite, "skeptique.eth");
    const list = await current.inject({ method: "GET", url: "/services" });
    expect(list.json()[0]).toMatchObject({ ensName: "length-convert.svc.skeptique.eth" });
  });

  it("serves one service's detail and 404s an unknown id", async () => {
    current = app(suiteHash(suite));
    const detail = await current.inject({ method: "GET", url: "/services/1" });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: 1, name: "length-convert", bounty: "2000000000" });
    expect((await current.inject({ method: "GET", url: "/services/9" })).statusCode).toBe(404);
  });

  it("serves the public suite when it hashes to the listed specHash", async () => {
    current = app(suiteHash(suite));
    const res = await current.inject({ method: "GET", url: "/services/1/suite" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(suite);
  });

  it("refuses a suite whose hash differs from specHash", async () => {
    const listed = `0x${"ab".repeat(32)}`;
    current = app(listed);
    const res = await current.inject({ method: "GET", url: "/services/1/suite" });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      error: "Suite hash does not match specHash",
      specHash: listed,
      actualHash: suiteHash(suite),
    });
    expect((await current.inject({ method: "GET", url: "/services" })).json()).toEqual([]);
  });

  it("404s the suite of an unknown service", async () => {
    current = app(suiteHash(suite));
    expect((await current.inject({ method: "GET", url: "/services/9/suite" })).statusCode).toBe(404);
  });
});
