import { createRequire } from "node:module";
import { type ServiceStarter, startStack } from "@skeptique/harness";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceReviewSource, MemoryEvidenceStore } from "../apps/api/src/app";
import { runServiceReview } from "../apps/critic/src/review";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { ServiceDetailView } from "../apps/web/components/service-detail";
import { commitmentHash, type TestCase } from "../packages/shared/src/index";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { createPublicClient, createWalletClient, http } = apiRequire("viem") as typeof import("viem");
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");
const require = createRequire(import.meta.url);
const attestorKey = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const probes: TestCase[] = [
  {
    id: "negative-length",
    input: { value: -3, from: "m", to: "cm" },
    expect: { kind: "exact", value: { result: -300, unit: "cm" } },
    weight: 1,
  },
  {
    id: "fractional-mass",
    input: { value: 0.125, from: "kg", to: "g" },
    expect: { kind: "exact", value: { result: 125, unit: "g" } },
    weight: 1,
  },
  {
    id: "cold-temperature",
    input: { value: -10, from: "C", to: "F" },
    expect: { kind: "exact", value: { result: 14, unit: "F" } },
    weight: 1,
  },
];
const serve =
  (name: string): ServiceStarter =>
  async () => {
    const { server, url } = await startService(serviceByName(name)!, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const result = await (
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  ).json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.result as T;
}

describe("suite-gamer exposed", () => {
  let stop: (() => Promise<void>) | undefined;
  afterAll(async () => stop?.());
  it("anchors public and held-out evidence to real finalized medians with a gap above 25 points", async () => {
    const store = new MemoryEvidenceStore();
    let source: ReturnType<typeof createServiceReviewSource>;
    const stack = await startStack({
      services: { "unit-convert": serve("unit-convert"), "suite-gamer": serve("suite-gamer") },
      api: { evidenceStore: store, serviceReviews: { list: (id) => source.list(id) } },
    });
    stop = stack.stop;
    const client = createPublicClient({ transport: http(stack.rpcUrl) });
    const accounts = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
    const owner = createWalletClient({ account: accounts[0], transport: http(stack.rpcUrl) });
    const artifact = require("../contracts/artifacts/contracts/RoundManager.sol/RoundManager.json");
    const deployment = await owner.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [120n, 120n, 3, 7, stack.contracts.CriticRegistry, 10, 2000],
      chain: null,
    });
    const address = (await client.waitForTransactionReceipt({ hash: deployment })).contractAddress!;
    source = createServiceReviewSource({ client, address, store });
    const criticArtifact = require("../contracts/artifacts/contracts/CriticRegistry.sol/CriticRegistry.json");
    const wait = async (hash: `0x${string}`) => client.waitForTransactionReceipt({ hash });
    await wait(
      await owner.writeContract({
        address: stack.contracts.CriticRegistry,
        abi: criticArtifact.abi,
        functionName: "setRoundManager",
        args: [address],
        chain: null,
      }),
    );
    await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller: accounts[1],
      origins: stack.services,
    });
    const critics = accounts.slice(2, 5);
    for (const [i, critic] of critics.entries())
      await registerDemoCritic({
        rpcUrl: stack.rpcUrl,
        registry: stack.contracts.CriticRegistry,
        critic,
        nullifier: `0x${String(i + 1).padStart(64, "0")}`,
        attestorKey,
      });
    const medians: number[] = [];
    for (const [index, name] of ["unit-convert", "suite-gamer"].entries()) {
      const id = index + 1;
      await wait(
        await owner.writeContract({
          address,
          abi: artifact.abi,
          functionName: "openRound",
          args: [BigInt(id)],
          chain: null,
        }),
      );
      const reviews = [];
      for (const critic of critics) {
        const review = await runServiceReview({
          suiteUrl: `${stack.services[name]}/suite.json`,
          specHash: serviceByName(name)!.specHash,
          roundId: id,
          critic,
          endpoint: `${stack.services[name]}/call`,
          signer: null,
          maxPrice: "1",
          serviceDescription: "Convert physical units accurately",
          seed: id,
          modelName: "fixture/exact-oracle",
          evidenceUrl: `${stack.apiUrl}/evidence`,
          probeModel: {
            generateProbes: async () => structuredClone(probes),
            judge: async ({ output }) => JSON.stringify(output) === JSON.stringify({ result: 0, unit: "C" }),
          },
          payAndCall: async ({ url, body, signal }) => {
            const response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
              signal,
            });
            if (!response.ok) throw new Error(`Service returned ${response.status}`);
            return { response: await response.json(), paid: false, txId: null };
          },
        });
        expect(review.suitePass).toBeGreaterThanOrEqual(95);
        expect(review.probePass).toBe(name === "suite-gamer" ? 0 : 100);
        const salt = `0x${"11".repeat(32)}` as const;
        const wallet = createWalletClient({ account: critic, transport: http(stack.rpcUrl) });
        await wait(
          await wallet.writeContract({
            address,
            abi: artifact.abi,
            functionName: "commit",
            chain: null,
            args: [
              BigInt(id),
              commitmentHash({ score: review.evidence.score, salt, evidenceHash: review.evidenceHash, critic }),
            ],
          }),
        );
        reviews.push({ review, wallet, salt });
      }
      const round = (await client.readContract({
        address,
        abi: artifact.abi,
        functionName: "getRound",
        args: [BigInt(id)],
      })) as { commitEnd: bigint; revealEnd: bigint };
      await rpc(stack.rpcUrl, "evm_setNextBlockTimestamp", [Number(round.commitEnd)]);
      for (const { review, wallet, salt } of reviews)
        await wait(
          await wallet.writeContract({
            address,
            abi: artifact.abi,
            functionName: "reveal",
            args: [BigInt(id), review.evidence.score, salt, review.evidenceHash, 0n],
            chain: null,
          }),
        );
      await rpc(stack.rpcUrl, "evm_setNextBlockTimestamp", [Number(round.revealEnd)]);
      await wait(
        await owner.writeContract({
          address,
          abi: artifact.abi,
          functionName: "finalize",
          args: [BigInt(id)],
          chain: null,
        }),
      );
      const finalized = (await client.readContract({
        address,
        abi: artifact.abi,
        functionName: "getRound",
        args: [BigInt(id)],
      })) as { median: number; finalized: boolean };
      expect(finalized.finalized).toBe(true);
      medians.push(finalized.median);
      const visible = await (await fetch(`${stack.apiUrl}/services/${id}/reviews`)).json();
      expect(visible).toHaveLength(3);
      const services = await (await fetch(`${stack.apiUrl}/services`)).json();
      const html = renderToString(
        createElement(ServiceDetailView, { state: { status: "ready", service: services[index], reviews: visible } }),
      );
      expect(html).toContain("Public suite");
      expect(html).toContain("Private probes");
      expect(html).toContain("negative-length");
    }
    expect(medians).toEqual([100, 40]);
    expect(medians[0] - medians[1]).toBeGreaterThanOrEqual(25);
  });
});
