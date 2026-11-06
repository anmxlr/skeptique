import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { type Account, type Address, createPublicClient, createWalletClient, http } from "viem";
import type { RoundAgentContract } from "./round-agent";

/** RoundManager over JSON-RPC for one critic account; plugs into createRoundAgent. */
export function createViemRoundContract(options: {
  rpcUrl: string;
  address: Address;
  account: Account | Address;
}): RoundAgentContract {
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ transport });
  const wallet = createWalletClient({ account: options.account, transport });
  const base = { address: options.address, abi: roundManagerAbi, chain: null } as const;
  const read = { address: options.address, abi: roundManagerAbi } as const;
  return {
    commit: (roundId, commitment) =>
      wallet.writeContract({ ...base, functionName: "commit", args: [roundId, commitment] }),
    reveal: (roundId, score, salt, evidenceHash, claimedCost) =>
      wallet.writeContract({
        ...base,
        functionName: "reveal",
        args: [roundId, score, salt, evidenceHash, claimedCost],
      }),
    waitForReceipt: async (hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { status: receipt.status };
    },
    isCommitted: (roundId, critic) =>
      publicClient.readContract({ ...read, functionName: "hasCommitted", args: [roundId, critic as Address] }),
    isRevealed: (roundId, critic) =>
      publicClient.readContract({ ...read, functionName: "hasRevealed", args: [roundId, critic as Address] }),
  };
}
