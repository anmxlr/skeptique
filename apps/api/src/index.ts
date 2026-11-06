import { createPublicClient, http } from "viem";
import { buildApp } from "./app";

const port = Number(process.env.API_PORT);
if (!Number.isInteger(port)) throw new Error("API_PORT must be set");
const rpcUrl = process.env.HEDERA_RPC_URL;
if (!rpcUrl) throw new Error("HEDERA_RPC_URL must be set");

const app = buildApp(
  { publicClient: createPublicClient({ transport: http(rpcUrl) }), contracts: {} },
  { logger: true },
);
await app.listen({ port, host: "0.0.0.0" });
