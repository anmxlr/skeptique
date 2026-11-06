import { z } from "zod";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .refine((value) => !/^0x0{40}$/.test(value))
  .transform((value) => value as `0x${string}`);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const atomic = z.string().regex(/^(0|[1-9]\d*)$/);
const positiveAtomic = z.string().regex(/^[1-9]\d*$/);
export const DeploymentSchema = z.object({
  version: z.literal(1),
  network: z.literal("hedera-testnet"),
  chainId: z.literal(296),
  ensParentName: z.string().min(1).optional(),
  deployedAt: z.iso.datetime(),
  deploymentBlock: atomic,
  contracts: z.object({ ServiceRegistry: address, CriticRegistry: address, RoundManager: address }),
  transactions: z.array(z.object({ name: z.string().min(1), hash })),
  config: z
    .object({
      minStakeTinybars: positiveAtomic,
      minListingFeeTinybars: positiveAtomic,
      withdrawCooldown: z.number().int().positive(),
      commitSeconds: z.number().int().positive(),
      revealSeconds: z.number().int().positive(),
      kMin: z.number().int().min(1).max(255),
      kMax: z.number().int().min(1).max(255),
      tolerance: z.number().int().min(0).max(100),
      slashBps: z.number().int().min(0).max(10000),
    })
    .refine((config) => config.kMin <= config.kMax, "kMin must not exceed kMax"),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export function tinybarsFromHbar(value: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(value)) throw new Error("HBAR amount must have at most eight decimals");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}

/** ABI amounts stay tinybars. Only Hedera's JSON-RPC transaction value uses 18 decimals. */
export function contractValue(tinybars: bigint, chainId: number): bigint {
  if (tinybars < 0n) throw new Error("Negative contract value");
  if (chainId === 296) return tinybars * 10000000000n;
  if (chainId === 31337) return tinybars;
  throw new Error("Unsupported mechanism chain");
}

export const hashscanTransaction = (hash: string) => `https://hashscan.io/testnet/transaction/${hash}`;
