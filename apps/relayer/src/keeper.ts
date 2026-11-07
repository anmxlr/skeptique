import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import {
  type Account,
  type Address,
  type Chain,
  getAbiItem,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

export interface KeeperOptions {
  client: PublicClient;
  wallet: WalletClient<Transport, Chain | undefined, Account>;
  roundManager: Address;
  serviceRegistry: Address;
  criticRegistry: Address;
  /** First block to scan for critic registrations (the deployment block). */
  fromBlock?: bigint;
  log?: (line: string) => void;
}

/** Finalises rounds past their reveal window and reopens services with bounty left (spec/02 §3 steps 4 and 6). */
export function createKeeper(options: KeeperOptions) {
  const { client, wallet, roundManager, serviceRegistry, criticRegistry } = options;
  const log = options.log ?? (() => {});
  const criticRegistered = getAbiItem({ abi: criticRegistryAbi, name: "CriticRegistered" });
  // Rounds below this id are finalised for good, so later ticks skip them.
  let settledBelow = 1n;
  // serviceId -> newest round id seen; kept across ticks because settled rounds are no longer rescanned.
  const lastRound = new Map<bigint, bigint>();

  const getRound = (roundId: bigint) =>
    client.readContract({ address: roundManager, abi: roundManagerAbi, functionName: "getRound", args: [roundId] });

  /** A revert (someone else got there first) is logged and skipped; it never stops the loop. */
  async function send(label: string, functionName: "finalize" | "openRound", arg: bigint): Promise<boolean> {
    try {
      const hash = await wallet.writeContract({
        address: roundManager,
        abi: roundManagerAbi,
        functionName,
        args: [arg],
        chain: wallet.chain ?? null,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
      log(`${label} ok`);
      return true;
    } catch (cause) {
      log(`${label} skipped: ${(cause as { shortMessage?: string }).shortMessage ?? (cause as Error).message}`);
      return false;
    }
  }

  /** Registered critics with unlocked stake, divided by K_MIN, at least 1. */
  async function criticSlots(kMin: bigint): Promise<bigint> {
    const logs = await client.getLogs({
      address: criticRegistry,
      event: criticRegistered,
      fromBlock: options.fromBlock ?? 0n,
      toBlock: "latest",
      strict: true,
    });
    const critics = [...new Set(logs.map((entry) => entry.args.critic))];
    const call = { address: criticRegistry, abi: criticRegistryAbi } as const;
    const available = await Promise.all(
      critics.map(async (critic) => {
        const [isCritic, stake, active] = await Promise.all([
          client.readContract({ ...call, functionName: "isCritic", args: [critic] }),
          client.readContract({ ...call, functionName: "stakeOf", args: [critic] }),
          client.readContract({ ...call, functionName: "activeRound", args: [critic] }),
        ]);
        return isCritic && stake > 0n && active === 0n;
      }),
    );
    const slots = BigInt(available.filter(Boolean).length) / kMin;
    return slots > 0n ? slots : 1n;
  }

  /** One pass: finalise what is due, then open as many rounds as the critic pool can fill. */
  async function tick() {
    const [nextRoundId, serviceCount, kMin, block] = await Promise.all([
      client.readContract({ address: roundManager, abi: roundManagerAbi, functionName: "nextRoundId" }),
      client.readContract({ address: serviceRegistry, abi: serviceRegistryAbi, functionName: "serviceCount" }),
      client.readContract({ address: roundManager, abi: roundManagerAbi, functionName: "kMin" }),
      client.getBlock(),
    ]);
    const open = new Set<bigint>(); // serviceIds with an unfinalised round
    let contiguous = true;
    for (let roundId = settledBelow; roundId < nextRoundId; roundId++) {
      let round = await getRound(roundId);
      if (!round.finalized && block.timestamp >= round.revealEnd) {
        await send(`finalize round ${roundId}`, "finalize", roundId);
        round = await getRound(roundId);
      }
      lastRound.set(round.serviceId, roundId);
      if (round.finalized) {
        if (contiguous) settledBelow = roundId + 1n;
      } else {
        open.add(round.serviceId);
        contiguous = false;
      }
    }

    const slots = await criticSlots(BigInt(kMin));
    // Least recently reviewed first, so one busy service cannot starve the others.
    const queue: bigint[] = [];
    for (let serviceId = 1n; serviceId <= serviceCount; serviceId++) if (!open.has(serviceId)) queue.push(serviceId);
    queue.sort((a, b) => Number((lastRound.get(a) ?? 0n) - (lastRound.get(b) ?? 0n)));
    for (const serviceId of queue) {
      if (BigInt(open.size) >= slots) break;
      const service = await client.readContract({
        address: serviceRegistry,
        abi: serviceRegistryAbi,
        functionName: "getService",
        args: [serviceId],
      });
      if (service.bounty === 0n) continue;
      if (await send(`open round for service ${serviceId}`, "openRound", serviceId)) open.add(serviceId);
    }
  }

  async function run(pollMs: number, signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        await tick();
      } catch (cause) {
        log(`keeper tick failed: ${(cause as Error).message}`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  return { tick, run };
}
