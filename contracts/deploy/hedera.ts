import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ROUND_CONFIG } from "@skeptique/shared";
import { type Deployment, DeploymentSchema, hashscanTransaction, tinybarsFromHbar } from "@skeptique/shared/deployment";
import { resolveDeploymentPath } from "@skeptique/shared/deployment-file";
import { type Abi, createPublicClient, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

const names = ["ServiceRegistry", "CriticRegistry", "RoundManager"] as const;
export type MechanismName = (typeof names)[number];
export async function readMechanismArtifact(name: MechanismName): Promise<{ abi: Abi; bytecode: Hex }> {
  return JSON.parse(
    await readFile(new URL(`../artifacts/contracts/${name}.sol/${name}.json`, import.meta.url), "utf8"),
  );
}

export function privateKey(env: NodeJS.ProcessEnv, name: string): Hex {
  const key = env[name]?.replace(/^0x/, "");
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${name} must contain an ECDSA private key`);
  return `0x${key}`;
}

export function deploymentConfig(demo = false): Deployment["config"] {
  return {
    minStakeTinybars: tinybarsFromHbar(String(DEFAULT_ROUND_CONFIG.S_MIN)).toString(),
    minListingFeeTinybars: tinybarsFromHbar(String(DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE)).toString(),
    withdrawCooldown: DEFAULT_ROUND_CONFIG.WITHDRAW_COOLDOWN,
    commitSeconds: demo ? 90 : DEFAULT_ROUND_CONFIG.COMMIT_SECS,
    revealSeconds: demo ? 45 : DEFAULT_ROUND_CONFIG.REVEAL_SECS,
    kMin: DEFAULT_ROUND_CONFIG.K_MIN,
    kMax: DEFAULT_ROUND_CONFIG.K_MAX,
    tolerance: DEFAULT_ROUND_CONFIG.TOLERANCE,
    slashBps: DEFAULT_ROUND_CONFIG.SLASH_BPS,
  };
}

export async function deployHedera(env: NodeJS.ProcessEnv = process.env): Promise<Deployment> {
  if (!env.HEDERA_RPC_URL) throw new Error("HEDERA_RPC_URL must be set");
  const account = privateKeyToAccount(privateKey(env, "DEPLOYER_PRIVATE_KEY"));
  const attestor = privateKeyToAccount(privateKey(env, "ATTESTOR_PRIVATE_KEY"));
  const transport = http(env.HEDERA_RPC_URL);
  const client = createPublicClient({ chain: hederaTestnet, transport });
  const wallet = createWalletClient({ account, chain: hederaTestnet, transport });
  if ((await client.getChainId()) !== 296) throw new Error("Deployment requires Hedera testnet chain 296");
  if (env.HEDERA_CHAIN_ID && env.HEDERA_CHAIN_ID !== "296") throw new Error("HEDERA_CHAIN_ID must be 296");
  const config = deploymentConfig(env.HEDERA_DEMO_WINDOWS === "true");
  const artifacts = await Promise.all(names.map(readMechanismArtifact));
  const output = resolveDeploymentPath(env.DEPLOYMENT_PATH);
  const abiDirectory = fileURLToPath(new URL("../../packages/shared/abi/generated/", import.meta.url));
  await mkdir(dirname(output), { recursive: true });
  await mkdir(abiDirectory, { recursive: true });
  await Promise.all([access(dirname(output), constants.W_OK), access(abiDirectory, constants.W_OK)]);
  const transactions: Deployment["transactions"] = [];
  let deploymentBlock: bigint | undefined;
  const deploy = async (index: number, args: readonly unknown[]) => {
    const artifact = artifacts[index];
    if (!artifact) throw new Error("Missing compiled mechanism artifact");
    const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
    console.log(`${names[index]}: ${hashscanTransaction(hash)}`);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${names[index]} deployment failed`);
    deploymentBlock ??= receipt.blockNumber;
    transactions.push({ name: names[index] ?? "contract", hash });
    return receipt.contractAddress;
  };
  const ServiceRegistry = await deploy(0, [BigInt(config.minListingFeeTinybars)]);
  const CriticRegistry = await deploy(1, [
    attestor.address,
    BigInt(config.minStakeTinybars),
    ServiceRegistry,
    BigInt(config.withdrawCooldown),
  ]);
  const RoundManager = await deploy(2, [
    BigInt(config.commitSeconds),
    BigInt(config.revealSeconds),
    config.kMin,
    config.kMax,
    CriticRegistry,
    config.tolerance,
    config.slashBps,
  ]);
  const hash = await wallet.writeContract({
    address: CriticRegistry,
    abi: artifacts[1]!.abi,
    functionName: "setRoundManager",
    args: [RoundManager],
  });
  console.log(`Authorize RoundManager: ${hashscanTransaction(hash)}`);
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
    throw new Error("RoundManager authorization failed");
  transactions.push({ name: "AuthorizeRoundManager", hash });
  const deployment = DeploymentSchema.parse({
    version: 1,
    network: "hedera-testnet",
    chainId: 296,
    deployedAt: new Date().toISOString(),
    deploymentBlock: deploymentBlock?.toString(),
    contracts: { ServiceRegistry, CriticRegistry, RoundManager },
    transactions,
    config,
  });
  await Promise.all(
    names.map((name, index) =>
      writeFile(`${abiDirectory}${name}.json`, JSON.stringify(artifacts[index]!.abi, null, 2) + "\n"),
    ),
  );
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(deployment, null, 2) + "\n");
  await rename(temporary, output);
  console.log(`Deployment manifest: ${output}`);
  for (const [name, address] of Object.entries(deployment.contracts)) console.log(`${name}: ${address}`);
  return deployment;
}
