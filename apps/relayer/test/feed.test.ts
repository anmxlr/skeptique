import { suiteHash, type TestSuite } from "@skeptique/shared";
import { describe, expect, it, vi } from "vitest";
import { createRegistryFeed } from "../src/feed";

const seller = "0x0000000000000000000000000000000000000001";
const suite: TestSuite = {
  version: 1,
  serviceName: "conversion-service",
  category: "conversion",
  determinism: "none",
  cases: [{ id: "convert", input: 1, expect: { kind: "exact", value: 100 }, weight: 1 }],
};

function fixture(body: TestSuite, fromBlock?: bigint) {
  const getContractEvents = vi.fn(async (_args: unknown) => [
    {
      args: {
        serviceId: 1n,
        seller,
        specHash: suiteHash(suite),
        endpoint: "https://service.example/call",
        pricePerCall: 1n,
        ensNode: `0x${"00".repeat(32)}`,
      },
    },
  ]);
  const feed = createRegistryFeed({
    fromBlock,
    address: seller,
    client: { getContractEvents } as unknown as Parameters<typeof createRegistryFeed>[0]["client"],
    fetch: async () => Response.json(body),
  });
  return { ...feed, getContractEvents };
}

describe("ENS listing feed suite binding", () => {
  it("starts live queries at the configured deployment block", async () => {
    const feed = fixture(suite, 42n);
    await feed.list();
    expect(feed.getContractEvents.mock.calls[0]?.[0]).toMatchObject({ fromBlock: 42n });
  });
  it("names the service only when its suite matches the immutable registered hash", async () => {
    expect(await fixture(suite).list()).toEqual([{ serviceId: 1, seller, name: suite.serviceName }]);
  });
  it("omits a changed service name instead of provisioning an ENS name from a mutable suite", async () => {
    expect(await fixture({ ...suite, serviceName: "attacker-replacement" }).list()).toEqual([]);
  });
});
