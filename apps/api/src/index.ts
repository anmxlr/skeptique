import { signRequest } from "@worldcoin/idkit-server";
import { createPublicClient, type Hex, http } from "viem";
import { buildApp, createWorldVerifier, type WorldConfig } from "./app";

const port = Number(process.env.API_PORT);
if (!Number.isInteger(port)) throw new Error("API_PORT must be set");
const rpcUrl = process.env.HEDERA_RPC_URL;
if (!rpcUrl) throw new Error("HEDERA_RPC_URL must be set");

function worldFromEnv(env: NodeJS.ProcessEnv): WorldConfig | undefined {
  const { WORLD_RP_ID: rpId, WORLD_SIGNING_KEY: signingKey, ATTESTOR_PRIVATE_KEY: attestorKey } = env;
  const environment = env.WORLD_ENVIRONMENT;
  if (!rpId || !signingKey || !attestorKey || !environment) return undefined;
  return {
    rpId,
    action: "register-critic",
    environment,
    signRequest: (action) => signRequest({ signingKeyHex: signingKey, action }),
    verifyProof: createWorldVerifier({ rpId, environment }),
    attestorKey: attestorKey as Hex,
  };
}

const app = buildApp(
  {
    publicClient: createPublicClient({ transport: http(rpcUrl) }),
    contracts: {},
    world: worldFromEnv(process.env),
  },
  { logger: true },
);
await app.listen({ port, host: "0.0.0.0" });
