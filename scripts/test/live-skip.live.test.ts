import { describe, expect, it } from "vitest";

// Proves `pnpm test:live` skips cleanly without keys; real live tests follow the same pattern.
describe.skipIf(!process.env.HEDERA_RPC_URL)("live: hedera json-rpc", () => {
  it("reports the testnet chain id", async () => {
    const res = await fetch(process.env.HEDERA_RPC_URL as string, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const { result } = (await res.json()) as { result: string };
    expect(Number(result)).toBe(Number(process.env.HEDERA_CHAIN_ID));
  });
});
