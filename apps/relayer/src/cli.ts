import { createPublicClient, http } from "viem";
import { ensFromEnv, need } from "./env";
import { createRegistryFeed } from "./feed";
import { createListingRelayer } from "./relayer";

const ens = ensFromEnv(console.log);
const relayer = createListingRelayer({
  feed: createRegistryFeed({
    client: createPublicClient({ transport: http(need("HEDERA_RPC_URL")) }),
    address: need("SERVICE_REGISTRY_ADDRESS") as `0x${string}`,
  }),
  chain: ens.chain,
  onError: (serviceId, cause) => console.error(`listing ${serviceId}:`, cause),
});

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
await relayer.run(Number(process.env.RELAYER_POLL_MS ?? 15_000), controller.signal);
