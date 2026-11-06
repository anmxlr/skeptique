import { ensRecordKeys, validateEnsSubname } from "@skeptique/shared/ens";
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseAbi,
  type Transport,
  toBytes,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import { dnsName, registryAbi, resolverAbi } from "./ens/sepolia";
import type { TextTarget } from "./scores";
import type { TransactionJournal } from "./transaction-journal";

// ENSv2 contracts pinned to 07e55a056f5b6a9c90119f501bdd05714e67dddd; see spec/notes/ens.md.
export const ensResolverAbi = resolverAbi;
export const ensRegistryAbi = [
  ...registryAbi,
  ...parseAbi(["function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)"]),
];

/** Runtime signer only. Namespace provisioning and administrator secrets stay outside this process. */
export function createEnsTarget(options: {
  transport: Transport;
  account: Account;
  parentName: string;
  criticRegistry?: Address;
  criticResolver?: Address;
  criticExpiry?: bigint;
  journal?: TransactionJournal;
}) {
  const pub = createPublicClient({ chain: sepolia, transport: options.transport });
  const wallet = createWalletClient({ chain: sepolia, transport: options.transport, account: options.account });
  const keys = ensRecordKeys(options.parentName);
  let minBlock: bigint | undefined;
  async function pinned<T>(read: (blockNumber: bigint) => Promise<T>): Promise<T> {
    const head = await pub.getBlockNumber({ cacheTime: 0 });
    const block = minBlock !== undefined && minBlock > head ? minBlock : head;
    for (let attempt = 0; ; attempt++) {
      try {
        return await read(block);
      } catch (error) {
        if (attempt >= 4 || !/header not found|unknown block|block .*not found/i.test(String(error))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  async function receipt(hash: Hex) {
    const mined = await pub.waitForTransactionReceipt({ hash });
    if (mined.status !== "success") {
      // A confirmed revert consumed the nonce; it is no longer pending and can safely be retried.
      await options.journal?.clear();
      throw new Error(`ENS transaction reverted: ${hash}`);
    }
    minBlock = mined.blockNumber;
  }
  async function recover() {
    const pending = await options.journal?.load();
    if (!pending) return;
    try {
      await wallet.sendRawTransaction({ serializedTransaction: pending.raw });
    } catch (error) {
      if (!/already known|known transaction|nonce too low/i.test(String(error))) throw error;
    }
    await receipt(pending.hash);
    await options.journal?.clear();
  }
  async function send(to: Address, data: Hex) {
    await recover();
    const prepared = await wallet.prepareTransactionRequest({ to, data });
    const raw = await wallet.signTransaction(prepared);
    const hash = keccak256(raw);
    // Persist before broadcast: recovery resends these exact bytes, never a new nonce.
    await options.journal?.save({ hash, raw });
    await wallet.sendRawTransaction({ serializedTransaction: raw });
    await receipt(hash);
    await options.journal?.clear();
    return hash;
  }
  const target: TextTarget = {
    async read(name, requestedKeys) {
      await recover();
      return pinned(async (blockNumber) =>
        Object.fromEntries(
          await Promise.all(
            requestedKeys.map(async (key) => [key, await pub.getEnsText({ name, key, blockNumber })] as const),
          ),
        ),
      );
    },
    async write(rawName, records) {
      const namespace = rawName.endsWith(`.svc.${options.parentName}`) ? "svc" : "critic";
      const name = validateEnsSubname(rawName, options.parentName, namespace);
      const allowed =
        namespace === "svc"
          ? [keys.score, keys.confidence, keys.round, keys.hederaTx]
          : [keys.stake, keys.honestRounds, keys.slashes];
      if (!Object.keys(records).length || Object.keys(records).some((key) => !allowed.includes(key)))
        throw new Error("Disallowed ENS record key");
      const resolver = await pinned((blockNumber) => pub.getEnsResolver({ name, blockNumber }));
      if (!resolver) throw new Error(`No provisioned ENS resolver for ${name}`);
      const recordKeys = Object.keys(records);
      const permissions = await pinned((blockNumber) =>
        Promise.all(
          recordKeys.map((key) =>
            pub.readContract({
              address: resolver,
              abi: ensResolverAbi,
              functionName: "hasRoles",
              args: [BigInt(keccak256(toBytes(key))), 1n << 4n, options.account.address],
              blockNumber,
            }),
          ),
        ),
      );
      const denied = permissions.findIndex((permitted) => !permitted);
      if (denied !== -1) throw new Error(`Relayer lacks ENS setter role for ${recordKeys[denied]}`);
      const calls = Object.entries(records).map(([key, value]) =>
        encodeFunctionData({
          abi: ensResolverAbi,
          functionName: "setText",
          args: [dnsName(name), key, value],
        }),
      );
      await pub.simulateContract({
        address: resolver,
        abi: ensResolverAbi,
        functionName: "multicall",
        args: [calls],
        account: options.account,
      });
      const hash = await send(
        resolver,
        encodeFunctionData({ abi: ensResolverAbi, functionName: "multicall", args: [calls] }),
      );
      const actual = await target.read(name, Object.keys(records));
      if (Object.entries(records).some(([key, value]) => actual[key] !== value))
        throw new Error("ENS mined read-back mismatch");
      return hash;
    },
  };
  async function ensureCritic(rawName: string, owner: string) {
    await recover();
    const name = validateEnsSubname(rawName, options.parentName, "critic");
    const { criticRegistry: address, criticResolver: resolver, criticExpiry: expiry } = options;
    if (!address || !resolver || !expiry) throw new Error("Critic namespace must be provisioned before relaying");
    const label = name.split(".")[0];
    const existing = await pinned((blockNumber) =>
      pub.readContract({ address, abi: ensRegistryAbi, functionName: "findOwner", args: [label], blockNumber }),
    );
    if (existing !== zeroAddress) {
      const existingResolver = await pinned((blockNumber) =>
        pub.readContract({ address, abi: ensRegistryAbi, functionName: "getResolver", args: [label], blockNumber }),
      );
      if (existing.toLowerCase() !== owner.toLowerCase() || existingResolver.toLowerCase() !== resolver.toLowerCase())
        throw new Error("Critic ENS owner/resolver conflict");
      return;
    }
    if (
      !(await pub.readContract({
        address,
        abi: ensRegistryAbi,
        functionName: "hasRootRoles",
        args: [1n, options.account.address],
      }))
    )
      throw new Error("Relayer lacks critic registrar role");
    await pub.simulateContract({
      address,
      abi: ensRegistryAbi,
      functionName: "register",
      args: [label, owner as Address, zeroAddress, resolver, 0n, expiry],
      account: options.account,
    });
    await send(
      address,
      encodeFunctionData({
        abi: ensRegistryAbi,
        functionName: "register",
        args: [label, owner as Address, zeroAddress, resolver, 0n, expiry],
      }),
    );
  }
  return { target, ensureCritic };
}
