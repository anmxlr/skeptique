import { ensRecordKeys } from "@skeptique/shared/ens";
import {
  type Account,
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  type Transport,
  toBytes,
} from "viem";
import { sepolia } from "viem/chains";
import { dnsName, ENS_ADDRESSES, factoryAbi, proxySalt } from "./ens/sepolia";
import { ensRegistryAbi, ensResolverAbi } from "./ens-target";

const adminResolverAbi = ensResolverAbi;
const adminRegistryAbi = [
  ...ensRegistryAbi,
  ...parseAbi(["function grantRootRoles(uint256 roleBitmap, address account) returns (bool)"]),
];

/** Explicit one-time operator action; this account is never supplied to the runtime relayer. */
export async function provisionCriticNamespace(options: {
  transport: Transport;
  operator: Account;
  relayer: Address;
  parentName: string;
  criticRegistry: Address;
}) {
  const pub = createPublicClient({ chain: sepolia, transport: options.transport });
  const wallet = createWalletClient({ chain: sepolia, transport: options.transport, account: options.operator });
  const factory = ENS_ADDRESSES.factory;
  const implementation = ENS_ADDRESSES.resolverImpl;
  const name = `critic.${options.parentName}`;
  const salt = proxySalt("SkeptiqueCriticResolver", namehash(name));
  const resolver = await pub.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "predictProxyAddress",
    args: [options.operator.address, salt],
  });
  let blockNumber = await pub.getBlockNumber({ cacheTime: 0 });
  async function mined(hash: `0x${string}`) {
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Critic namespace provisioning reverted");
    blockNumber = receipt.blockNumber;
  }
  if (!(await pub.getCode({ address: resolver, blockNumber }))) {
    const data = encodeFunctionData({
      abi: adminResolverAbi,
      functionName: "initialize",
      args: [[{ account: options.operator.address, roleBitmap: (1n << 4n) << 128n }], []],
    });
    const { request } = await pub.simulateContract({
      address: factory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [implementation, salt, data],
      account: options.operator,
    });
    await mined(await wallet.writeContract(request));
  }
  const keys = ensRecordKeys(options.parentName);
  const calls: `0x${string}`[] = [];
  for (const key of [keys.stake, keys.honestRounds, keys.slashes]) {
    if (
      await pub.readContract({
        address: resolver,
        abi: ensResolverAbi,
        functionName: "hasRoles",
        args: [BigInt(keccak256(toBytes(key))), 1n << 4n, options.relayer],
        blockNumber,
      })
    )
      continue;
    const setter = encodeFunctionData({
      abi: ensResolverAbi,
      functionName: "setText",
      args: [dnsName(name), key, ""],
    });
    calls.push(
      encodeFunctionData({ abi: adminResolverAbi, functionName: "grantSetterRoles", args: [setter, options.relayer] }),
    );
  }
  if (calls.length) {
    const { request } = await pub.simulateContract({
      address: resolver,
      abi: ensResolverAbi,
      functionName: "multicall",
      args: [calls],
      account: options.operator,
    });
    await mined(await wallet.writeContract(request));
  }
  if (
    !(await pub.readContract({
      address: options.criticRegistry,
      abi: ensRegistryAbi,
      functionName: "hasRootRoles",
      args: [1n, options.relayer],
      blockNumber,
    }))
  ) {
    const { request } = await pub.simulateContract({
      address: options.criticRegistry,
      abi: adminRegistryAbi,
      functionName: "grantRootRoles",
      args: [1n, options.relayer],
      account: options.operator,
    });
    await mined(await wallet.writeContract(request));
  }
  return { resolver, blockNumber: blockNumber.toString() };
}
