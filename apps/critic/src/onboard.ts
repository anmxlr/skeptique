import { criticRegistryAbi } from "@skeptique/shared/abi/CriticRegistry";
import { type Account, type Address, createPublicClient, createWalletClient, type Hex, http } from "viem";

export type Onboarding =
  | { status: "registered"; nullifier: Hex; txHash: Hex }
  | { status: "denied"; reason: string; detail?: string };

/**
 * The protected action behind World ID: hand the IDKit result to the API, and only if it returns an attestor
 * voucher, stake and register on CriticRegistry. A denial never sends a transaction.
 */
export async function registerWithWorld(options: {
  apiUrl: string;
  /** The IDKit 4.0 result (or IDKit error) exactly as the World ID flow returned it. */
  result: object;
  critic: Account | Address;
  rpcUrl: string;
  registry: Address;
  fetchImpl?: typeof fetch;
}): Promise<Onboarding> {
  const criticAddress = typeof options.critic === "string" ? options.critic : options.critic.address;
  const res = await (options.fetchImpl ?? fetch)(new URL("/world/verify", options.apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...options.result, critic: criticAddress }),
  });
  const body = (await res.json().catch(() => ({}))) as { reason?: string; detail?: string } & {
    nullifier?: Hex;
    expiry?: string;
    sig?: Hex;
  };
  if (res.status !== 200 || !body.nullifier || !body.expiry || !body.sig)
    return { status: "denied", reason: body.reason ?? `http_${res.status}`, detail: body.detail };

  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ transport });
  const minStake = await publicClient.readContract({
    address: options.registry,
    abi: criticRegistryAbi,
    functionName: "minStake",
  });
  const txHash = await createWalletClient({ account: options.critic, transport }).writeContract({
    address: options.registry,
    abi: criticRegistryAbi,
    functionName: "registerCritic",
    args: [body.nullifier, BigInt(body.expiry), body.sig],
    value: minStake,
    chain: null,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`registerCritic reverted in ${txHash}`);
  return { status: "registered", nullifier: body.nullifier, txHash };
}
