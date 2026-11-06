import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { commitmentHash } from "@skeptique/shared";
import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { contractValue, hashscanTransaction, tinybarsFromHbar } from "@skeptique/shared/deployment";
import { loadDeployment } from "@skeptique/shared/deployment-file";
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  type Hex,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseEventLogs,
  zeroHash,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { privateKey } from "../deploy/hedera";

/** Fixture-only sponsor acceptance: synthetic scores exercise the real deployed mechanism, not paid service quality. */
export async function smokeHederaRound(env: NodeJS.ProcessEnv = process.env) {
  if (!env.HEDERA_RPC_URL)
    throw new Error("Live acceptance requires HEDERA_RPC_URL and funded existing testnet accounts");
  const seller = privateKeyToAccount(privateKey(env, "SELLER_PRIVATE_KEY"));
  const attestor = privateKeyToAccount(privateKey(env, "ATTESTOR_PRIVATE_KEY"));
  const keys =
    env.CRITIC_PRIVATE_KEYS?.split(",")
      .map((key) => key.trim())
      .filter(Boolean) ?? [];
  if (keys.length < 3) throw new Error("Live acceptance requires at least three funded CRITIC_PRIVATE_KEYS");
  const critics = keys.slice(0, 3).map((key) => privateKeyToAccount(privateKey({ CRITIC_KEY: key }, "CRITIC_KEY")));
  if (new Set([seller.address, ...critics.map((account) => account.address)]).size !== 4)
    throw new Error("Seller and three critic accounts must be distinct");
  const deployment = await loadDeployment(env.DEPLOYMENT_PATH || undefined);
  if (deployment.config.kMin !== 3 || deployment.config.commitSeconds > 90 || deployment.config.revealSeconds > 45)
    throw new Error("Smoke acceptance requires a fresh deployment with HEDERA_DEMO_WINDOWS=true and K_MIN=3");
  const transport = http(env.HEDERA_RPC_URL);
  const client = createPublicClient({ chain: hederaTestnet, transport });
  if ((await client.getChainId()) !== deployment.chainId) throw new Error("Deployment chain does not match RPC");
  const { ServiceRegistry, CriticRegistry, RoundManager } = deployment.contracts as Record<
    "ServiceRegistry" | "CriticRegistry" | "RoundManager",
    Address
  >;
  const timingAbi = parseAbi([
    "function commitSeconds() view returns (uint64)",
    "function revealSeconds() view returns (uint64)",
    "function kMin() view returns (uint8)",
  ]);
  const [commitSeconds, revealSeconds, kMin] = await Promise.all([
    client.readContract({ address: RoundManager, abi: timingAbi, functionName: "commitSeconds" }),
    client.readContract({ address: RoundManager, abi: timingAbi, functionName: "revealSeconds" }),
    client.readContract({ address: RoundManager, abi: timingAbi, functionName: "kMin" }),
  ]);
  if (
    commitSeconds !== BigInt(deployment.config.commitSeconds) ||
    revealSeconds !== BigInt(deployment.config.revealSeconds) ||
    kMin !== 3
  )
    throw new Error("Deployed RoundManager timing/threshold differs from demo manifest");
  const [minStake, minFee, actualAttestor] = await Promise.all([
    client.readContract({ address: CriticRegistry, abi: criticRegistryAbi, functionName: "minStake" }),
    client.readContract({ address: ServiceRegistry, abi: serviceRegistryAbi, functionName: "minListingFee" }),
    client.readContract({ address: CriticRegistry, abi: criticRegistryAbi, functionName: "attestor" }),
  ]);
  if (minStake !== tinybarsFromHbar("5") || minFee !== tinybarsFromHbar("20"))
    throw new Error("Unexpected onchain HBAR minimums");
  if (actualAttestor.toLowerCase() !== attestor.address.toLowerCase())
    throw new Error("ATTESTOR_PRIVATE_KEY does not match deployment");
  const transactions: Hex[] = [];
  const write = async (
    account: PrivateKeyAccount,
    request: { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint },
  ) => {
    const wallet = createWalletClient({ account, chain: hederaTestnet, transport });
    const hash = await wallet.writeContract(request);
    console.log(`${request.functionName}: ${hashscanTransaction(hash)}`);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${request.functionName} reverted: ${hashscanTransaction(hash)}`);
    transactions.push(hash);
    return receipt;
  };
  const expiry = (await client.getBlock()).timestamp + 1800n;
  for (const [index, critic] of critics.entries()) {
    const nullifier = `0x${randomBytes(32).toString("hex")}` as Hex;
    const sig = await attestor.signMessage({
      message: {
        raw: keccak256(
          encodeAbiParameters(parseAbiParameters("bytes32,address,uint64,uint256"), [
            nullifier,
            critic.address,
            expiry,
            296n,
          ]),
        ),
      },
    });
    const args = [nullifier, expiry, sig] as const;
    if (index === 0) {
      let rejected = false;
      try {
        await client.simulateContract({
          account: critic,
          address: CriticRegistry,
          abi: criticRegistryAbi,
          functionName: "registerCritic",
          args,
          value: contractValue(tinybarsFromHbar("4.9"), 296),
        });
      } catch (error) {
        if (!String(error).includes("StakeTooLow")) throw error;
        rejected = true;
      }
      if (!rejected) throw new Error("4.9 HBAR stake was not rejected");
      console.log("Verified: 4.9 HBAR stake rejected by deployed contract");
    }
    await write(critic, {
      address: CriticRegistry,
      abi: criticRegistryAbi,
      functionName: "registerCritic",
      args,
      value: contractValue(minStake, 296),
    });
    if (
      (await client.readContract({
        address: CriticRegistry,
        abi: criticRegistryAbi,
        functionName: "stakeOf",
        args: [critic.address],
      })) !== minStake
    )
      throw new Error("5 HBAR stake did not arrive as 500000000 tinybars");
  }
  const listed = await write(seller, {
    address: ServiceRegistry,
    abi: serviceRegistryAbi,
    functionName: "listService",
    args: [
      keccak256(new TextEncoder().encode("skeptique live deployment smoke fixture")),
      "https://example.com/skeptique-smoke-fixture",
      1000n,
      zeroHash,
    ],
    value: contractValue(minFee, 296),
  });
  const [serviceLog] = parseEventLogs({ abi: serviceRegistryAbi, eventName: "ServiceListed", logs: listed.logs });
  if (!serviceLog) throw new Error("Listing emitted no ServiceListed event");
  const serviceId = serviceLog.args.serviceId;
  const service = await client.readContract({
    address: ServiceRegistry,
    abi: serviceRegistryAbi,
    functionName: "getService",
    args: [serviceId],
  });
  if (service.bounty !== minFee) throw new Error("20 HBAR listing did not arrive in tinybars");
  const [roundLog] = parseEventLogs({ abi: roundManagerAbi, eventName: "RoundOpened", logs: listed.logs });
  if (!roundLog) throw new Error("Opening emitted no RoundOpened event");
  const roundId = roundLog.args.roundId;
  const scores = [68, 72, 76];
  const salts = critics.map(() => `0x${randomBytes(32).toString("hex")}` as Hex);
  for (const [index, critic] of critics.entries())
    await write(critic, {
      address: RoundManager,
      abi: roundManagerAbi,
      functionName: "commit",
      args: [
        roundId,
        commitmentHash({ score: scores[index]!, salt: salts[index]!, evidenceHash: zeroHash, critic: critic.address }),
      ],
    });
  const waitUntil = async (timestamp: bigint) => {
    const deadline = Date.now() + 180000;
    while ((await client.getBlock()).timestamp < timestamp) {
      if (Date.now() >= deadline) throw new Error("Testnet did not reach the round boundary in time");
      await pause(2000);
    }
  };
  await waitUntil(roundLog.args.commitEnd);
  for (const [index, critic] of critics.entries())
    await write(critic, {
      address: RoundManager,
      abi: roundManagerAbi,
      functionName: "reveal",
      args: [roundId, scores[index]!, salts[index]!, zeroHash, 0n],
    });
  await waitUntil(roundLog.args.revealEnd);
  await write(seller, { address: RoundManager, abi: roundManagerAbi, functionName: "finalize", args: [roundId] });
  const round = await client.readContract({
    address: RoundManager,
    abi: roundManagerAbi,
    functionName: "getRound",
    args: [roundId],
  });
  if (!round.finalized || round.median !== 72 || round.nReveals !== 3)
    throw new Error("Unexpected finalized round result");
  return {
    chainId: 296,
    median: round.median,
    serviceId: serviceId.toString(),
    roundId: roundId.toString(),
    transactions,
  };
}
