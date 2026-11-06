import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { buildApp } from "@skeptic/api";
import { type Address, deployLocal } from "@skeptic/contracts/deploy";
import type { HardhatRuntimeEnvironment, JsonRpcServer } from "hardhat/types";
import { createPublicClient, http } from "viem";

export type ServiceStarter = (ctx: { rpcUrl: string }) => Promise<{ url: string; close: () => Promise<void> }>;

export interface StackOptions {
  /** Demo services to start, keyed by name. Each starter listens on its own free port. */
  services?: Record<string, ServiceStarter>;
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
const contractsDir = dirname(require.resolve("@skeptic/contracts/package.json"));

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

    const api = buildApp({ publicClient, contracts });
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
