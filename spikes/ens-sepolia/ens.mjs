// Ticket 03 spike: skeptique's ENSv2 namespace on Sepolia, then one relayer-written text record
// read back through the public Universal Resolver. Follows spec/notes/ens.md "Phase B plan".
// Every step checks chain state first, so re-running only sends what is missing.
// Usage: node ens.mjs [slug] [score]   (env from ENV_FILE, default ../../.env)
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  http,
  keccak256,
  namehash,
  parseAbi,
  parseEther,
  parseEventLogs,
  toBytes,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";

config({ path: process.env.ENV_FILE ?? fileURLToPath(new URL("../../.env", import.meta.url)) });

const env = (k) => {
  if (!process.env[k]) throw new Error(`missing ${k} in .env`);
  return process.env[k];
};

// Sepolia ENSv2 addresses: spec/notes/ens.md §1 (docs.ens.domains/learn/deployments).
const A = {
  ethRegistry: process.env.ENS_ETH_REGISTRY ?? "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ethRegistrar: process.env.ENS_ETH_REGISTRAR ?? "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  factory: process.env.ENS_VERIFIABLE_FACTORY ?? "0xda70306c98e97ece36f997a21368e53298572991",
  resolverImpl: process.env.ENS_PERMISSIONED_RESOLVER_IMPL ?? "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: process.env.ENS_USER_REGISTRY_IMPL ?? "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  universalResolver: process.env.ENS_UNIVERSAL_RESOLVER ?? "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  usdc: process.env.ENS_MOCK_USDC ?? "0x240b0316df57887dbbe58b586508b19e633a14aa",
};

// Roles: spec/notes/ens.md §2 and §4 (RegistryRolesLib, PermissionedResolverLib). Admin bit = role << 128.
const admin = (r) => r << 128n;
const R = {
  REGISTRAR: 1n << 0n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  SET_TEXT: 1n << 4n,
};
const withAdmin = (r) => r | admin(r);
const REGISTRY_ROOT_ROLES = [R.REGISTRAR, R.SET_PARENT, R.RENEW, R.UNREGISTER, R.SET_SUBREGISTRY, R.SET_RESOLVER]
  .map(withAdmin)
  .reduce((a, b) => a | b);
const SUBNAME_TOKEN_ROLES = withAdmin(R.SET_SUBREGISTRY) | withAdmin(R.SET_RESOLVER);
const RESOLVER_ADMIN = admin(R.SET_TEXT);
const ONE_YEAR = 31536000n;

// ABIs: signatures copied from ensdomains/contracts-v2@07e55a05 contracts/deployments/sepolia/*.json.
const eacErrors = [
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
];
const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)",
  "error NameNotAvailable(string label)",
]);
const registryAbi = parseAbi([
  "function findOwner(string label) view returns (address)",
  "function findTokenId(string label) view returns (uint256)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
  "function unsafeTransfer(address to, uint256 tokenId, bytes data)",
  "error TransferDisallowed(uint256 tokenId, address from)",
  "error TransferUnsafeUntilRegistryIsEmancipated()",
  "error LabelAlreadyRegistered(string label)",
  ...eacErrors,
]);
const resolverAbi = parseAbi([
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
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const transport = http(env("SEPOLIA_RPC_URL"));
const pub = createPublicClient({ chain: sepolia, transport });
const operator = privateKeyToAccount(env("ENS_OPERATOR_PRIVATE_KEY"));
const relayer = privateKeyToAccount(env("SEPOLIA_RELAYER_PRIVATE_KEY"));
const seller = privateKeyToAccount(env("SELLER_PRIVATE_KEY"));
const wallet = (account) => createWalletClient({ account, chain: sepolia, transport });

const parent = env("ENS_PARENT_NAME");
const [label, tld, ...rest] = parent.split(".");
if (tld !== "eth" || rest.length) throw new Error(`ENS_PARENT_NAME must be <label>.eth, got ${parent}`);
const slug = process.argv[2] ?? "spike";
const score = process.argv[3] ?? "87";
const full = `${slug}.svc.${parent}`;
// ENSIP-5 service-key form under the parent: eth.skeptique.* (spec/notes/ens.md §6).
const keyPrefix = parent.split(".").reverse().join(".");
const SCORE_KEYS = ["score", "confidence", "round", "hedera.tx"].map((k) => `${keyPrefix}.${k}`);
const SELLER_KEYS = ["url", "description"];
const SCORE_KEY = SCORE_KEYS[0];

const log = (...a) => console.log(...a);
const txs = [];
// A load-balanced RPC can answer from a node that has not seen our last transaction yet
// (run 1 read expiry 0 right after register). Pin reads to the block of our latest receipt.
let minBlock;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function atMinBlock(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn(minBlock === undefined ? {} : { blockNumber: minBlock });
    } catch (e) {
      if (i >= 9 || !/header not found|unknown block|block .*not found/i.test(e.message)) throw e;
      await sleep(2000);
    }
  }
}
const read = (address, abi, functionName, args = []) =>
  atMinBlock((at) => pub.readContract({ address, abi, functionName, args, ...at }));

