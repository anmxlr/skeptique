// ENSv2 on Sepolia. Every address, role and signature comes from spec/notes/ens.md
// (ensdomains/contracts-v2@07e55a05) and was exercised by spikes/ens-sepolia/ens.mjs.
import { randomBytes } from "node:crypto";
import { SELLER_KEYS, scoreKeys, serviceEnsName } from "@skeptique/shared";
import {
  type Account,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  http,
  keccak256,
  namehash,
  type PublicClient,
  parseAbi,
  toBytes,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";
import type { SubnameChain } from "./chain";
import { planResolverGrants } from "./grants";

type Address = `0x${string}`;

export const ENS_ADDRESSES = {
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  factory: "0xda70306c98e97ece36f997a21368e53298572991",
  resolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  usdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const satisfies Record<string, Address>;

const admin = (role: bigint) => role << 128n;
const withAdmin = (role: bigint) => role | admin(role);
const ROLE = {
  REGISTRAR: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
};
const REGISTRY_ROOT_ROLES = [
  ROLE.REGISTRAR,
  ROLE.SET_PARENT,
  ROLE.RENEW,
  ROLE.UNREGISTER,
  ROLE.SET_SUBREGISTRY,
  ROLE.SET_RESOLVER,
]
  .map(withAdmin)
  .reduce((a, b) => a | b);
const SUBNAME_TOKEN_ROLES = withAdmin(ROLE.SET_SUBREGISTRY) | withAdmin(ROLE.SET_RESOLVER);
const ONE_YEAR = 31536000n;

const eacErrors = [
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
] as const;
const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)",
]);
export const registryAbi = parseAbi([
  "function findOwner(string label) view returns (address)",
  "function findTokenId(string label) view returns (uint256)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
  "function unsafeTransfer(address to, uint256 tokenId, bytes data)",
  ...eacErrors,
]);
export const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  "function multicall(bytes[] calls) returns (bytes[])",
  ...eacErrors,
]);
const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
]);
const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export const dnsName = (name: string): Hex => toHex(packetToBytes(name));
const textResource = (key: string) => BigInt(keccak256(toBytes(key)));
const proxySalt = (tag: string, node: Hex) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(toBytes(tag)), node, 0n],
      ),
    ),
  );
const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SepoliaEnsOptions = {
  rpcUrl: string;
  parent: string;
  operatorKey: Hex;
  relayerKey: Hex;
  log?: (line: string) => void;
};

