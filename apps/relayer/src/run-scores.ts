import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { type Address, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createEnsTarget } from "./ens-target";
import { relayScoresFromChain } from "./score-source";
import { createScoreRelayer } from "./scores";
import { fileTransactionJournal } from "./transaction-journal";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function env(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
if (!process.argv[2]) throw new Error("Provide the public ENS namespace/name-mapping JSON configuration path");
const config: unknown = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!config || typeof config !== "object") throw new Error("Expected score relayer JSON configuration");
const data = config as Record<string, unknown>;
function address(key: string): Address {
  const value = data[key];
  if (typeof value !== "string" || !isAddress(value)) throw new Error(`Invalid ${key}`);
  return value;
}
function integer(key: string) {
  const value = data[key];
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new Error(`Expected decimal string ${key}`);
  return BigInt(value);
}
function names(key: string): Record<string, string> {
  const value = data[key];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.values(value).some((name) => typeof name !== "string")
  )
    throw new Error(`Invalid ${key}`);
  return value as Record<string, string>;
}
const deployment = await loadDeployment();
if (typeof data.parentName !== "string") throw new Error("Missing parentName");
const key = env("SEPOLIA_RELAYER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Invalid Sepolia relayer private key format");
const adapter = createEnsTarget({
  transport: http(env("SEPOLIA_RPC_URL")),
  account: privateKeyToAccount(key as `0x${string}`),
  parentName: data.parentName,
  criticRegistry: address("ensCriticRegistry"),
  criticResolver: address("ensCriticResolver"),
  criticExpiry: integer("ensCriticExpiry"),
  journal: fileTransactionJournal(env("ENS_TRANSACTION_JOURNAL")),
});
const result = await relayScoresFromChain({
  transport: http(env("HEDERA_RPC_URL")),
  chainId: deployment.chainId,
  fromBlock: BigInt(deployment.deploymentBlock),
  confirmations: integer("confirmations"),
  roundManager: deployment.contracts.RoundManager,
  serviceRegistry: deployment.contracts.ServiceRegistry,
  criticRegistry: deployment.contracts.CriticRegistry,
  parentName: data.parentName,
  serviceNames: names("serviceNames"),
  criticNames: names("criticNames"),
  relayer: createScoreRelayer({ ...adapter, parentName: data.parentName }),
});
console.log(JSON.stringify(result));
