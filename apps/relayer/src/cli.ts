import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { createPublicClient, http } from "viem";
import { ensFromEnv, need } from "./env";
import { createRegistryFeed } from "./feed";
import { createListingRelayer } from "./relayer";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const deployment = await loadDeployment();
const client = createPublicClient({ transport: http(need("HEDERA_RPC_URL")) });
if (await client.getChainId() !== deployment.chainId) throw new Error("Relayer RPC chain does not match deployment");
const ens = ensFromEnv(console.log);
const relayer = createListingRelayer({
  feed: createRegistryFeed({
    client,
    address: deployment.contracts.ServiceRegistry,
  }),
  chain: ens.chain,
  onError: (serviceId, cause) => console.error(`listing ${serviceId}:`, cause),
});

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
await relayer.run(Number(process.env.RELAYER_POLL_MS ?? 15_000), controller.signal);
