import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { type Address, createPublicClient, getAbiItem, type Transport } from "viem";
import type { createAuditLog } from "./hcs";

const finalizedEvent = getAbiItem({ abi: roundManagerAbi, name: "RoundFinalized" });
const slashedEvent = getAbiItem({ abi: criticRegistryAbi, name: "CriticSlashed" });

/** One bounded catch-up pass over finalisations and slashes; replays are harmless because the audit log dedupes. */
export async function relayAuditFromChain(options: {
  transport: Transport;
  chainId: number;
  fromBlock: bigint;
  confirmations: bigint;
  roundManager: Address;
  criticRegistry: Address;
  audit: ReturnType<typeof createAuditLog>;
  chunkSize?: bigint;
}) {
  const pub = createPublicClient({ transport: options.transport });
  if ((await pub.getChainId()) !== options.chainId) throw new Error("Unexpected audit source chain");
  const chunkSize = options.chunkSize ?? 2_000n;
  const toBlock = (await pub.getBlockNumber({ cacheTime: 0 })) - options.confirmations;
  let posted = 0;
  for (let start = options.fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
    const [finalized, slashed] = await Promise.all([
      pub.getLogs({
        address: options.roundManager,
        event: finalizedEvent,
        fromBlock: start,
        toBlock: end,
        strict: true,
      }),
      pub.getLogs({
        address: options.criticRegistry,
        event: slashedEvent,
        fromBlock: start,
        toBlock: end,
        strict: true,
      }),
    ]);
    const ts = Math.floor(Date.now() / 1000);
    for (const log of finalized) {
      const result = await options.audit.post({
        type: "round_finalized",
        roundId: log.args.roundId.toString(),
        serviceId: log.args.serviceId.toString(),
        median: log.args.median,
        nReveals: log.args.nReveals,
        isVoid: log.args.isVoid,
        ts,
      });
      if (result.posted) posted++;
    }
    for (const log of slashed) {
      const result = await options.audit.post({
        type: "critic_slashed",
        critic: log.args.critic,
        roundId: log.args.roundId.toString(),
        amount: log.args.amount.toString(),
        reason: log.args.reason.slice(0, 200),
        ts,
      });
      if (result.posted) posted++;
    }
  }
  return { posted };
}
