import { createRequire } from "node:module";
import { type ServiceStarter, startStack } from "@skeptique/harness";
import { commitmentHash, type TestCase } from "@skeptique/shared";
import { createPublicClient, createWalletClient, http } from "viem";
import { listDemoServices } from "../../../scripts/demo/list-services";
import { registerDemoCritic } from "../../../scripts/demo/register-critic";
import { runServiceReview } from "../../critic/src/review";
import { serviceByName } from "../../services/catalog";
import { paywallFromEnv, startService } from "../../services/common/server";

/*
 * A real marketplace on a local chain, for when the live Hedera deployment has no reviewed services
 * reachable from this machine. Everything that produces scores is the production code path: services
 * are listed on ServiceRegistry, critics register with stake, run the public suite plus held-out probes,
 * commit, reveal, and RoundManager finalises the stake-weighted median.
 *
 * Disclosed shortcuts (the arena UI shows them):
 * - Critics call a free review instance of each service (same handler code). Critic x402 payments are
 *   shown separately on Hedera (ticket 15); paying ~100 critic calls per demo would make it slow.
 * - Probes are the fixed held-out cases below, not LLM-generated, so the scores are reproducible.
 * - flaky-fx is listed but never reviewed, so it stays unrated.
 * Buyer calls go to the listed endpoints, which require real x402 payment on Hedera testnet.
 */
const REVIEWED = ["unit-convert", "suite-gamer"] as const;
const LISTED = [...REVIEWED, "flaky-fx"] as const;
const ATTESTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"; // hardhat test key
const PRICE_TINYBARS = "1"; // matches scripts/demo/list-services.ts

const HELD_OUT_PROBES: TestCase[] = [
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

const require = createRequire(import.meta.url);

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: unknown };
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result as T;
}

const named = (name: string) => {
  const service = serviceByName(name);
  if (!service) throw new Error(`unknown demo service ${name}`);
  return service;
};

const closer = (server: import("node:http").Server) => () =>
  new Promise<void>((resolve) => server.close(() => resolve()));

export type LocalMarket = {
  apiUrl: string;
  rpcUrl: string;
  medians: Record<string, number>;
  stop: () => Promise<void>;
};

export async function startLocalMarket(env: Record<string, string | undefined> = process.env): Promise<LocalMarket> {
  const paywall = await paywallFromEnv(PRICE_TINYBARS, env);
  if (!paywall)
    throw new Error("X402_FACILITATOR_URL and SELLER_ACCOUNT_ID are required: buyer endpoints must demand payment");
  const starters: Record<string, ServiceStarter> = {};
  for (const name of LISTED) {
    starters[name] = async () => {
      const { server, url } = await startService(named(name), 0, "127.0.0.1", { paywall });
      return { url, close: closer(server) };
    };
  }
  const stack = await startStack({ services: starters });
  const reviewInstances = await Promise.all(REVIEWED.map((name) => startService(named(name), 0)));

  const client = createPublicClient({ transport: http(stack.rpcUrl) });
  const accounts = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
  const owner = createWalletClient({ account: accounts[0], transport: http(stack.rpcUrl) });
  const artifact = require("../../../contracts/artifacts/contracts/RoundManager.sol/RoundManager.json");
  const roundManager = stack.contracts.RoundManager;
  if (!roundManager) throw new Error("harness did not deploy RoundManager");
  const wait = (hash: `0x${string}`) => client.waitForTransactionReceipt({ hash });

  const listed = await listDemoServices({
    rpcUrl: stack.rpcUrl,
    registry: stack.contracts.ServiceRegistry,
    seller: accounts[1],
    origins: stack.services,
  });
  const critics = accounts.slice(2, 2 + REVIEWED.length * 3);
  for (const [i, critic] of critics.entries())
    await registerDemoCritic({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
      critic,
      nullifier: `0x${String(i + 1).padStart(64, "0")}`,
      attestorKey: ATTESTOR_KEY,
    });

  const pending = [];
  for (const [index, name] of REVIEWED.entries()) {
    const id = listed.find((l) => l.name === name)?.serviceId;
    if (id === undefined) throw new Error(`${name} was not listed`);
    const reviewUrl = reviewInstances[index]?.url as string;
    const reviews = [];
    for (const critic of critics.slice(index * 3, index * 3 + 3)) {
      const review = await runServiceReview({
        suiteUrl: `${reviewUrl}/suite.json`,
        specHash: named(name).specHash,
        roundId: id,
        critic,
        endpoint: `${reviewUrl}/call`,
        signer: null,
        maxPrice: PRICE_TINYBARS,
        serviceDescription: "Convert physical units accurately",
        seed: id,
        modelName: "fixture/held-out-probes",
        evidenceUrl: `${stack.apiUrl}/evidence`,
        probeModel: { generateProbes: async () => structuredClone(HELD_OUT_PROBES), judge: async () => false },
        payAndCall: async ({ url, body, signal }) => {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal,
          });
          if (!res.ok) throw new Error(`Service returned ${res.status}`);
          return { response: await res.json(), paid: false, txId: null };
        },
      });
      const salt = `0x${"11".repeat(32)}` as const;
      const wallet = createWalletClient({ account: critic, transport: http(stack.rpcUrl) });
      await wait(
        await wallet.writeContract({
          address: roundManager,
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
      address: roundManager,
      abi: artifact.abi,
      functionName: "getRound",
      args: [BigInt(id)],
    })) as { commitEnd: bigint; revealEnd: bigint };
    pending.push({ id, name, reviews, round });
  }
  const last = pending.at(-1)?.round;
  if (!last) throw new Error("no rounds to settle");
  await rpc(stack.rpcUrl, "evm_setNextBlockTimestamp", [Number(last.commitEnd)]);
  for (const { id, reviews } of pending)
    for (const { review, wallet, salt } of reviews)
      await wait(
        await wallet.writeContract({
          address: roundManager,
          abi: artifact.abi,
          functionName: "reveal",
          chain: null,
          args: [BigInt(id), review.evidence.score, salt, review.evidenceHash, 0n],
        }),
      );
  await rpc(stack.rpcUrl, "evm_setNextBlockTimestamp", [Number(last.revealEnd)]);
  const medians: Record<string, number> = {};
  for (const { id, name } of pending) {
    await wait(
      await owner.writeContract({
        address: roundManager,
        abi: artifact.abi,
        functionName: "finalize",
        chain: null,
        args: [BigInt(id)],
      }),
    );
    const final = (await client.readContract({
      address: roundManager,
      abi: artifact.abi,
      functionName: "getRound",
      args: [BigInt(id)],
    })) as { median: number };
    medians[name] = Number(final.median);
  }
  return {
    apiUrl: stack.apiUrl,
    rpcUrl: stack.rpcUrl,
    medians,
    stop: async () => {
      await Promise.all(reviewInstances.map(({ server }) => closer(server)()));
      await stack.stop();
    },
  };
}
