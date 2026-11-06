import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { validateEnsSubname } from "@skeptique/shared/ens";
import { type Address, createPublicClient, getAbiItem, namehash, type Transport } from "viem";
import type { createScoreRelayer } from "./scores";

const roundEvents = [
  getAbiItem({ abi: roundManagerAbi, name: "RoundFinalized" }),
  getAbiItem({ abi: roundManagerAbi, name: "CriticRevealed" }),
] as const;

/** One bounded catch-up pass; rerun from the deployment block after a restart. */
export async function relayScoresFromChain(options: {
  transport: Transport;
  chainId: number;
  fromBlock: bigint;
  confirmations: bigint;
  roundManager: Address;
  serviceRegistry: Address;
  criticRegistry: Address;
  parentName: string;
  serviceNames: Record<string, string>;
  criticNames: Record<string, string>;
  relayer: ReturnType<typeof createScoreRelayer>;
  chunkSize?: bigint;
}) {
  const pub = createPublicClient({ transport: options.transport });
  if ((await pub.getChainId()) !== options.chainId) throw new Error("Unexpected score source chain");
  if (options.fromBlock < 0n || options.confirmations < 1n)
    throw new Error("Source block and confirmations must be configured");
  const chunkSize = options.chunkSize ?? 2_000n;
  if (chunkSize < 1n || chunkSize > 10_000n) throw new Error("Invalid log chunk size");
  const head = await pub.getBlockNumber({ cacheTime: 0 });
  const toBlock = head - options.confirmations;
  const registered = new Set<Address>();
  const slashes = new Map<string, number>();
  const honestRounds = new Map<string, number>();
  const reveals = new Map<string, Set<Address>>();
  let finalized = 0;
  const skipped: { kind: "service" | "critic"; id: string; reason: string }[] = [];
  for (let start = options.fromBlock; start <= toBlock; start += chunkSize) {
    let end = start + chunkSize - 1n;
    if (end > toBlock) end = toBlock;
    const [criticLogs, roundLogs] = await Promise.all([
      pub.getLogs({
        address: options.criticRegistry,
        events: criticRegistryAbi.filter((item) => item.type === "event"),
        fromBlock: start,
        toBlock: end,
        strict: true,
      }),
      pub.getLogs({
        address: options.roundManager,
        events: roundEvents,
        fromBlock: start,
        toBlock: end,
        strict: true,
      }),
    ]);
    for (const log of criticLogs) {
      const address = log.args.critic.toLowerCase() as Address;
      if (log.eventName === "CriticRegistered") registered.add(address);
      if (log.eventName === "CriticSlashed") slashes.set(address, (slashes.get(address) ?? 0) + 1);
    }
    for (const log of roundLogs) {
      const roundId = log.args.roundId.toString();
      if (log.eventName === "CriticRevealed") {
        const critics = reveals.get(roundId) ?? new Set<Address>();
        critics.add(log.args.critic.toLowerCase() as Address);
        reveals.set(roundId, critics);
        continue;
      }
      if (log.args.isVoid) {
        reveals.delete(roundId);
        continue;
      }
      const serviceId = log.args.serviceId.toString();
      let name: string;
      try {
        const rawName = options.serviceNames[serviceId];
        if (!rawName) throw new Error(`Missing provisioned ENS name for service ${serviceId}`);
        name = validateEnsSubname(rawName, options.parentName, "svc");
        const service = await pub.readContract({
          address: options.serviceRegistry,
          abi: serviceRegistryAbi,
          functionName: "getService",
          args: [log.args.serviceId],
          blockNumber: toBlock,
        });
        if (service.ensNode.toLowerCase() !== namehash(name).toLowerCase())
          throw new Error(`ENS namehash mismatch for service ${serviceId}`);
      } catch (error) {
        skipped.push({ kind: "service", id: serviceId, reason: (error as Error).message });
        reveals.delete(roundId);
        continue;
      }
      await options.relayer.finalize({
        name,
        roundId,
        score: log.args.median,
        nReveals: log.args.nReveals,
        hederaTx: log.transactionHash,
      });
      finalized++;
      for (const critic of reveals.get(roundId) ?? []) {
        if (
          await pub.readContract({
            address: options.roundManager,
            abi: roundManagerAbi,
            functionName: "isHonest",
            args: [log.args.roundId, critic],
            blockNumber: toBlock,
          })
        ) {
          honestRounds.set(critic, (honestRounds.get(critic) ?? 0) + 1);
        }
      }
      reveals.delete(roundId);
    }
  }
  const names = Object.fromEntries(
    Object.entries(options.criticNames).map(([address, name]) => [address.toLowerCase(), name]),
  );
  for (const address of registered) {
    const name = names[address];
    if (!name) {
      skipped.push({ kind: "critic", id: address, reason: `Missing provisioned ENS name for critic ${address}` });
      continue;
    }
    const stake = await pub.readContract({
      address: options.criticRegistry,
      abi: criticRegistryAbi,
      functionName: "stakeOf",
      args: [address],
      blockNumber: toBlock,
    });
    await options.relayer.critic({
      name,
      address,
      stake: stake.toString(),
      honestRounds: honestRounds.get(address) ?? 0,
      slashes: slashes.get(address) ?? 0,
    });
  }
  return { sourceBlock: toBlock.toString(), finalized, critics: registered.size - skipped.filter((item) => item.kind === "critic").length, skipped };
}
