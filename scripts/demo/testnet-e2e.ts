import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serviceListedEvent, serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { createSepoliaScoreReader, readEnsScore, serviceEnsName, serviceSlug } from "@skeptique/shared/ens";
import { readAuditLog } from "@skeptique/shared/hcs";
import { createPublicClient, createWalletClient, getAbiItem, http, namehash, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../../apps/api/src/app";
import { createApprovalClient, fetchSpendLimits } from "../../apps/buyer/src/approvals";
import { publishBuyerRun, runBuyer } from "../../apps/buyer/src/index";
import { createSpendControls } from "../../apps/buyer/src/spend";
import { createCriticFromEnv } from "../../apps/critic/src/main";
import { createEnsTarget } from "../../apps/relayer/src/ens-target";
import { ensFromEnv } from "../../apps/relayer/src/env";
import { createRegistryFeed } from "../../apps/relayer/src/feed";
import { createAuditLog } from "../../apps/relayer/src/hcs";
import { createHederaTopicPublisher } from "../../apps/relayer/src/hcs-hedera";
import { relayAuditFromChain } from "../../apps/relayer/src/hcs-source";
import { createKeeper } from "../../apps/relayer/src/keeper";
import { createListingRelayer } from "../../apps/relayer/src/relayer";
import { createScoreRelayer } from "../../apps/relayer/src/scores";
import { serviceByName } from "../../apps/services/catalog";
import { createPaywall } from "../../apps/services/common/paywall";
import { startService } from "../../apps/services/common/server";
import { createHederaPayAndCall } from "../../packages/x402-client/src/index";
import { listDemoServices } from "./list-services";

const root = fileURLToPath(new URL("../../", import.meta.url));
const SERVICES = [
  { name: "unit-convert", port: 4101 },
  { name: "suite-gamer", port: 4102 },
] as const;
const API_PORT = 4000;
const SIMULATOR_MCP = "https://simulator.worldcoin.org/api/mcp";
const HASHSCAN = "https://hashscan.io/testnet";
const ETHERSCAN = "https://sepolia.etherscan.io";

type Env = Record<string, string | undefined>;
export type StepRecord = { id: string; title: string; status: "ok" | "failed"; error?: string; notes: string[] };
export type Evidence = {
  startedAt: string;
  finishedAt?: string;
  steps: StepRecord[];
  listings: { name: string; serviceId: number; endpoint: string; source: "reused" | "listed-now"; listTx?: string }[];
  ensSubnames: { name: string; created: boolean }[];
  world: { verifyStatus?: number; nullifier?: string; note?: string };
  x402: { service: string; txId: string; payer?: string; hashscan: string | null }[];
  finalized: { serviceId: number; serviceName: string; roundId: string; median: number; nReveals: number; tx: string; link: string }[];
  ensWrites: { name: string; status: string; tx?: string; link?: string }[];
  ensReads: { name: string; resolver: string; score: number; confidence: number; round: string; hederaTx: string; block: string }[];
  hcs: { posted: number; topicId: string; link: string; messages: { seq: number; type: string; json: string; mirrorUrl: string }[] };
  buyer: {
    kind: "unattended" | "over-threshold-approved";
    pick: string;
    txId: string | null;
    hashscan: string | null;
    approvalId?: string;
    explanation: string;
  }[];
  agentSpend: { txId: string; merchant: string; amount: string; seq: number; mirrorUrl: string }[];
  knownGaps: string[];
};

export const hashscanTx = (id: string) => `${HASHSCAN}/transaction/${id}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => ((e as { shortMessage?: string }).shortMessage ?? (e as Error)?.message ?? String(e)).slice(0, 600);

async function portFree(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = createServer();
    s.once("error", () => ok(false));
    s.listen(port, "127.0.0.1", () => s.close(() => ok(true)));
  });
}

const rpc = (url: string) => http(url, { timeout: 60_000, retryCount: 5, retryDelay: 1500 });

/** Runs the demo story once on the real networks and returns everything it proved (or failed to prove). */
export async function runTestnetE2E(env: Env = process.env, opts: { roundTimeoutMs?: number; log?: (s: string) => void } = {}): Promise<Evidence> {
  const log = opts.log ?? ((s: string) => console.log(`[e2e] ${s}`));
  const need = (k: string) => {
    const v = env[k]?.trim();
    if (!v) throw new Error(`${k} missing`);
    return v;
  };
  const ev: Evidence = {
    startedAt: new Date().toISOString(),
    steps: [],
    listings: [],
    ensSubnames: [],
    world: {},
    x402: [],
    finalized: [],
    ensWrites: [],
    ensReads: [],
    hcs: { posted: 0, topicId: env.HCS_TOPIC_ID ?? "", link: `${HASHSCAN}/topic/${env.HCS_TOPIC_ID}`, messages: [] },
    buyer: [],
    agentSpend: [],
    knownGaps: [],
  };
  const stops: Array<() => Promise<void> | void> = [];
  const abort = new AbortController();

  async function step<T>(id: string, title: string, fn: (notes: string[]) => Promise<T>): Promise<T | undefined> {
    const rec: StepRecord = { id, title, status: "ok", notes: [] };
    ev.steps.push(rec);
    log(`step ${id}: ${title}`);
    try {
      return await fn(rec.notes);
    } catch (e) {
      rec.status = "failed";
      rec.error = errText(e);
      log(`step ${id} FAILED: ${rec.error}`);
      return undefined;
    }
  }

  const deployment = await loadDeployment(env.DEPLOYMENT_PATH);
  const { ServiceRegistry, CriticRegistry, RoundManager } = deployment.contracts;
  const rpcUrl = need("HEDERA_RPC_URL");
  const mirrorUrl = need("HEDERA_MIRROR_NODE_URL");
  const parent = need("ENS_PARENT_NAME");
  const client = createPublicClient({ transport: rpc(rpcUrl) });
  const fromBlock = BigInt(deployment.deploymentBlock);
  const apiUrl = `http://127.0.0.1:${API_PORT}`;
  const sellerAccountId = need("SELLER_ACCOUNT_ID");
  const startHead = await client.getBlockNumber();

  // Chunked log scan (hashio is unreliable for wide ranges).
  async function scan<T>(read: (from: bigint, to: bigint) => Promise<T[]>, from: bigint): Promise<T[]> {
    const head = await client.getBlockNumber();
    const out: T[] = [];
    for (let s = from; s <= head; s += 2000n) out.push(...(await read(s, s + 1999n > head ? head : s + 1999n)));
    return out;
  }

  let api: ChildProcess | undefined;
  const ids = new Map<string, number>(); // service name -> serviceId
  const settledAt = new Map<string, string>(); // port -> service name

  try {
    // ---- preflight + services -------------------------------------------------------------------
    const running = await step("0", "Preflight: ports free, in-process x402-paywalled services started", async (notes) => {
      for (const port of [API_PORT, ...SERVICES.map((s) => s.port)])
        if (!(await portFree(port))) throw new Error(`port ${port} is already in use; another copy may be running`);
      for (const { name, port } of SERVICES) {
        const service = serviceByName(name);
        if (!service) throw new Error(`unknown service ${name}`);
        const paywall = await createPaywall({
          facilitatorUrl: need("X402_FACILITATOR_URL"),
          payTo: sellerAccountId,
          price: "1",
          onSettled: (txId, payer) => {
            ev.x402.push({ service: name, txId, payer, hashscan: txId.includes("@") ? hashscanTx(txId) : null });
            log(`x402 settled for ${name}: ${txId}`);
          },
        });
        const started = await startService(service, port, "127.0.0.1", { paywall });
        stops.push(() => new Promise<void>((r) => started.server.close(() => r())));
        settledAt.set(String(port), name);
        notes.push(`${name} serving ${started.url}/call, price 1 tinybar, payTo ${sellerAccountId}`);
      }
      return true;
    });
    if (!running) throw new Error("services did not start; cannot continue");

    // ---- API ------------------------------------------------------------------------------------
    await step("0b", "Start the API (apps/api, port 4000)", async (notes) => {
      api = spawn("node", ["--import", "tsx", "src/index.ts"], {
        cwd: resolve(root, "apps/api"),
        env: { ...process.env, ...env, API_PORT: String(API_PORT), ENS_NAMES_PATH: "", API_URL: apiUrl } as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      api.stdout?.on("data", () => {});
      api.stderr?.on("data", (d) => log(`api: ${String(d).trim().slice(0, 200)}`));
      stops.push(() => void api?.kill());
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`${apiUrl}/services`)).ok) return void notes.push("API answering GET /services");
        } catch {}
        await sleep(2000);
      }
      throw new Error("API did not come up in 120 s");
    });

    // ---- critics + keeper (before listing: the commit window starts at listing) -----------------
    await step("3a", "Start the keeper and 3 critic daemons", async (notes) => {
      const keys = need("CRITIC_PRIVATE_KEYS").split(",").map((k) => k.trim());
      const accounts = need("CRITIC_ACCOUNT_IDS").split(",").map((k) => k.trim());
      mkdirSync(resolve(root, ".local-state/e2e"), { recursive: true });
      for (let i = 0; i < keys.length; i++) {
        const { critic, daemon, pollMs } = await createCriticFromEnv(
          {
            ...env,
            API_URL: apiUrl,
            CRITIC_PRIVATE_KEY: keys[i],
            CRITIC_HEDERA_PRIVATE_KEY: keys[i],
            CRITIC_ACCOUNT_ID: accounts[i],
            CRITIC_STATE_PATH: resolve(root, `.local-state/e2e/critic-${i + 1}.json`),
            CRITIC_ROUND_BUDGET_MS: "75000",
            X402_MODE: "hedera",
          },
          { log: (m) => log(`critic${i + 1} ${m}`.slice(0, 220)) },
        );
        void daemon.run(abort.signal, pollMs).catch((e) => log(`critic${i + 1} stopped: ${errText(e)}`));
        notes.push(`critic ${i + 1}: ${critic} (hedera account ${accounts[i]})`);
      }
      const account = privateKeyToAccount(need("RELAYER_PRIVATE_KEY") as `0x${string}`);
      const keeper = createKeeper({
        client,
        wallet: createWalletClient({ account, transport: rpc(rpcUrl) }),
        roundManager: RoundManager,
        serviceRegistry: ServiceRegistry,
        criticRegistry: CriticRegistry,
        fromBlock,
        log: (l) => log(`keeper ${l}`),
      });
      void keeper.run(10_000, abort.signal);
      notes.push(`keeper running as ${account.address}`);
    });

    // ---- 1: list services (idempotent) -----------------------------------------------------------
    await step("1a", "List unit-convert and suite-gamer on the Hedera testnet ServiceRegistry (reuse if already listed)", async (notes) => {
      const logs = await scan(
        (a, b) => client.getContractEvents({ address: ServiceRegistry, abi: serviceRegistryAbi, eventName: "ServiceListed", fromBlock: a, toBlock: b }),
        fromBlock,
      );
      const listed = logs.map((l) => serviceListedEvent(l.args));
      const missing: Record<string, string> = {};
      for (const { name, port } of SERVICES) {
        const endpoint = `http://127.0.0.1:${port}/call`;
        const hit = listed.filter((l) => l.endpoint === endpoint).at(-1);
        if (hit) {
          ids.set(name, Number(hit.serviceId));
          ev.listings.push({ name, serviceId: Number(hit.serviceId), endpoint, source: "reused" });
          notes.push(`${name}: already listed as service ${hit.serviceId}`);
        } else missing[name] = `http://127.0.0.1:${port}`;
      }
      if (Object.keys(missing).length) {
        const seller = privateKeyToAccount(need("SELLER_PRIVATE_KEY") as `0x${string}`);
        const made = await listDemoServices({ rpcUrl, registry: ServiceRegistry, seller, origins: missing });
        for (const m of made) {
          ids.set(m.name, m.serviceId);
          const port = SERVICES.find((s) => s.name === m.name)?.port;
          ev.listings.push({ name: m.name, serviceId: m.serviceId, endpoint: `http://127.0.0.1:${port}/call`, source: "listed-now" });
          notes.push(`${m.name}: listed now as service ${m.serviceId}`);
        }
      }
      if (ids.size < SERVICES.length) throw new Error("not every service has an id");
    });

    // ---- 1b: ENS subnames --------------------------------------------------------------------------
    await step("1b", "Sepolia ENS: set up namespace and create service subnames", async (notes) => {
      const ens = ensFromEnv((l) => log(`ens ${l}`));
      await ens.setupNamespace();
      notes.push(`namespace ready under ${parent}`);
      const relayer = createListingRelayer({
        feed: createRegistryFeed({ client, address: ServiceRegistry, fromBlock }),
        chain: ens.chain,
        onError: (id, cause) => notes.push(`listing ${id} failed: ${errText(cause)}`),
      });
      const pass = await relayer.processOnce();
      notes.push(`pass created=[${pass.created}] failed=[${pass.failed}] (already-existing subnames are skipped)`);
      for (const { name } of SERVICES) {
        const slug = serviceSlug(serviceByName(name)?.suite.serviceName ?? name);
        const full = serviceEnsName(slug, parent);
        ev.ensSubnames.push({ name: full, created: await ens.chain.hasSubname(slug) });
      }
    });

    // ---- 2: World ----------------------------------------------------------------------------------
    await step("2", "World ID 4.0 staging proof via the official simulator, validated by our API", async (notes) => {
      const webRequire = createRequire(new URL("../../apps/web/package.json", import.meta.url));
      const { IDKit, proofOfHuman } = webRequire("@worldcoin/idkit-core") as typeof import("@worldcoin/idkit-core");
      const worldApp = buildApp({
        publicClient: { getChainId: async () => 296 },
        contracts: {},
        world: {
          rpId: need("WORLD_RP_ID"),
          signingKey: need("WORLD_SIGNING_KEY"),
          environment: "staging",
          attestorKey: need("ATTESTOR_PRIVATE_KEY") as `0x${string}`,
        },
      });
      try {
        const criticWallet = privateKeyToAccount(need("CRITIC_PRIVATE_KEYS").split(",")[0]?.trim() as `0x${string}`).address;
        const ctx = (await worldApp.inject({ method: "POST", url: "/world/rp-context" })).json();
        const request = await IDKit.request({
          app_id: need("WORLD_APP_ID") as `app_${string}`,
          action: "register-critic",
          rp_context: ctx,
          allow_legacy_proofs: false,
          environment: "staging",
        } as never).preset(proofOfHuman({ signal: criticWallet }));
        const sim = await fetch(SIMULATOR_MCP, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "complete_test_request", arguments: { connect_url: request.connectorURI } },
          }),
        });
        if (!(await sim.text()).includes("proof_delivered")) throw new Error("simulator did not deliver a proof");
        const done = await request.pollUntilCompletion({ timeout: 180_000 });
        if (!done.success) throw new Error(`idkit completion failed: ${done.error}`);
        const res = await worldApp.inject({ method: "POST", url: "/world/verify", payload: { ...done.result, critic: criticWallet } });
        ev.world.verifyStatus = res.statusCode;
        ev.world.nullifier = res.json().nullifier;
        notes.push(`/world/verify -> ${res.statusCode}, voucher issued for ${criticWallet}, nullifier ${ev.world.nullifier}`);
        if (res.statusCode !== 200) throw new Error(`verify returned ${res.statusCode}: ${res.body.replace(/"sig":"0x[0-9a-f]+"/, "")}`);
        ev.world.note =
          "Proof is real (World staging simulator, validated at developer.world.org). The three persona critics that ran the rounds were registered by ticket 21 with synthetic nullifiers, not with this proof.";
      } finally {
        await worldApp.close();
      }
    });

    // ---- 3: wait for non-void finalised rounds for both services -----------------------------------
    await step("3b", "Rounds: critics pay via x402, commit, reveal; keeper finalises (non-void) for both services", async (notes) => {
      const finalizedEvent = getAbiItem({ abi: roundManagerAbi, name: "RoundFinalized" });
      const wanted = new Set(ids.values());
      const deadline = Date.now() + (opts.roundTimeoutMs ?? 40 * 60_000);
      const seen = new Set<string>();
      const have = new Set<number>();
      let from = startHead;
      while (Date.now() < deadline && have.size < wanted.size) {
        await sleep(15_000);
        try {
          const head = await client.getBlockNumber();
          for (let s = from; s <= head; s += 2000n) {
            const logs = await client.getLogs({ address: RoundManager, event: finalizedEvent, fromBlock: s, toBlock: s + 1999n > head ? head : s + 1999n, strict: true });
            for (const l of logs) {
              const key = l.args.roundId.toString();
              if (seen.has(key)) continue;
              seen.add(key);
              const serviceId = Number(l.args.serviceId);
              notes.push(`round ${key} service ${serviceId}: median ${l.args.median}, reveals ${l.args.nReveals}, void=${l.args.isVoid}, tx ${l.transactionHash}`);
              if (l.args.isVoid || !wanted.has(serviceId)) continue;
              have.add(serviceId);
              const serviceName = [...ids.entries()].find(([, v]) => v === serviceId)?.[0] ?? String(serviceId);
              ev.finalized.push({ serviceId, serviceName, roundId: key, median: l.args.median, nReveals: l.args.nReveals, tx: l.transactionHash, link: hashscanTx(l.transactionHash) });
            }
          }
          from = head > 10n ? head - 10n : head;
        } catch (e) {
          log(`round poll error: ${errText(e)}`);
        }
      }
      if (have.size < wanted.size) throw new Error(`only ${have.size}/${wanted.size} services finalised a non-void round before the timeout`);
    });

    // ---- 4: scores to ENS ---------------------------------------------------------------------------
    await step("4", "Write finalised scores to Sepolia ENS and read them back through the resolver", async (notes) => {
      const target = createEnsTarget({
        transport: rpc(need("SEPOLIA_RPC_URL")),
        account: privateKeyToAccount(need("SEPOLIA_RELAYER_PRIVATE_KEY") as `0x${string}`),
        parentName: parent,
      }).target;
      const relayer = createScoreRelayer({ target, parentName: parent });
      const reader = createSepoliaScoreReader(need("SEPOLIA_RPC_URL"));
      for (const f of ev.finalized) {
        const name = serviceEnsName(serviceSlug(serviceByName(f.serviceName)?.suite.serviceName ?? f.serviceName), parent);
        try {
          const res = await relayer.finalize({ name, roundId: f.roundId, score: f.median, nReveals: f.nReveals, hederaTx: f.tx });
          const tx = res.status === "written" ? res.transactionHash : undefined;
          ev.ensWrites.push({ name, status: res.status, tx, link: tx ? `${ETHERSCAN}/tx/${tx}` : undefined });
          const snap = await readEnsScore(reader, { name, parentName: parent });
          if (!snap) throw new Error(`no score record readable for ${name}`);
          ev.ensReads.push({ name, resolver: snap.resolver, score: snap.score, confidence: snap.confidence, round: snap.round, hederaTx: snap.hederaTx, block: snap.blockNumber });
          notes.push(`${name}: wrote ${res.status}; resolver ${snap.resolver} returns score ${snap.score} round ${snap.round}`);
        } catch (e) {
          ev.ensWrites.push({ name, status: `failed: ${errText(e)}` });
          notes.push(`${name} failed: ${errText(e)}`);
        }
      }
      if (!ev.ensReads.length) throw new Error("no ENS score could be read back");
    });

    // ---- 5 + 6: HCS audit log and buyer -------------------------------------------------------------
    const publisher = await createHederaTopicPublisher({
      accountId: need("RELAYER_ACCOUNT_ID"),
      privateKey: need("RELAYER_PRIVATE_KEY"),
      mirrorUrl,
      topicId: need("HCS_TOPIC_ID"),
    }).catch((e) => {
      log(`HCS publisher failed: ${errText(e)}`);
      return undefined;
    });
    if (publisher) stops.push(() => publisher.close());
    const audit = publisher ? createAuditLog(publisher) : undefined;

    await step("5", "HCS audit log: relay finalised rounds to the topic, read back from the mirror node", async (notes) => {
      if (!audit) throw new Error("HCS publisher unavailable");
      const result = await relayAuditFromChain({
        transport: rpc(rpcUrl),
        chainId: deployment.chainId,
        fromBlock,
        confirmations: 1n,
        roundManager: RoundManager,
        criticRegistry: CriticRegistry,
        audit,
      });
      ev.hcs.posted = result.posted;
      notes.push(`posted ${result.posted} new audit message(s) to topic ${need("HCS_TOPIC_ID")}`);
    });

    await step("6", "Buyer: one unattended payment, one approved over-threshold payment, agent_spend to HCS", async (notes) => {
      if (!audit) throw new Error("HCS publisher unavailable, so agent_spend cannot be posted");
      const buyerAccount = need("BUYER_ACCOUNT_ID");
      const signer = { accountId: buyerAccount, privateKey: need("BUYER_PRIVATE_KEY") };
      const putLimits = async (approvalThreshold: string) => {
        const res = await fetch(`${apiUrl}/buyer/limits`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ budget: "1000", perMerchantCap: "1000", allowlist: [sellerAccountId], approvalThreshold }),
        });
        if (!res.ok) throw new Error(`PUT /buyer/limits ${res.status}`);
      };
      const controls = createSpendControls({
        limits: () => fetchSpendLimits(apiUrl),
        approve: createApprovalClient({ apiUrl, timeoutMs: 120_000, pollMs: 1000 }),
        audit: audit.post,
        payer: buyerAccount,
      });
      const payAndCall = controls.wrap((onBeforePay) => createHederaPayAndCall({ onBeforePay }));
      const task = serviceByName("unit-convert")?.suite.cases[0]?.input;
      const once = (kind: "unattended" | "over-threshold-approved", approvalId?: () => string | undefined) =>
        runBuyer({ apiUrl, category: "conversion", task, strategy: "skeptique", payAndCall, signer }).then(async (run) => {
          await publishBuyerRun(apiUrl, run).catch((e) => notes.push(`publishBuyerRun: ${errText(e)}`));
          ev.buyer.push({ kind, pick: run.pick.name, txId: run.txId, hashscan: run.txId ? hashscanTx(run.txId) : null, approvalId: approvalId?.(), explanation: run.explanation });
          notes.push(`${kind}: picked ${run.pick.name}, paid=${run.paid}, tx ${run.txId}`);
          return run;
        });

      await putLimits("10");
      await once("unattended");

      await putLimits("0");
      let approved: string | undefined;
      const human = (async () => {
        for (let i = 0; i < 120 && !approved; i++) {
          const queue = (await (await fetch(`${apiUrl}/buyer/approvals`)).json()) as { id: string; status: string }[];
          const pending = queue.find((a) => a.status === "pending");
          if (pending) {
            const r = await fetch(`${apiUrl}/buyer/approvals/${pending.id}/approve`, { method: "POST" });
            if (r.ok) approved = pending.id;
          }
          await sleep(1000);
        }
      })();
      await once("over-threshold-approved", () => approved);
      await human;
      if (!approved) throw new Error("no approval request reached the queue");

      const entries = await readAuditLog({ mirrorUrl, topicId: need("HCS_TOPIC_ID"), limit: 50 });
      // The mirror node lags consensus by a few seconds.
      for (let i = 0; i < 10; i++) {
        const spends = entries.filter((e) => e.message.type === "agent_spend");
        if (spends.length >= 2) break;
        await sleep(3000);
        entries.splice(0, entries.length, ...(await readAuditLog({ mirrorUrl, topicId: need("HCS_TOPIC_ID"), limit: 50 })));
      }
      for (const e of entries) {
        if (e.message.type === "agent_spend")
          ev.agentSpend.push({ txId: e.message.txId, merchant: e.message.merchant, amount: e.message.amount, seq: e.sequenceNumber, mirrorUrl: e.mirrorUrl });
      }
      for (const b of ev.buyer) if (!ev.agentSpend.some((s) => s.txId === b.txId)) notes.push(`agent_spend for ${b.txId} not (yet) on the mirror node`);
    });

    // ---- final HCS read-back --------------------------------------------------------------------------
    await step("5b", "HCS read-back of the topic through the mirror node", async (notes) => {
      const entries = await readAuditLog({ mirrorUrl, topicId: need("HCS_TOPIC_ID"), limit: 25 });
      ev.hcs.messages = entries.map((e) => ({ seq: e.sequenceNumber, type: e.message.type, json: JSON.stringify(e.message), mirrorUrl: e.mirrorUrl }));
      notes.push(`${entries.length} message(s) readable`);
      if (!entries.length) throw new Error("topic read back empty");
    });
  } finally {
    abort.abort();
    for (const stop of stops.reverse()) await Promise.resolve(stop()).catch(() => {});
    api?.kill();
    ev.finishedAt = new Date().toISOString();
  }

  ev.knownGaps.push(
    "Ticket 20's live ENS test was skipped when it was merged; this run is the first live exercise of service-subname creation and score writes together.",
    "Ticket 23's HCS poster is not wired into the relayer `cli.ts`; this run calls `relayAuditFromChain` directly.",
    "Ticket 26's `agent_spend` posting was only mocked-tested before this run.",
    "The three persona critics were registered by ticket 21 with synthetic nullifiers, so their registrations are not backed by a live World proof.",
    "Services are served from localhost ports by this script, with endpoints `http://127.0.0.1:4101/call` and `:4102/call` recorded on-chain; they are not publicly reachable.",
    "ENS scores are written with `createScoreRelayer.finalize` directly: the services were listed with a zero ENS node on-chain, so `relayScoresFromChain` would skip them for a namehash mismatch.",
    "Rounds opened for the old fixture service 1 end void (its endpoint is dead) and are ignored here.",
  );
  return ev;
}

