import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { privateKeyToAccount } from "viem/accounts";
import { demoServices } from "../../apps/services/catalog";
import { listDemoServices } from "./list-services";

/*
 * Lists demo services served by the web app at <site>/svc/<name> on the deployed ServiceRegistry, with ENS nodes.
 * Usage: pnpm --filter @skeptique/scripts exec tsx demo/list-public.ts https://<site> [name ...]
 * Needs HEDERA_RPC_URL, SELLER_PRIVATE_KEY and ENS_PARENT_NAME (read from the repo .env when present).
 * Each listing pays the contract's minimum listing fee and opens a review round.
 */
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [site, ...names] = process.argv.slice(2);
if (!site || !/^https?:\/\//.test(site)) throw new Error("Usage: list-public.ts https://<site> [service name ...]");
const need = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} must be set`);
  return value;
};

const chosen = names.length > 0 ? names : demoServices.map((service) => service.name);
const base = site.replace(/\/+$/, "");
const deployment = await loadDeployment();
const listed = await listDemoServices({
  rpcUrl: need("HEDERA_RPC_URL"),
  registry: deployment.contracts.ServiceRegistry,
  seller: privateKeyToAccount(need("SELLER_PRIVATE_KEY") as `0x${string}`),
  origins: Object.fromEntries(chosen.map((name) => [name, `${base}/svc/${name}`])),
  ensParent: process.env.ENS_PARENT_NAME?.trim() || deployment.ensParentName,
});
for (const { name, serviceId } of listed)
  console.log(`listed ${name} as service #${serviceId}: ${base}/svc/${name}/call`);