/** The skeptique ENS namespace on Sepolia: one-time setup, subname creation, score writes. */
export function createSepoliaEns(options: SepoliaEnsOptions) {
  const { parent } = options;
  const [parentLabel, tld, ...extra] = parent.split(".");
  if (!parentLabel || tld !== "eth" || extra.length)
    throw new Error(`ENS_PARENT_NAME must be <label>.eth, got ${parent}`);
  const log = options.log ?? (() => {});
  const A = ENS_ADDRESSES;
  const transport = http(options.rpcUrl);
  const client: PublicClient = createPublicClient({ chain: sepolia, transport });
  const operator = privateKeyToAccount(options.operatorKey);
  const relayer = privateKeyToAccount(options.relayerKey);

  // A load-balanced RPC can answer from a node that has not seen our last transaction yet.
  // Pin reads to the block of our latest receipt.
  let minBlock: bigint | undefined;
  const at = () => (minBlock === undefined ? {} : { blockNumber: minBlock });
  const read = async <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await client.readContract({ address, abi, functionName, args, ...at() } as never)) as T;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (attempt >= 9 || !/header not found|unknown block|block .*not found/i.test(message)) throw cause;
        await sleep(2000);
      }
    }
  };

  async function send(account: Account, label: string, request: Record<string, unknown>) {
    const { request: simulated } = await client.simulateContract({ account, ...request } as never);
    const hash = await createWalletClient({ account, chain: sepolia, transport }).writeContract(simulated as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    minBlock = receipt.blockNumber;
    while ((await client.getBlockNumber()) < minBlock) await sleep(1000);
    log(`tx ${label}: ${hash}`);
    return receipt;
  }

  const predict = (tag: string, name: string) =>
    read<Address>(A.factory, factoryAbi, "predictProxyAddress", [operator.address, proxySalt(tag, namehash(name))]);

  async function deployProxy(label: string, implementation: Address, tag: string, name: string, initData: Hex) {
    const predicted = await predict(tag, name);
    const code = await client.getCode({ address: predicted, ...at() });
    if (code && code.length > 2) return predicted;
    await send(operator, `deployProxy ${label}`, {
      address: A.factory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [implementation, proxySalt(tag, namehash(name)), initData],
    });
    return predicted;
  }

  const registryInit = encodeFunctionData({
    abi: registryAbi,
    functionName: "initialize",
    args: [[{ account: operator.address, roleBitmap: REGISTRY_ROOT_ROLES }]],
  });

  async function ensureParentOf(registry: Address, parentRegistry: Address, label: string) {
    const [current, currentLabel] = await read<readonly [Address, string]>(registry, registryAbi, "getParent");
    if (sameAddress(current, parentRegistry) && currentLabel === label) return;
    await send(operator, `setParent ${label}`, {
      address: registry,
      abi: registryAbi,
      functionName: "setParent",
      args: [parentRegistry, label],
    });
  }

  const svcRegistry = () => predict("UserRegistry", `svc.${parent}`);

  async function registerParent() {
    const owner = await read<Address>(A.ethRegistry, registryAbi, "findOwner", [parentLabel]);
    if (owner !== zeroAddress) {
      if (!sameAddress(owner, operator.address)) throw new Error(`${parent} is owned by ${owner}, not the operator`);
      return;
    }
    if (!(await read<boolean>(A.ethRegistrar, registrarAbi, "isAvailable", [parentLabel])))
      throw new Error(`${parent} is not available`);
    const secret = toHex(randomBytes(32));
    const commitment = await read<Hex>(A.ethRegistrar, registrarAbi, "makeCommitment", [
      parentLabel,
      operator.address,
      secret,
      zeroAddress,
      zeroAddress,
      ONE_YEAR,
      zeroHash,
    ]);
    const [base, premium] = await read<readonly [bigint, bigint]>(A.ethRegistrar, registrarAbi, "getRegisterPrice", [
      parentLabel,
      ONE_YEAR,
      A.usdc,
    ]);
    const price = base + premium;
    await send(operator, "commit", {
      address: A.ethRegistrar,
      abi: registrarAbi,
      functionName: "commit",
      args: [commitment],
    });
    const commitBlock = await client.getBlock();
    if ((await read<bigint>(A.usdc, erc20Abi, "balanceOf", [operator.address])) < price)
      await send(operator, "MockUSDC.mint", {
        address: A.usdc,
        abi: erc20Abi,
        functionName: "mint",
        args: [operator.address, price],
      });
    if ((await read<bigint>(A.usdc, erc20Abi, "allowance", [operator.address, A.ethRegistrar])) < price)
      await send(operator, "MockUSDC.approve", {
        address: A.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [A.ethRegistrar, price],
      });
    const minAge = await read<bigint>(A.ethRegistrar, registrarAbi, "MIN_COMMITMENT_AGE");
    const waitSeconds = Number(commitBlock.timestamp + minAge + 1n - (await client.getBlock()).timestamp);
    if (waitSeconds > 0) await sleep(waitSeconds * 1000);
    for (let attempt = 0; ; attempt++) {
      try {
        await send(operator, `register ${parent}`, {
          address: A.ethRegistrar,
          abi: registrarAbi,
          functionName: "register",
          args: [parentLabel, operator.address, secret, zeroAddress, zeroAddress, ONE_YEAR, A.usdc, zeroHash],
        });
        return;
      } catch (cause) {
        if (attempt >= 5 || !/CommitmentTooNew/.test(String(cause))) throw cause;
        await sleep(6000);
      }
    }
  }

  /** Registers the parent if needed, then the parent, `svc` and `critic` registries. Re-runnable. */
  async function setupNamespace() {
    await registerParent();
    const parentTokenId = await read<bigint>(A.ethRegistry, registryAbi, "findTokenId", [parentLabel]);
    const expiry = await read<bigint>(A.ethRegistry, registryAbi, "getExpiry", [parentTokenId]);
    if (expiry === 0n) throw new Error(`${parent} expiry read as 0 (stale RPC read?)`);

    const parentRegistry = await deployProxy(
      `registry ${parent}`,
      A.userRegistryImpl,
      "UserRegistry",
      parent,
      registryInit,
    );
    if (!sameAddress(await read<Address>(A.ethRegistry, registryAbi, "getSubregistry", [parentLabel]), parentRegistry))
      await send(operator, `setSubregistry ${parentLabel}`, {
        address: A.ethRegistry,
        abi: registryAbi,
        functionName: "setSubregistry",
        args: [parentTokenId, parentRegistry],
      });
    await ensureParentOf(parentRegistry, A.ethRegistry, parentLabel);

    const registries: Record<string, Address> = { parent: parentRegistry };
    for (const sub of ["svc", "critic"]) {
      const name = `${sub}.${parent}`;
      const registry = await deployProxy(`registry ${name}`, A.userRegistryImpl, "UserRegistry", name, registryInit);
      registries[sub] = registry;
      if ((await read<Address>(parentRegistry, registryAbi, "findOwner", [sub])) === zeroAddress) {
        await send(operator, `register ${name}`, {
          address: parentRegistry,
          abi: registryAbi,
          functionName: "register",
          args: [sub, operator.address, registry, zeroAddress, SUBNAME_TOKEN_ROLES, expiry],
        });
      } else if (!sameAddress(await read<Address>(parentRegistry, registryAbi, "getSubregistry", [sub]), registry)) {
        const id = await read<bigint>(parentRegistry, registryAbi, "findTokenId", [sub]);
        await send(operator, `setSubregistry ${name}`, {
          address: parentRegistry,
          abi: registryAbi,
          functionName: "setSubregistry",
          args: [id, registry],
        });
      }
      await ensureParentOf(registry, parentRegistry, sub);
    }
    return { registries, expiry };
  }

  const chain: SubnameChain & { resolverFor(slug: string): Promise<Address> } = {
    async hasSubname(slug) {
      return (await read<Address>(await svcRegistry(), registryAbi, "findOwner", [slug])) !== zeroAddress;
    },
    resolverFor(slug) {
      return predict("SkeptiqueServiceResolver", serviceEnsName(slug, parent));
    },
    async createSubname({ slug, seller }) {
      const full = serviceEnsName(slug, parent);
      const registry = await svcRegistry();
      const parentTokenId = await read<bigint>(A.ethRegistry, registryAbi, "findTokenId", [parentLabel]);
      const expiry = await read<bigint>(A.ethRegistry, registryAbi, "getExpiry", [parentTokenId]);
      if (expiry === 0n) throw new Error(`${parent} is not set up: run ens:setup`);

      const resolver = await deployProxy(
        `resolver ${full}`,
        A.resolverImpl,
        "SkeptiqueServiceResolver",
        full,
        encodeFunctionData({
          abi: resolverAbi,
          functionName: "initialize",
          args: [[{ account: operator.address, roleBitmap: admin(ROLE.SET_TEXT) }], []],
        }),
      );
      const grants: Hex[] = [];
      for (const { key, account } of planResolverGrants({ parent, relayer: relayer.address, seller })) {
        if (await read<boolean>(resolver, resolverAbi, "hasRoles", [textResource(key), ROLE.SET_TEXT, account]))
          continue;
        const setter = encodeFunctionData({
          abi: resolverAbi,
          functionName: "setText",
          args: [dnsName(full), key, ""],
        });
        grants.push(
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "grantSetterRoles",
            args: [setter, account as Address],
          }),
        );
      }
      if (grants.length)
        await send(operator, `grants ${full}`, {
          address: resolver,
          abi: resolverAbi,
          functionName: "multicall",
          args: [grants],
        });

      if ((await read<Address>(registry, registryAbi, "findOwner", [slug])) === zeroAddress)
        await send(operator, `register ${full}`, {
          address: registry,
          abi: registryAbi,
          functionName: "register",
          args: [slug, seller, zeroAddress, resolver, 0n, expiry],
        });
      return { resolver, name: full };
    },
  };

  return {
    parent,
    operator: operator.address,
    relayer: relayer.address,
    client,
    chain,
    svcRegistry,
    setupNamespace,
    /** Relayer-written record (a score key). */
    async writeText(slug: string, key: string, value: string) {
      await send(relayer, `setText ${key}`, {
        address: await chain.resolverFor(slug),
        abi: resolverAbi,
        functionName: "setText",
        args: [dnsName(serviceEnsName(slug, parent)), key, value],
      });
    },
    scoreKeys: scoreKeys(parent),
    sellerKeys: SELLER_KEYS,
  };
}

export type SepoliaEns = ReturnType<typeof createSepoliaEns>;
