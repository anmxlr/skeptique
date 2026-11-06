import { describe, expect, it } from "vitest";
import { createListingRelayer } from "../src/relayer";
import { FakeEns } from "./fake-ens";

const PARENT = "skeptique.eth";
const RELAYER = "0x00000000000000000000000000000000000000a1";
const SELLER = "0x00000000000000000000000000000000000000b2";
const listing = { serviceId: 1, seller: SELLER as `0x${string}`, name: "Unit Convert" };

describe("listing relayer", () => {
  it("creates one subname per listing, named from the service", async () => {
    const ens = new FakeEns(PARENT, RELAYER);
    const relayer = createListingRelayer({ feed: { list: async () => [listing] }, chain: ens });
    await relayer.processOnce();
    expect([...ens.subnames.keys()]).toEqual(["unit-convert"]);
    expect(ens.subnames.get("unit-convert")?.seller).toBe(SELLER);
  });

  it("does not create a second subname when it runs again or restarts", async () => {
    const ens = new FakeEns(PARENT, RELAYER);
    const feed = { list: async () => [listing] };
    await createListingRelayer({ feed, chain: ens }).processOnce();
    await createListingRelayer({ feed, chain: ens }).processOnce();
    await createListingRelayer({ feed, chain: ens }).processOnce();
    expect(ens.creations).toBe(1);
  });

  it("keeps going when one listing fails and retries it next pass", async () => {
    const ens = new FakeEns(PARENT, RELAYER);
    const second = { serviceId: 2, seller: SELLER as `0x${string}`, name: "Csv Clean" };
    let failFirst = true;
    const realCreate = ens.createSubname.bind(ens);
    ens.createSubname = async (input) => {
      if (input.slug === "unit-convert" && failFirst) throw new Error("rpc down");
      return realCreate(input);
    };
    const relayer = createListingRelayer({ feed: { list: async () => [listing, second] }, chain: ens });
    expect((await relayer.processOnce()).failed).toEqual([1]);
    expect([...ens.subnames.keys()]).toEqual(["csv-clean"]);
    failFirst = false;
    await relayer.processOnce();
    expect([...ens.subnames.keys()].sort()).toEqual(["csv-clean", "unit-convert"]);
  });
});

describe("role-limited records", () => {
  const setup = async () => {
    const ens = new FakeEns(PARENT, RELAYER);
    await createListingRelayer({ feed: { list: async () => [listing] }, chain: ens }).processOnce();
    const resolver = ens.subnames.get("unit-convert")?.resolver;
    if (!resolver) throw new Error("subname missing");
    return resolver;
  };

  it("reverts a seller write to a skeptique key", async () => {
    const resolver = await setup();
    expect(() => resolver.setText(SELLER, "eth.skeptique.score", "100")).toThrow("EACUnauthorizedAccountRoles");
  });

  it("lets the seller write url and description", async () => {
    const resolver = await setup();
    resolver.setText(SELLER, "url", "https://example.test");
    resolver.setText(SELLER, "description", "converts units");
    expect(resolver.text.get("url")).toBe("https://example.test");
  });

  it("lets the relayer write every skeptique key but not url", async () => {
    const resolver = await setup();
    for (const key of ["score", "confidence", "round", "hedera.tx"])
      resolver.setText(RELAYER, `eth.skeptique.${key}`, "1");
    expect(() => resolver.setText(RELAYER, "url", "https://example.test")).toThrow("EACUnauthorizedAccountRoles");
  });
});
