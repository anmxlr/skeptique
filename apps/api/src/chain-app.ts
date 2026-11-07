import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import type { Deployment } from "@skeptique/shared/deployment";
import { createPublicClient, http } from "viem";
import {
  buildApp,
  createCriticSource,
  createFinalizedRankingSource,
  createRegistrySource,
  createRoundSource,
  createServiceReviewSource,
  MemoryEvidenceStore,
} from "./app";
import type { WorldEnvironment } from "./world";

export interface ChainAppOptions {
  rpcUrl: string;
  deployment: Deployment;
  /** ENS_PARENT_NAME; defaults to the manifest's parent name. */
  ensParentName?: string;
  /** Explicit service ID -> ENS name mapping (ENS_NAMES_PATH). */
  serviceNames?: Record<string, string>;
  /** Server-side World onboarding values; omitted in read-only mode. */
  world?: {
    rpId?: string;
    signingKey?: string;
    environment?: string;
    attestorKey?: string;
  };
  webOrigin?: string;
  /**
   * For stateless hosts (one serverless function per request): no World onboarding and no live event
   * stream. Callers must also refuse writes, since evidence and spend state only live in memory.
   */
  readOnly?: boolean;
  logger?: boolean;
}

/** The API wired to the deployed contracts, as served by `pnpm --filter @skeptique/api start`. */
export async function buildChainApp(options: ChainAppOptions) {
  const { deployment } = options;
  const ensParentName = options.ensParentName?.trim() || deployment.ensParentName;
  const publicClient = createPublicClient({ transport: http(options.rpcUrl) });
  if ((await publicClient.getChainId()) !== deployment.chainId)
    throw new Error("RPC chain does not match deployment manifest");

  const w = options.world;
  const world =
    !options.readOnly && w?.rpId && w.signingKey && w.environment && w.attestorKey
      ? {
          rpId: w.rpId,
          signingKey: w.signingKey,
          environment: w.environment as WorldEnvironment,
          attestorKey: w.attestorKey as `0x${string}`,
        }
      : undefined;

  const { ServiceRegistry, CriticRegistry, RoundManager } = deployment.contracts;
  const fromBlock = BigInt(deployment.deploymentBlock);
  const listings = createRegistrySource({
    client: publicClient,
    address: ServiceRegistry,
    serviceNames: options.serviceNames ?? {},
    ensParent: ensParentName,
    fromBlock,
  });
  const ranked = createFinalizedRankingSource({
    listing: listings,
    client: publicClient,
    address: RoundManager,
    fromBlock,
  });
  const evidenceStore = new MemoryEvidenceStore();
  return buildApp(
    {
      publicClient,
      contracts: deployment.contracts,
      deployment: { ...deployment, ensParentName },
      listings,
      critics: createCriticSource({
        client: publicClient,
        address: CriticRegistry,
        roundManager: RoundManager,
        fromBlock,
      }),
      rounds: createRoundSource({ client: publicClient, address: RoundManager, fromBlock }),
      events: options.readOnly ? undefined : { client: publicClient, address: RoundManager, fromBlock },
      evidence: evidenceStore,
      serviceReviews: createServiceReviewSource({
        client: publicClient,
        address: RoundManager,
        store: evidenceStore,
        fromBlock,
      }),
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
      world,
      webOrigin: options.readOnly ? undefined : options.webOrigin?.trim() || undefined,
    },
    { logger: options.logger ?? false },
  );
}
