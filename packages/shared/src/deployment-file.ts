import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeploymentSchema } from "./deployment";

export const DEFAULT_DEPLOYMENT_PATH = fileURLToPath(
  new URL("../../../contracts/deployments/hedera-testnet.json", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function resolveDeploymentPath(path = process.env.DEPLOYMENT_PATH): string {
  const configured = path?.trim();
  return configured ? resolve(repositoryRoot, configured) : DEFAULT_DEPLOYMENT_PATH;
}

/** Server/CLI only. The manifest is public; private keys and RPC credentials never belong in it. */
export async function loadDeployment(path?: string) {
  return DeploymentSchema.parse(JSON.parse(await readFile(resolveDeploymentPath(path), "utf8")));
}