export function criteria(ev: Evidence) {
  return {
    x402Settled: ev.x402.some((x) => x.hashscan),
    finalizeTx: ev.finalized.length > 0,
    ensRead: ev.ensReads.length > 0,
    hcsMessage: ev.hcs.messages.length > 0,
    unattendedBuyer: ev.buyer.some((b) => b.kind === "unattended" && b.txId),
  };
}

export function renderEvidence(ev: Evidence): string {
  const code = (s: string) => `\`${s}\``;
  const L: string[] = [];
  const c = criteria(ev);
  L.push("# Testnet end to end: evidence", "");
  L.push(`Run started ${ev.startedAt}, finished ${ev.finishedAt}. Produced by \`scripts/demo/testnet-e2e.ts\` (\`pnpm test:live -t "testnet end to end"\`) against Hedera testnet, Sepolia ENS and World staging. Nothing below is mocked.`, "");
  L.push("## Acceptance", "", "| Criterion | Met |", "|---|---|");
  L.push(`| Settled x402 payment tx id | ${c.x402Settled ? "yes" : "NO"} |`);
  L.push(`| Finalise tx | ${c.finalizeTx ? "yes" : "NO"} |`);
  L.push(`| ENS record read through the resolver | ${c.ensRead ? "yes" : "NO"} |`);
  L.push(`| HCS message | ${c.hcsMessage ? "yes" : "NO"} |`);
  L.push(`| Unattended buyer payment | ${c.unattendedBuyer ? "yes" : "NO"} |`, "");
  L.push("## Steps", "");
  for (const s of ev.steps) {
    L.push(`### ${s.id}. ${s.title}`, "", `Status: **${s.status}**${s.error ? `, error: ${code(s.error)}` : ""}`, "");
    for (const n of s.notes) L.push(`- ${n}`);
    L.push("");
  }
  L.push("## Services on Hedera testnet", "", "| Service | Service id | Endpoint | Listing |", "|---|---|---|---|");
  for (const l of ev.listings) L.push(`| ${l.name} | ${l.serviceId} | ${code(l.endpoint)} | ${l.source} |`);
  L.push("", "## ENS subnames (Sepolia)", "", "| Name | Exists |", "|---|---|");
  for (const e of ev.ensSubnames) L.push(`| ${code(e.name)} | ${e.created ? "yes" : "no"} |`);
  L.push("", "## World", "", `Verify status ${ev.world.verifyStatus ?? "n/a"}, nullifier ${ev.world.nullifier ? code(ev.world.nullifier) : "n/a"}. ${ev.world.note ?? ""}`, "");
  L.push("## Settled x402 payments", "", "| Service | Tx id | HashScan | Payer |", "|---|---|---|---|");
  for (const x of ev.x402) L.push(`| ${x.service} | ${code(x.txId)} | ${x.hashscan ? `[view](${x.hashscan})` : "n/a"} | ${x.payer ?? ""} |`);
  L.push("", "## Finalised rounds", "", "| Service | Round | Median | Reveals | Finalise tx |", "|---|---|---|---|---|");
  for (const f of ev.finalized) L.push(`| ${f.serviceName} (#${f.serviceId}) | ${f.roundId} | ${f.median} | ${f.nReveals} | [${f.tx.slice(0, 14)}…](${f.link}) |`);
  L.push("", "## ENS writes and resolver reads", "", "| Name | Write | Resolver | Score | Confidence | Round | Hedera tx in record | Block |", "|---|---|---|---|---|---|---|---|");
  for (const w of ev.ensWrites) {
    const r = ev.ensReads.find((x) => x.name === w.name);
    L.push(`| ${code(w.name)} | ${w.tx ? `[${w.status}](${w.link})` : w.status} | ${r?.resolver ?? ""} | ${r?.score ?? ""} | ${r?.confidence ?? ""} | ${r?.round ?? ""} | ${r?.hederaTx ? code(r.hederaTx.slice(0, 14) + "…") : ""} | ${r?.block ?? ""} |`);
  }
  L.push("", `## HCS audit log, topic [${ev.hcs.topicId}](${ev.hcs.link})`, "", `Posted this run: ${ev.hcs.posted}. Latest messages read back from the mirror node:`, "");
  L.push("| Seq | Type | Message | Mirror row |", "|---|---|---|---|");
  for (const m of ev.hcs.messages) L.push(`| ${m.seq} | ${m.type} | ${code(m.json)} | [row](${m.mirrorUrl}) |`);
  L.push("", "## Buyer", "", "| Kind | Picked | Payment tx | Approval |", "|---|---|---|---|");
  for (const b of ev.buyer) L.push(`| ${b.kind} | ${b.pick} | ${b.hashscan ? `[${b.txId}](${b.hashscan})` : "none"} | ${b.approvalId ?? "n/a"} |`);
  for (const b of ev.buyer) L.push("", `- ${b.kind}: ${b.explanation}`);
  L.push("", "`agent_spend` messages on HCS:", "", "| Seq | Tx id | Merchant | Amount (tinybars) | Mirror row |", "|---|---|---|---|---|");
  for (const s of ev.agentSpend) L.push(`| ${s.seq} | ${code(s.txId)} | ${s.merchant} | ${s.amount} | [row](${s.mirrorUrl}) |`);
  L.push("", "## Known gaps (honest)", "");
  for (const g of ev.knownGaps) L.push(`- ${g}`);
  return `${L.join("\n")}\n`;
}

export function writeEvidence(ev: Evidence, path = resolve(root, "docs/evidence/testnet-e2e.md")) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderEvidence(ev));
  writeFileSync(path.replace(/\.md$/, ".json"), `${JSON.stringify(ev, null, 2)}\n`);
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
  const ev = await runTestnetE2E(process.env);
  console.log(`evidence written to ${writeEvidence(ev)}`);
  console.log(JSON.stringify(criteria(ev)));
  process.exit(0);
}
