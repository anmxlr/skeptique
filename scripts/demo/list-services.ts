import { serviceEnsName, serviceSlug } from "@skeptique/shared";
import { serviceListedEvent, serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { contractValue } from "@skeptique/shared/deployment";
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  parseEventLogs,
  zeroHash,
} from "viem";
import { serviceByName } from "../../apps/services/catalog";

// Seed fixture: demo services charge one tinybar per call.
const PRICE_PER_CALL_TINYBARS = 1n;

/**
 * Lists the named demo services on the ServiceRegistry, each paying the contract's minimum listing fee.
 * `origins` maps a demo service name to the base URL it is served from (an origin, or a path such as
 * https://site/svc/unit-convert); the endpoint is <base>/call. With `ensParent`, each listing carries the namehash of
 * <slug>.svc.<parent> (as the seller form does), so the listing relayer can create that subname; otherwise ensNode is zero.
 */
export async function listDemoServices(options: {
  rpcUrl: string;
  registry: Address;
  seller: Account | Address;
  origins: Record<string, string>;
  ensParent?: string;
}): Promise<{ name: string; serviceId: number }[]> {
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ transport });
  const wallet = createWalletClient({ account: options.seller, transport });
  const chainId = await publicClient.getChainId();
  const fee = await publicClient.readContract({
    address: options.registry,
    abi: serviceRegistryAbi,
    functionName: "minListingFee",
  });

  const listed: { name: string; serviceId: number }[] = [];
  for (const [name, origin] of Object.entries(options.origins)) {
    const service = serviceByName(name);
    if (!service) throw new Error(`Unknown demo service ${name}`);
    const hash = await wallet.writeContract({
      address: options.registry,
      abi: serviceRegistryAbi,
      functionName: "listService",
      args: [
        service.specHash as `0x${string}`,
        new URL("call", origin.endsWith("/") ? origin : `${origin}/`).href,
        PRICE_PER_CALL_TINYBARS,
        options.ensParent
          ? namehash(serviceEnsName(serviceSlug(service.suite.serviceName), options.ensParent))
          : zeroHash,
      ],
      value: contractValue(fee, chainId),
      chain: null,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const [log] = parseEventLogs({ abi: serviceRegistryAbi, eventName: "ServiceListed", logs: receipt.logs });
    if (!log) throw new Error(`Listing ${name} emitted no ServiceListed event`);
    listed.push({ name, serviceId: serviceListedEvent(log.args).serviceId });
  }
  return listed;
}
