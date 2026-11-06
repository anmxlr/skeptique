import { roundManagerAbi } from "@skeptique/shared/abi/RoundManager";
import { type Account, type Address, createPublicClient, createWalletClient, http } from "viem";

/** Anyone may finalise a round once its reveal window has closed; the seed and drills use this. */
export async function finalizeRound(options: {
  rpcUrl: string;
  manager: Address;
  caller: Account | Address;
  roundId: number;
}) {
  const transport = http(options.rpcUrl);
  const hash = await createWalletClient({ account: options.caller, transport }).writeContract({
    address: options.manager,
    abi: roundManagerAbi,
    functionName: "finalize",
    args: [BigInt(options.roundId)],
    chain: null,
  });
  await createPublicClient({ transport }).waitForTransactionReceipt({ hash });
}
