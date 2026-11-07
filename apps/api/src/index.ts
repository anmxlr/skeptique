import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import { buildChainApp } from "./chain-app";

const root = fileURLToPath(new URL("../../../", import.meta.url));
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));

const port = Number(process.env.API_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API_PORT must be between 1 and 65535");
const rpcUrl = process.env.HEDERA_RPC_URL;
if (!rpcUrl) throw new Error("HEDERA_RPC_URL must be set");

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

const app = await buildChainApp({
  rpcUrl,
  deployment: await loadDeployment(),
  ensParentName: process.env.ENS_PARENT_NAME,
  serviceNames,
  world: {
    rpId: process.env.WORLD_RP_ID,
    signingKey: process.env.WORLD_SIGNING_KEY,
    environment: process.env.WORLD_ENVIRONMENT,
    attestorKey: process.env.ATTESTOR_PRIVATE_KEY,
  },
  webOrigin: process.env.WEB_ORIGIN,
  logger: true,
});
await app.listen({ port, host: "0.0.0.0" });
