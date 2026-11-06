import { criticRegisteredEvent, criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  type Hex,
  http,
  keccak256,
  parseAbiParameters,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Seed fixture: vouchers stay valid for an hour.
const VOUCHER_TTL_SECS = 3600n;

/**
 * Registers a critic with the minimum stake. The seed plays the attestor: it signs the voucher over
 * (nullifier, critic, expiry, chainid) with `attestorKey` (ATTESTOR_PRIVATE_KEY). Ticket 16 moves signing into the API.
 */
export async function registerDemoCritic(options: {
  rpcUrl: string;
  registry: Address;
  critic: Account | Address;
  nullifier: Hex;
  attestorKey: Hex;
}) {
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ transport });
  const wallet = createWalletClient({ account: options.critic, transport });
  const criticAddress = typeof options.critic === "string" ? options.critic : options.critic.address;

  const [chainId, minStake, block] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({ address: options.registry, abi: criticRegistryAbi, functionName: "minStake" }),
    publicClient.getBlock(),
  ]);
  const expiry = block.timestamp + VOUCHER_TTL_SECS;
  const sig = await privateKeyToAccount(options.attestorKey).signMessage({
    message: {
      raw: keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32, address, uint64, uint256"), [
          options.nullifier,
          criticAddress,
          expiry,
          BigInt(chainId),
        ]),
      ),
    },
  });

  const hash = await wallet.writeContract({
    address: options.registry,
    abi: criticRegistryAbi,
    functionName: "registerCritic",
    args: [options.nullifier, expiry, sig],
    value: minStake,
    chain: null,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({ abi: criticRegistryAbi, eventName: "CriticRegistered", logs: receipt.logs });
  if (!log) throw new Error("Registration emitted no CriticRegistered event");
  return criticRegisteredEvent(log.args);
}
