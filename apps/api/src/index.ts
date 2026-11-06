import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { signRequest } from "@worldcoin/idkit-server";
import { createPublicClient, type Hex, http } from "viem";
import {
  buildApp,
  createCriticSource,
  createFinalizedRankingSource,
  createRegistrySource,
  createRoundSource,
  createServiceReviewSource,
  createWorldVerifier,
  MemoryEvidenceStore,
  type WorldConfig,
} from "./app";

const root = fileURLToPath(new URL("../../../", import.meta.url));
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));

const port = Number(process.env.API_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API_PORT must be between 1 and 65535");
const rpcUrl = process.env.HEDERA_RPC_URL;
if (!rpcUrl) throw new Error("HEDERA_RPC_URL must be set");

function worldFromEnv(env: NodeJS.ProcessEnv): WorldConfig | undefined {
  const {
    WORLD_APP_ID: appId,
    WORLD_RP_ID: rpId,
    WORLD_SIGNING_KEY: signingKey,
    ATTESTOR_PRIVATE_KEY: attestorKey,
  } = env;
  const environment = env.WORLD_ENVIRONMENT;
  if (!appId || !rpId || !signingKey || !attestorKey || !environment) return undefined;
  return {
    appId,
    rpId,
    action: "register-critic",
    environment,
    signRequest: (action) => signRequest({ signingKeyHex: signingKey, action }),
    verifyProof: createWorldVerifier({ rpId, environment }),
    attestorKey: attestorKey as Hex,
  };
}

const deployment = await loadDeployment();
const ensParentName = process.env.ENS_PARENT_NAME?.trim() || deployment.ensParentName;
const publicClient = createPublicClient({ transport: http(rpcUrl) });
if ((await publicClient.getChainId()) !== deployment.chainId)
  throw new Error("RPC chain does not match deployment manifest");
let serviceNames: Record<string, string> = {};
if (process.env.ENS_NAMES_PATH?.trim()) {
  const config: unknown = JSON.parse(await readFile(resolve(root, process.env.ENS_NAMES_PATH), "utf8"));
  const names = config && typeof config === "object" && "serviceNames" in config ? config.serviceNames : undefined;
  if (
    !names ||
    typeof names !== "object" ||
    Array.isArray(names) ||
    Object.entries(names).some(([id, name]) => !/^[1-9]\d*$/.test(id) || typeof name !== "string")
  )
    throw new Error("ENS_NAMES_PATH must provide serviceNames mapping IDs to ENS names");
  serviceNames = names as Record<string, string>;
}
const { ServiceRegistry, CriticRegistry, RoundManager } = deployment.contracts;
const listings = createRegistrySource({ client: publicClient, address: ServiceRegistry, serviceNames });
const ranked = createFinalizedRankingSource({ listing: listings, client: publicClient, address: RoundManager });
const evidenceStore = new MemoryEvidenceStore();
const app = buildApp(
  {
    publicClient,
    contracts: deployment.contracts,
    deployment: { ...deployment, ensParentName },
    listings,
    critics: createCriticSource({ client: publicClient, address: CriticRegistry, roundManager: RoundManager }),
    rounds: createRoundSource({ client: publicClient, address: RoundManager }),
    evidenceStore,
    serviceReviews: createServiceReviewSource({ client: publicClient, address: RoundManager, store: evidenceStore }),
    marketplace: {
      source: ranked,
      isCritic: (address) =>
        publicClient.readContract({
          address: CriticRegistry,
          abi: criticRegistryAbi,
          functionName: "isCritic",
          args: [address as `0x${string}`],
        }),
    },
    world: worldFromEnv(process.env),
  },
  { logger: true },
);
await app.listen({ port, host: "0.0.0.0" });
