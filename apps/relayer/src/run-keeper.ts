import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { need } from "./env";
import { createKeeper } from "./keeper";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const deployment = await loadDeployment();
const transport = http(need("HEDERA_RPC_URL"));
const client = createPublicClient({ transport });
if ((await client.getChainId()) !== deployment.chainId) throw new Error("Keeper RPC chain does not match deployment");
const account = privateKeyToAccount(need("RELAYER_PRIVATE_KEY") as `0x${string}`);
const keeper = createKeeper({
  client,
  wallet: createWalletClient({ account, transport }),
  roundManager: deployment.contracts.RoundManager,
  serviceRegistry: deployment.contracts.ServiceRegistry,
  criticRegistry: deployment.contracts.CriticRegistry,
  fromBlock: BigInt(deployment.deploymentBlock),
  log: (line) => console.log(`[keeper] ${line}`),
});

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
await keeper.run(Number(process.env.KEEPER_POLL_MS ?? 15_000), controller.signal);
