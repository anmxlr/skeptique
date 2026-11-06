import { createPublicClient, http } from "viem";
import { buildApp } from "./app";
import type { WorldEnvironment } from "./world";

const port = Number(process.env.API_PORT);
if (!Number.isInteger(port)) throw new Error("API_PORT must be set");
const rpcUrl = process.env.HEDERA_RPC_URL;
if (!rpcUrl) throw new Error("HEDERA_RPC_URL must be set");

const worldKeys = ["WORLD_RP_ID", "WORLD_SIGNING_KEY", "WORLD_ENVIRONMENT", "ATTESTOR_PRIVATE_KEY"] as const;
const world = worldKeys.every((key) => process.env[key])
  ? {
      rpId: process.env.WORLD_RP_ID as string,
      signingKey: process.env.WORLD_SIGNING_KEY as string,
      environment: process.env.WORLD_ENVIRONMENT as WorldEnvironment,
      attestorKey: process.env.ATTESTOR_PRIVATE_KEY as `0x${string}`,
    }
  : undefined;

const app = buildApp(
  { publicClient: createPublicClient({ transport: http(rpcUrl) }), contracts: {}, world },
  { logger: true },
);
await app.listen({ port, host: "0.0.0.0" });
