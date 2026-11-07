import { createRequire } from "node:module";
import { type ServiceStarter, startStack } from "@skeptique/harness";
import { commitmentHash, type TestCase } from "@skeptique/shared";
import { serviceListedEvent, serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { contractValue } from "@skeptique/shared/deployment";
import { createPublicClient, createWalletClient, http, parseEventLogs, zeroHash } from "viem";
import { registerDemoCritic } from "../../../scripts/demo/register-critic";
import { runServiceReview } from "../../critic/src/review";
import { serviceByName } from "../../services/catalog";
import { type DemoService, paywallFromEnv, startService } from "../../services/common/server";
import { fxReference } from "./fx-reference";
import { grade } from "./oracle";
import { SubTaskSchema } from "./schema";

/*
 * A real marketplace on a local chain, for when the live Hedera deployment has no reviewed services
 * reachable from this machine. Everything that produces scores is the production code path: services
 * are listed on ServiceRegistry, critics register with stake, run the public suite plus held-out probes,
 * commit, reveal, and RoundManager finalises the stake-weighted median.
 *
 * Disclosed shortcuts (the arena UI shows them):
 * - Critics call a free review instance of each service (same handler code). Critic x402 payments are
 *   shown separately on Hedera (ticket 15); paying ~100 critic calls per demo would make it slow.
 * - Probes are fixed held-out cases below, not LLM-generated, so the scores are reproducible. Each of
 *   a service's 3 critics gets a different third of its category's probe pool, and judge cases are
 *   graded by the arena oracle (SI factors, REFERENCE_FX), not a model.
 * - fx-reference is an honest FX vendor defined in this app (src/fx-reference.ts), not a catalog service.
 * Buyer calls go to the listed endpoints, which require real x402 payment on Hedera testnet.
 */
const named = (name: string) => {
  const service = serviceByName(name);
  if (!service) throw new Error(`unknown demo service ${name}`);
  return service;
};

const SERVICES: Record<string, DemoService> = {
  "unit-convert": named("unit-convert"),
  "suite-gamer": named("suite-gamer"),
  "flaky-fx": named("flaky-fx"),
  "fx-reference": fxReference,
};
const LISTED = Object.keys(SERVICES);
const CRITICS_PER_SERVICE = 3;
const ATTESTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"; // hardhat test key
const PRICE_TINYBARS = "1"; // matches scripts/demo/list-services.ts

const judged = (id: string, input: Record<string, unknown>, rubric: string): TestCase => ({
  id,
  input,
  expect: { kind: "judge", rubric },
  weight: 1,
});
const unitProbe = (id: string, value: number, from: string, to: string) =>
  judged(id, { value, from, to }, "result equals the SI conversion and unit is the target unit");
const fxProbe = (id: string, amount: number, from: string, to: string) =>
  judged(id, { amount, from, to }, "converted equals amount at the reference rate, rounded to cents");

/** Held-out probe pools, none in a public suite. Critic k of a service gets slice [3k, 3k + 3). */
const PROBE_POOLS: Record<string, TestCase[]> = {
  conversion: [
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
    unitProbe("feet-metres", 5, "ft", "m"),
    unitProbe("litres-millilitres", 2, "L", "mL"),
    unitProbe("kelvin-celsius", 300, "K", "C"),
    unitProbe("millimetres-kilometres", 1500, "mm", "km"),
    unitProbe("pounds-kilograms", 10, "lb", "kg"),
    unitProbe("miles-feet", 3, "mi", "ft"),
  ],
  "currency-conversion": [
    fxProbe("usd-eur-75", 75, "USD", "EUR"),
    fxProbe("eur-usd-40", 40, "EUR", "USD"),
    fxProbe("usd-inr-5", 5, "USD", "INR"),
    fxProbe("inr-usd-2500", 2500, "INR", "USD"),
    fxProbe("gbp-usd-9", 9, "GBP", "USD"),
    fxProbe("usd-gbp-60", 60, "USD", "GBP"),
    fxProbe("usd-eur-300", 300, "USD", "EUR"),
    fxProbe("eur-usd-18", 18, "EUR", "USD"),
    fxProbe("gbp-usd-7", 7, "GBP", "USD"),
  ],
};
const DESCRIPTIONS: Record<string, string> = {
  conversion: "Convert physical units accurately",
  "currency-conversion": "Convert currency amounts at the reference rate",
};

/** The probe judge: the arena oracle on the probe's input, so a correct answer always passes. */
export async function oracleJudge({ input, output }: { input: unknown; output: unknown }): Promise<boolean> {
  const task = SubTaskSchema.safeParse({ category: "conversion", input });
  if (task.success) return grade(task.data, output).correct;
  const fx = SubTaskSchema.safeParse({ category: "currency-conversion", input });
  return fx.success && grade(fx.data, output).correct;
}

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
      const { server, url } = await startService(SERVICES[name] as DemoService, 0, "127.0.0.1", { paywall });
      return { url, close: closer(server) };
    };
  }
  const stack = await startStack({ services: starters });
  const reviewInstances = await Promise.all(LISTED.map((name) => startService(SERVICES[name] as DemoService, 0)));

  const client = createPublicClient({ transport: http(stack.rpcUrl) });
  const accounts = await rpc<`0x${string}`[]>(stack.rpcUrl, "eth_accounts");
  const owner = createWalletClient({ account: accounts[0], transport: http(stack.rpcUrl) });
  const artifact = require("../../../contracts/artifacts/contracts/RoundManager.sol/RoundManager.json");
  const roundManager = stack.contracts.RoundManager;
  if (!roundManager) throw new Error("harness did not deploy RoundManager");
  const wait = (hash: `0x${string}`) => client.waitForTransactionReceipt({ hash });

  // Same listing call as scripts/demo/list-services.ts, which only knows catalog services.
  const seller = createWalletClient({ account: accounts[1], transport: http(stack.rpcUrl) });
  const registry = stack.contracts.ServiceRegistry;
  if (!registry) throw new Error("harness did not deploy ServiceRegistry");
  const fee = await client.readContract({ address: registry, abi: serviceRegistryAbi, functionName: "minListingFee" });
  const chainId = await client.getChainId();
  const listed: { name: string; serviceId: number }[] = [];
  for (const name of LISTED) {
    const receipt = await wait(
      await seller.writeContract({
        address: registry,
        abi: serviceRegistryAbi,
        functionName: "listService",
        args: [
          (SERVICES[name] as DemoService).specHash as `0x${string}`,
          new URL("/call", stack.services[name]).href,
          BigInt(PRICE_TINYBARS),
          zeroHash,
        ],
        value: contractValue(fee, chainId),
        chain: null,
      }),
    );
    const [log] = parseEventLogs({ abi: serviceRegistryAbi, eventName: "ServiceListed", logs: receipt.logs });
    if (!log) throw new Error(`Listing ${name} emitted no ServiceListed event`);
    listed.push({ name, serviceId: serviceListedEvent(log.args).serviceId });
  }
  const critics = accounts.slice(2, 2 + LISTED.length * CRITICS_PER_SERVICE);
  if (critics.length < LISTED.length * CRITICS_PER_SERVICE) throw new Error("not enough local accounts for critics");
  for (const [i, critic] of critics.entries())
    await registerDemoCritic({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
      critic,
      nullifier: `0x${String(i + 1).padStart(64, "0")}`,
      attestorKey: ATTESTOR_KEY,
    });

  const pending = [];
  for (const [index, name] of LISTED.entries()) {
    const id = listed.find((l) => l.name === name)?.serviceId;
    if (id === undefined) throw new Error(`${name} was not listed`);
    const service = SERVICES[name] as DemoService;
    const reviewUrl = reviewInstances[index]?.url as string;
    const pool = PROBE_POOLS[service.suite.category] ?? [];
    const reviews = [];
    const own = critics.slice(index * CRITICS_PER_SERVICE, (index + 1) * CRITICS_PER_SERVICE);
    for (const [k, critic] of own.entries()) {
      const probes = pool.slice(k * 3, k * 3 + 3);
      const review = await runServiceReview({
        suiteUrl: `${reviewUrl}/suite.json`,
        specHash: service.specHash,
        roundId: id,
        critic,
        endpoint: `${reviewUrl}/call`,
        signer: null,
        maxPrice: PRICE_TINYBARS,
        serviceDescription: DESCRIPTIONS[service.suite.category] ?? service.suite.category,
        seed: id,
        modelName: "fixture/held-out-probes",
        evidenceUrl: `${stack.apiUrl}/evidence`,
        probeModel: { generateProbes: async () => structuredClone(probes), judge: oracleJudge },
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