async function send(account, label, req) {
  let request;
  try {
    ({ request } = await pub.simulateContract({ account, ...req }));
  } catch (e) {
    throw new Error(`${label}: ${e.shortMessage ?? e.message}`);
  }
  const hash = await wallet(account).writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  minBlock = receipt.blockNumber;
  while ((await pub.getBlockNumber()) < minBlock) await sleep(1000);
  txs.push({ label, hash, gasUsed: receipt.gasUsed });
  log(`  tx ${label}: ${hash} (gas ${receipt.gasUsed})`);
  return receipt;
}

const dns = (name) => toHex(packetToBytes(name));
const salt = (tag, node) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(toBytes(tag)), node, 0n],
      ),
    ),
  );
const textResource = (key) => BigInt(keccak256(toBytes(key)));

async function deployProxy(name, impl, proxySalt, initData) {
  const predicted = await read(A.factory, factoryAbi, "predictProxyAddress", [operator.address, proxySalt]);
  if ((await atMinBlock((at) => pub.getCode({ address: predicted, ...at })))?.length > 2) {
    log(`  ${name}: exists at ${predicted}`);
    return predicted;
  }
  const receipt = await send(operator, `deployProxy ${name}`, {
    address: A.factory,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [impl, proxySalt, initData],
  });
  const [ev] = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: "ProxyDeployed" });
  if (ev.args.proxyAddress.toLowerCase() !== predicted.toLowerCase())
    log(`  note: predicted ${predicted} but deployed ${ev.args.proxyAddress}`);
  log(`  ${name}: deployed at ${ev.args.proxyAddress}`);
  return ev.args.proxyAddress;
}

const userRegistryInit = encodeFunctionData({
  abi: registryAbi,
  functionName: "initialize",
  args: [[{ account: operator.address, roleBitmap: REGISTRY_ROOT_ROLES }]],
});

async function ensureParent(registry, parentRegistry, childLabel) {
  const [p, l] = await read(registry, registryAbi, "getParent");
  if (p.toLowerCase() === parentRegistry.toLowerCase() && l === childLabel) return;
  await send(operator, `setParent ${childLabel}`, {
    address: registry,
    abi: registryAbi,
    functionName: "setParent",
    args: [parentRegistry, childLabel],
  });
}

async function revertName(account, req, at = {}) {
  try {
    await pub.simulateContract({ account, ...req, ...at });
    return "NO REVERT";
  } catch (e) {
    const r = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    return r?.data?.errorName ?? r?.signature ?? e.shortMessage ?? String(e);
  }
}

