import { existsSync } from "node:fs";
import { serviceEnsName } from "@skeptique/shared";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { dnsName, resolverAbi } from "../src/ens/sepolia";
import { ensFromEnv } from "../src/env";
import { createListingRelayer } from "../src/relayer";

for (const path of [".env", "../../.env"]) if (existsSync(path)) process.loadEnvFile(path);

const keys = ["SEPOLIA_RPC_URL", "ENS_PARENT_NAME", "ENS_OPERATOR_PRIVATE_KEY", "SEPOLIA_RELAYER_PRIVATE_KEY"];

describe.skipIf(keys.some((key) => !process.env[key]))("listing creates ENS subname", () => {
  it("creates a role-limited subname once and resolves it through the Universal Resolver", async () => {
    const ens = ensFromEnv(console.log);
    await ens.setupNamespace();

    const seller = privateKeyToAddress(generatePrivateKey());
    const name = `live-${Date.now().toString(36)}`;
    const feed = { list: async () => [{ serviceId: 1, seller, name }] };
    const full = serviceEnsName(name, ens.parent);
    const scoreKey = ens.scoreKeys[0] as string;

    const first = await createListingRelayer({ feed, chain: ens.chain }).processOnce();
    expect(first.created).toEqual([1]);
    const second = await createListingRelayer({ feed, chain: ens.chain }).processOnce();
    expect(second).toEqual({ created: [], failed: [] });

    const resolver = await ens.chain.resolverFor(name);
    expect(await ens.client.getEnsResolver({ name: full })).toBe(resolver);

    const simulate = (account: `0x${string}`, key: string) =>
      ens.client.simulateContract({
        account,
        address: resolver,
        abi: resolverAbi,
        functionName: "setText",
        args: [dnsName(full), key, "x"],
      });
    await expect(simulate(seller, scoreKey)).rejects.toThrow(/EACUnauthorizedAccountRoles/);
    await expect(simulate(seller, "url")).resolves.toBeDefined();
    await expect(simulate(ens.relayer, "url")).rejects.toThrow(/EACUnauthorizedAccountRoles/);

    await ens.writeText(name, scoreKey, "87");
    expect(await ens.client.getEnsText({ name: full, key: scoreKey })).toBe("87");
  });
});
