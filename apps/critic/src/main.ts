import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { createHederaPayAndCall, createLocalPayAndCall, type PayAndCall } from "@skeptique/x402-client";
import { type Address, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createCriticDaemon, type DaemonChain, type OpenedRound } from "./daemon";
import { createConfiguredProbeModel, type ProbeModel } from "./probes";
import { runServiceReview } from "./review";
import { createRoundAgent, FileRoundStateStore } from "./round-agent";
import { createViemRoundContract } from "./round-chain";

type Env = Record<string, string | undefined>;
type Deployment = Awaited<ReturnType<typeof loadDeployment>>;

export type CriticDeps = {
  loadDeployment?: () => Promise<Deployment>;
  probeModel?: ProbeModel;
  payAndCall?: (service: { pricePerCall: string }) => PayAndCall;
  log?: (message: string) => void;
};

const LOG_CHUNK_BLOCKS = 5000n;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/** Reads rounds from RoundOpened logs since the manifest's deployment block, scanning each block range once. */
function createViemDaemonChain(options: { rpcUrl: string; deployment: Deployment }): DaemonChain {
  const client = createPublicClient({ transport: http(options.rpcUrl) });
  const { RoundManager, CriticRegistry } = options.deployment.contracts;
  const rounds = new Map<number, OpenedRound>();
  let cursor = BigInt(options.deployment.deploymentBlock);
  return {
    now: async () => Number((await client.getBlock()).timestamp),
    openedRounds: async () => {
      const latest = await client.getBlockNumber();
      while (cursor <= latest) {
        const toBlock = cursor + LOG_CHUNK_BLOCKS - 1n < latest ? cursor + LOG_CHUNK_BLOCKS - 1n : latest;
        const logs = await client.getContractEvents({
          address: RoundManager,
          abi: roundManagerAbi,
          eventName: "RoundOpened",
          fromBlock: cursor,
          toBlock,
        });
        for (const { args } of logs) {
          const roundId = Number(args.roundId);
          rounds.set(roundId, {
            roundId,
            serviceId: Number(args.serviceId),
            commitEnd: Number(args.commitEnd),
            revealEnd: Number(args.revealEnd),
          });
        }
        cursor = toBlock + 1n;
      }
      return [...rounds.values()].sort((a, b) => a.roundId - b.roundId);
    },
    activeRound: async (critic) =>
      Number(
        await client.readContract({
          address: CriticRegistry,
          abi: criticRegistryAbi,
          functionName: "activeRound",
          args: [critic as Address],
        }),
      ),
  };
}

/** Builds the unattended critic from env, the deployment manifest and the chain. Nothing is hard-coded. */
export async function createCriticFromEnv(env: Env, deps: CriticDeps = {}) {
  const deployment = await (deps.loadDeployment ?? (() => loadDeployment(env.DEPLOYMENT_PATH)))();
  const rpcUrl = required(env, "HEDERA_RPC_URL");
  const apiUrl = required(env, "API_URL").replace(/\/+$/, "");
  const account = privateKeyToAccount(required(env, "CRITIC_PRIVATE_KEY") as `0x${string}`);
  const critic = account.address;
  const mode = env.X402_MODE?.trim() || "hedera";
  if (mode !== "hedera" && mode !== "local") throw new Error("X402_MODE must be hedera or local");
  const signer =
    mode === "hedera"
      ? { accountId: required(env, "CRITIC_ACCOUNT_ID"), privateKey: required(env, "CRITIC_HEDERA_PRIVATE_KEY") }
      : {};
  const probeModel = deps.probeModel ?? createConfiguredProbeModel(env);
  const contract = createViemRoundContract({ rpcUrl, address: deployment.contracts.RoundManager, account });
  const store = new FileRoundStateStore(required(env, "CRITIC_STATE_PATH"));
  const agent = createRoundAgent({ critic, contract, store });
  const payFor =
    deps.payAndCall ??
    ((service: { pricePerCall: string }) =>
      mode === "hedera"
        ? createHederaPayAndCall()
        : createLocalPayAndCall({ priceFor: async () => service.pricePerCall }));
  const log = deps.log ?? ((message: string) => console.log(`[critic ${critic}] ${message}`));
  const pollMs = positiveInt(env, "CRITIC_POLL_MS", 5000);

  const daemon = createCriticDaemon({
    critic,
    chain: createViemDaemonChain({ rpcUrl, deployment }),
    contract,
    agent,
    store,
    log,
    roundBudgetMs: positiveInt(env, "CRITIC_ROUND_BUDGET_MS", 120_000),
    marginSecs: positiveInt(env, "CRITIC_COMMIT_MARGIN_SECS", 10),
    review: async ({ round, budgetMs }) => {
      const response = await fetch(`${apiUrl}/services/${round.serviceId}`);
      if (!response.ok) throw new Error(`Service lookup returned ${response.status}`);
      const service = (await response.json()) as {
        name: string;
        category: string;
        endpoint: string;
        pricePerCall: string;
        specHash: string;
      };
      const result = await runServiceReview({
        suiteUrl: `${apiUrl}/services/${round.serviceId}/suite`,
        evidenceUrl: `${apiUrl}/evidence`,
        specHash: service.specHash,
        roundId: round.roundId,
        critic,
        endpoint: service.endpoint,
        maxPrice: service.pricePerCall,
        signer,
        payAndCall: payFor(service),
        serviceDescription: `${service.name} (${service.category})`,
        seed: round.roundId,
        probeModel,
        budgetMs,
      });
      return { evidenceHash: result.evidenceHash as `0x${string}`, evidence: result.evidence };
    },
  });
  return { critic, daemon, pollMs };
}
