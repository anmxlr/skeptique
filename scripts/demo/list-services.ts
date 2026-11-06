import { serviceListedEvent, serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  zeroHash,
} from "viem";
import { serviceByName } from "../../apps/services/catalog";

// Seed fixture: demo services charge one tinybar per call.
const PRICE_PER_CALL_TINYBARS = 1n;

/**
 * Lists the named demo services on the ServiceRegistry, each paying the contract's minimum listing fee.
 * `origins` maps a demo service name to the origin it is served from. ENS names come later (ensNode is zero).
 */
export async function listDemoServices(options: {
  rpcUrl: string;
  registry: Address;
  seller: Account | Address;
  origins: Record<string, string>;
}): Promise<{ name: string; serviceId: number }[]> {
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ transport });
  const wallet = createWalletClient({ account: options.seller, transport });
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
      args: [service.specHash as `0x${string}`, new URL("/call", origin).href, PRICE_PER_CALL_TINYBARS, zeroHash],
      value: fee,
      chain: null,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const [log] = parseEventLogs({ abi: serviceRegistryAbi, eventName: "ServiceListed", logs: receipt.logs });
    if (!log) throw new Error(`Listing ${name} emitted no ServiceListed event`);
    listed.push({ name, serviceId: serviceListedEvent(log.args).serviceId });
  }
  return listed;
}
