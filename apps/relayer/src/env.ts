import { existsSync } from "node:fs";
import { createSepoliaEns } from "./ens/sepolia";

/** Loads .env from the app or repo root and builds the Sepolia ENS handle from it. */
export function ensFromEnv(log?: (line: string) => void) {
  for (const path of [".env", "../../.env"]) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      break;
    }
  }
  return createSepoliaEns({
    rpcUrl: need("SEPOLIA_RPC_URL"),
    parent: need("ENS_PARENT_NAME"),
    operatorKey: need("ENS_OPERATOR_PRIVATE_KEY") as `0x${string}`,
    relayerKey: need("SEPOLIA_RELAYER_PRIVATE_KEY") as `0x${string}`,
    log,
  });
}

export function need(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`missing ${key} in .env`);
  return value;
}
