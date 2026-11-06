import { expect, test } from "@playwright/test";
import { decodeFunctionData, encodeFunctionResult, parseAbi, zeroHash } from "viem";
import { PLAYWRIGHT_PUBLIC_ENV } from "./fixtures";

// The isolated test server uses these same URLs; both transports are intercepted below.
const api = PLAYWRIGHT_PUBLIC_ENV.NEXT_PUBLIC_API_URL;
const rpc = PLAYWRIGHT_PUBLIC_ENV.NEXT_PUBLIC_SEPOLIA_RPC_URL;
const universal = parseAbi([
  "function findResolver(bytes name) view returns (address,bytes32,uint256)",
  "function resolveWithGateways(bytes name,bytes data,string[] gateways) view returns (bytes,address)",
]);
const text = parseAbi(["function text(bytes32 node,string key) view returns (string)"]);
const resolver = "0x0000000000000000000000000000000000000001";
const values: Record<string, string> = {
  "eth.skeptique.score": "43",
  "eth.skeptique.confidence": "0.6",
  "eth.skeptique.round": "12",
  "eth.skeptique.hedera.tx": "0xabc",
  url: "https://service.invalid/call",
  description: "Converter service",
};

test("both pages show resolver score 43 when the API says 99", async ({ page }) => {
  await page.route(`${api}/**`, async (route) => {
    const service = {
      id: 1,
      name: "converter",
      category: "conversion",
      endpoint: "https://service.invalid/call",
      seller: resolver,
      pricePerCall: "1",
      ensName: "converter.svc.skeptique.eth",
      median: 99,
      confidence: 0.6,
      rank: 90,
      nRounds: 1,
      lastRoundAt: null,
      popularityCalls: 0,
    };
    const path = new URL(route.request().url()).pathname;
    const body = path === "/services" ? [service] : path === "/services/1" ? service : [];
    await route.fulfill({ json: body });
  });
  const seenBlocks: string[] = [];
  await page.route(`${rpc}/**`, async (route) => {
    const payload = route.request().postDataJSON();
    const answer = (request: { id: number; method: string; params: [{ data: `0x${string}` }, string] }) => {
      let result: string;
      if (request.method === "eth_blockNumber") result = "0xb71b00";
      else {
        expect(request.method).toBe("eth_call");
        const call = decodeFunctionData({ abi: universal, data: request.params[0].data });
        if (call.functionName === "findResolver")
          result = encodeFunctionResult({
            abi: universal,
            functionName: "findResolver",
            result: [resolver, zeroHash, 0n],
          });
        else {
          const record = decodeFunctionData({ abi: text, data: call.args[1] });
          if (record.args[1].startsWith("eth.skeptique.")) seenBlocks.push(request.params[1]);
          result = encodeFunctionResult({
            abi: universal,
            functionName: "resolveWithGateways",
            result: [
              encodeFunctionResult({ abi: text, functionName: "text", result: values[record.args[1]] }),
              resolver,
            ],
          });
        }
      }
      return { id: request.id, jsonrpc: "2.0", result };
    };
    await route.fulfill({ json: Array.isArray(payload) ? payload.map(answer) : answer(payload) });
  });
  for (const path of ["/", "/services/1"]) {
    await page.goto(path);
    await expect(page.getByText("Score 43", { exact: false })).toBeVisible();
    await expect(page.getByText("Score 99", { exact: false })).toHaveCount(0);
    await page.getByText("Resolver queries", { exact: true }).click();
    await expect(
      page.getByText(
        'getEnsText({ name: "converter.svc.skeptique.eth", key: "eth.skeptique.score", blockNumber: 12000000n })',
        { exact: true },
      ),
    ).toBeVisible();
  }
  expect(seenBlocks.length).toBeGreaterThanOrEqual(8);
  expect(seenBlocks.every((block) => block === "0xb71b00")).toBe(true);
});