// ---------------------------------------------------------------------------------------------
log(`ENSv2 spike on Sepolia (chain ${await pub.getChainId()}), block ${await pub.getBlockNumber()}`);
log(`parent ${parent}, service subname ${full}, score key ${SCORE_KEY}`);
for (const [n, a] of [
  ["operator", operator],
  ["relayer", relayer],
  ["seller", seller],
])
  log(`  ${n.padEnd(8)} ${a.address} ${formatEther(await pub.getBalance({ address: a.address }))} ETH`);
const opStart = await pub.getBalance({ address: operator.address });

if ((await pub.getBalance({ address: relayer.address })) < parseEther("0.005")) {
  const hash = await wallet(operator).sendTransaction({ to: relayer.address, value: parseEther("0.01") });
  await pub.waitForTransactionReceipt({ hash });
  txs.push({ label: "fund relayer 0.01 ETH", hash });
  log(`  tx fund relayer 0.01 ETH: ${hash}`);
}

log(`\n[1] parent name ${parent}`);
const parentOwner = await read(A.ethRegistry, registryAbi, "findOwner", [label]);
if (parentOwner === zeroAddress) {
  if (!(await read(A.ethRegistrar, registrarAbi, "isAvailable", [label]))) throw new Error(`${label} not available`);
  const secret = toHex(randomBytes(32));
  const commitment = await read(A.ethRegistrar, registrarAbi, "makeCommitment", [
    label,
    operator.address,
    secret,
    zeroAddress,
    zeroAddress,
    ONE_YEAR,
    zeroHash,
  ]);
  const [base, premium] = await read(A.ethRegistrar, registrarAbi, "getRegisterPrice", [label, ONE_YEAR, A.usdc]);
  const price = base + premium;
  log(`  price ${price} MockUSDC units (base ${base}, premium ${premium})`);
  await send(operator, "commit", {
    address: A.ethRegistrar,
    abi: registrarAbi,
    functionName: "commit",
    args: [commitment],
  });
  const commitBlock = await pub.getBlock();
  if ((await read(A.usdc, erc20Abi, "balanceOf", [operator.address])) < price)
    await send(operator, "MockUSDC.mint", {
      address: A.usdc,
      abi: erc20Abi,
      functionName: "mint",
      args: [operator.address, price],
    });
  if ((await read(A.usdc, erc20Abi, "allowance", [operator.address, A.ethRegistrar])) < price)
    await send(operator, "MockUSDC.approve", {
      address: A.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [A.ethRegistrar, price],
    });
  const minAge = await read(A.ethRegistrar, registrarAbi, "MIN_COMMITMENT_AGE");
  const registerReq = {
    address: A.ethRegistrar,
    abi: registrarAbi,
    functionName: "register",
    args: [label, operator.address, secret, zeroAddress, zeroAddress, ONE_YEAR, A.usdc, zeroHash],
  };
  for (;;) {
    const now = (await pub.getBlock()).timestamp;
    const wait = Number(commitBlock.timestamp + minAge + 1n - now);
    if (wait > 0) {
      log(`  waiting ${wait}s for MIN_COMMITMENT_AGE (${minAge}s)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
    if ((await revertName(operator, registerReq)) !== "CommitmentTooNew") break;
    await new Promise((r) => setTimeout(r, 6000));
  }
  await send(operator, `register ${parent}`, registerReq);
} else if (parentOwner.toLowerCase() !== operator.address.toLowerCase()) {
  throw new Error(`${parent} is owned by ${parentOwner}, not the operator`);
} else log(`  already owned by operator`);
const parentTokenId = await read(A.ethRegistry, registryAbi, "findTokenId", [label]);
const expiry = await read(A.ethRegistry, registryAbi, "getExpiry", [parentTokenId]);
if (expiry === 0n) throw new Error(`${parent} expiry read as 0 (stale RPC read?)`);
log(`  tokenId ${parentTokenId}, expiry ${new Date(Number(expiry) * 1000).toISOString()}`);

log(`\n[2] registry for ${parent}`);
const parentReg = await deployProxy(
  `UserRegistry(${parent})`,
  A.userRegistryImpl,
  salt("UserRegistry", namehash(parent)),
  userRegistryInit,
);
if ((await read(A.ethRegistry, registryAbi, "getSubregistry", [label])).toLowerCase() !== parentReg.toLowerCase())
  await send(operator, `ETHRegistry.setSubregistry ${label}`, {
    address: A.ethRegistry,
    abi: registryAbi,
    functionName: "setSubregistry",
    args: [parentTokenId, parentReg],
  });
await ensureParent(parentReg, A.ethRegistry, label);

const subRegs = {};
for (const sub of ["svc", "critic"]) {
  const name = `${sub}.${parent}`;
  log(`\n[3] registry for ${name}`);
  const reg = await deployProxy(
    `UserRegistry(${name})`,
    A.userRegistryImpl,
    salt("UserRegistry", namehash(name)),
    userRegistryInit,
  );
  subRegs[sub] = reg;
  if ((await read(parentReg, registryAbi, "findOwner", [sub])) === zeroAddress) {
    await send(operator, `register ${name}`, {
      address: parentReg,
      abi: registryAbi,
      functionName: "register",
      args: [sub, operator.address, reg, zeroAddress, SUBNAME_TOKEN_ROLES, expiry],
    });
  } else if ((await read(parentReg, registryAbi, "getSubregistry", [sub])).toLowerCase() !== reg.toLowerCase()) {
    const id = await read(parentReg, registryAbi, "findTokenId", [sub]);
    await send(operator, `setSubregistry ${name}`, {
      address: parentReg,
      abi: registryAbi,
      functionName: "setSubregistry",
      args: [id, reg],
    });
  }
  await ensureParent(reg, parentReg, sub);
}
const svcReg = subRegs.svc;

log(`\n[4] PermissionedResolver for ${full}`);
const resolver = await deployProxy(
  `PermissionedResolver(${full})`,
  A.resolverImpl,
  salt("SkeptiqueServiceResolver", namehash(full)),
  encodeFunctionData({
    abi: resolverAbi,
    functionName: "initialize",
    args: [[{ account: operator.address, roleBitmap: RESOLVER_ADMIN }], []],
  }),
);
const grants = [];
for (const [account, keys] of [
  [relayer, SCORE_KEYS],
  [seller, SELLER_KEYS],
]) {
  for (const key of keys) {
    if (await read(resolver, resolverAbi, "hasRoles", [textResource(key), R.SET_TEXT, account.address])) continue;
    const setter = encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dns(full), key, ""] });
    grants.push(
      encodeFunctionData({ abi: resolverAbi, functionName: "grantSetterRoles", args: [setter, account.address] }),
    );
    log(`  grant ROLE_SET_TEXT on "${key}" to ${account === relayer ? "relayer" : "seller"}`);
  }
}
if (grants.length)
  await send(operator, `resolver.multicall ${grants.length} grantSetterRoles`, {
    address: resolver,
    abi: resolverAbi,
    functionName: "multicall",
    args: [grants],
  });
else log(`  all text-key grants already in place`);

log(`\n[5] service subname ${full} (owner seller, roleBitmap 0)`);
if ((await read(svcReg, registryAbi, "findOwner", [slug])) === zeroAddress) {
  await send(operator, `register ${full}`, {
    address: svcReg,
    abi: registryAbi,
    functionName: "register",
    args: [slug, seller.address, zeroAddress, resolver, 0n, expiry],
  });
} else if ((await read(svcReg, registryAbi, "getResolver", [slug])).toLowerCase() !== resolver.toLowerCase()) {
  const id = await read(svcReg, registryAbi, "findTokenId", [slug]);
  await send(operator, `setResolver ${full}`, {
    address: svcReg,
    abi: registryAbi,
    functionName: "setResolver",
    args: [id, resolver],
  });
} else log(`  already registered to ${await read(svcReg, registryAbi, "findOwner", [slug])}`);
const svcTokenId = await read(svcReg, registryAbi, "findTokenId", [slug]);

log(`\n[6] relayer writes ${SCORE_KEY} = "${score}"`);
const current = await atMinBlock((at) => pub.getEnsText({ name: full, key: SCORE_KEY, ...at })).catch(() => null);
if (current === score) log(`  already "${score}"`);
else
  await send(relayer, `setText ${SCORE_KEY}`, {
    address: resolver,
    abi: resolverAbi,
    functionName: "setText",
    args: [dns(full), SCORE_KEY, score],
  });

log(`\n[7] read back through Universal Resolver ${A.universalResolver}`);
const resolvedVia = await atMinBlock((at) => pub.getEnsResolver({ name: full, ...at }));
const readBack = await atMinBlock((at) => pub.getEnsText({ name: full, key: SCORE_KEY, ...at }));
log(`  resolver for ${full}: ${resolvedVia}`);
log(`READ BACK: ${full} text("${SCORE_KEY}") = "${readBack}"`);
if (readBack !== score) throw new Error(`read-back mismatch: expected "${score}"`);

log(`\n[8] negative checks (simulated, nothing sent)`);
const checks = [
  [
    "seller setText score key",
    seller,
    { address: resolver, abi: resolverAbi, functionName: "setText", args: [dns(full), SCORE_KEY, "100"] },
    "EACUnauthorizedAccountRoles",
  ],
  [
    "seller setText url (allowed)",
    seller,
    {
      address: resolver,
      abi: resolverAbi,
      functionName: "setText",
      args: [dns(full), "url", "https://example.invalid"],
    },
    "NO REVERT",
  ],
  [
    "relayer setText url",
    relayer,
    {
      address: resolver,
      abi: resolverAbi,
      functionName: "setText",
      args: [dns(full), "url", "https://example.invalid"],
    },
    "EACUnauthorizedAccountRoles",
  ],
  [
    "seller setResolver on own subname",
    seller,
    { address: svcReg, abi: registryAbi, functionName: "setResolver", args: [svcTokenId, seller.address] },
    "EACUnauthorizedAccountRoles",
  ],
  [
    "seller safeTransferFrom subname",
    seller,
    {
      address: svcReg,
      abi: registryAbi,
      functionName: "safeTransferFrom",
      args: [seller.address, relayer.address, svcTokenId, 1n, "0x"],
    },
    "TransferUnsafeUntilRegistryIsEmancipated",
  ],
  [
    "seller unsafeTransfer subname",
    seller,
    { address: svcReg, abi: registryAbi, functionName: "unsafeTransfer", args: [relayer.address, svcTokenId, "0x"] },
    "TransferDisallowed",
  ],
];
let failed = 0;
for (const [name, account, req, expected] of checks) {
  const got = await atMinBlock((at) => revertName(account, req, at));
  const ok = got === expected;
  if (!ok) failed++;
  log(`  ${ok ? "PASS" : "FAIL"} ${name}: ${got}${ok ? "" : ` (expected ${expected})`}`);
}

log(`\nsummary`);
log(`  parent registry  ${parentReg}`);
log(`  svc registry     ${subRegs.svc}`);
log(`  critic registry  ${subRegs.critic}`);
log(`  service resolver ${resolver}`);
for (const t of txs) log(`  ${t.label}: https://sepolia.etherscan.io/tx/${t.hash}`);
const opEnd = await pub.getBalance({ address: operator.address });
log(`  operator spent ${formatEther(opStart - opEnd)} ETH this run, balance ${formatEther(opEnd)} ETH`);
log(`  explorer: https://sepolia.app.ens.domains/${full}`);
if (failed) {
  console.error(`${failed} negative check(s) did not match`);
  process.exit(1);
}
