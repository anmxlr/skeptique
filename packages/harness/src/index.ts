import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import {
  type AppDeps,
  buildApp,
  createCriticSource,
  createFinalizedRankingSource,
  createRegistrySource,
  createRoundSource,
  createServiceReviewSource,
  MemoryEvidenceStore,
} from "@skeptique/api";
import { type Address, deployLocal } from "@skeptique/contracts/deploy";
import type { HardhatRuntimeEnvironment, JsonRpcServer } from "hardhat/types";
import { createPublicClient, http } from "viem";

export type ServiceStarter = (ctx: { rpcUrl: string }) => Promise<{ url: string; close: () => Promise<void> }>;

export interface StackOptions {
  /** Demo services to start, keyed by name. Each starter listens on its own free port. */
  services?: Record<string, ServiceStarter>;
  /** Extra API dependencies, e.g. the marketplace source a test wants served. */
  api?: Pick<AppDeps, "marketplace" | "world" | "evidenceStore" | "evidence" | "serviceReviews">;
}

export interface Stack {
  rpcUrl: string;
  chainId: number;
  contracts: Record<string, Address>;
  apiUrl: string;
  services: Record<string, string>;
  stop: () => Promise<void>;
}

const require = createRequire(import.meta.url);
const contractsDir = dirname(require.resolve("@skeptique/contracts/package.json"));

function loadHardhat(): HardhatRuntimeEnvironment {
  const contractsRequire = createRequire(join(contractsDir, "package.json"));
  process.env.HARDHAT_CONFIG ??= join(contractsDir, "hardhat.config.ts");
  // Unlike its CLI, Hardhat as a library does not register ts-node for a TypeScript config.
  if (!(process as unknown as Record<symbol, unknown>)[Symbol.for("ts-node.register.instance")]) {
    contractsRequire("ts-node").register({ transpileOnly: true, project: join(contractsDir, "tsconfig.json") });
  }
  return contractsRequire("hardhat");
}

/** Boots an in-process local chain, deploys the contracts package's contracts, then the API and services. */
export async function startStack(options: StackOptions = {}): Promise<Stack> {
  const stoppers: Array<() => Promise<void>> = [];
  const stop = async () => {
    for (const fn of stoppers.splice(0).reverse()) await fn();
  };

  try {
    const hre = loadHardhat();
    await hre.network.provider.request({ method: "hardhat_reset", params: [] });
    await hre.run("compile", { quiet: true });

    const server: JsonRpcServer = await hre.run("node:create-server", {
      hostname: "127.0.0.1",
      port: 0,
      provider: hre.network.provider,
    });
    const { port: rpcPort } = await server.listen();
    stoppers.push(() => server.close());
    const rpcUrl = `http://127.0.0.1:${rpcPort}`;

    const contracts = await deployLocal(hre);

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const chainId = await publicClient.getChainId();

    const registryListings = contracts.ServiceRegistry
      ? createRegistrySource({ client: publicClient, address: contracts.ServiceRegistry })
      : undefined;
    const listings =
      registryListings && contracts.RoundManager
        ? createFinalizedRankingSource({
            listing: registryListings,
            client: publicClient,
            address: contracts.RoundManager,
          })
        : registryListings;
    const critics = contracts.CriticRegistry
      ? createCriticSource({
          client: publicClient,
          address: contracts.CriticRegistry,
          roundManager: contracts.RoundManager,
        })
      : undefined;
    const evidenceStore = options.api?.evidence ?? options.api?.evidenceStore ?? new MemoryEvidenceStore();
    const serviceReviews =
      options.api?.serviceReviews ??
      (contracts.RoundManager
        ? createServiceReviewSource({ client: publicClient, address: contracts.RoundManager, store: evidenceStore })
        : undefined);
    const rounds = contracts.RoundManager
      ? createRoundSource({ client: publicClient, address: contracts.RoundManager })
      : undefined;
    const api = buildApp({
      ...options.api,
      publicClient,
      contracts,
      listings,
      critics,
      rounds,
      evidenceStore,
      serviceReviews,
    });
    stoppers.push(() => api.close());
    await api.listen({ port: 0, host: "127.0.0.1" });
    const apiUrl = `http://127.0.0.1:${(api.server.address() as AddressInfo).port}`;

    const services: Record<string, string> = {};
    for (const [name, start] of Object.entries(options.services ?? {})) {
      const service = await start({ rpcUrl });
      stoppers.push(service.close);
      services[name] = service.url;
    }

    return { rpcUrl, chainId, contracts, apiUrl, services, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
