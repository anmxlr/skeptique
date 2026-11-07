import type { SpendLimits } from "@skeptique/shared";
import type { AuditMessage } from "@skeptique/shared/hcs";
import type { PayAndCall } from "@skeptique/x402-client";

export type ApprovalRequest = { merchant: string; amount: string };

export interface SpendControlsOptions {
  /** The owner's current limits; null (none set) denies every payment. Read on each payment. */
  limits: () => Promise<SpendLimits | null> | SpendLimits | null;
  /** Asks a human about a payment above the threshold; resolves true only on an explicit approval. */
  approve: (request: ApprovalRequest) => Promise<boolean>;
  /** Posts an audit message (the relayer's HCS audit log). */
  audit: (message: AuditMessage) => Promise<unknown>;
  payer?: string;
  now?: () => number;
  onAuditError?: (error: unknown) => void;
}

/**
 * Budget, per-merchant cap, allowlist and the one human approval, enforced through `onBeforePay`.
 * Spend is reserved when a payment is allowed, so concurrent payments cannot overshoot the limits,
 * and released again if the payment then fails.
 */
export function createSpendControls({
  limits,
  approve,
  audit,
  payer = "buyer",
  now = Date.now,
  onAuditError = (error) => console.error("agent_spend audit post failed", error),
}: SpendControlsOptions) {
  let total = 0n;
  const byMerchant = new Map<string, bigint>();

  const reserve = (merchant: string, amount: bigint) => {
    total += amount;
    byMerchant.set(merchant, (byMerchant.get(merchant) ?? 0n) + amount);
  };
  const release = (merchant: string, amount: bigint) => {
    total -= amount;
    byMerchant.set(merchant, (byMerchant.get(merchant) ?? 0n) - amount);
  };

  async function allowed(price: string, merchant: string): Promise<boolean> {
    const config = await limits();
    if (!config || !config.allowlist.includes(merchant)) return false;
    const amount = BigInt(price);
    if (total + amount > BigInt(config.budget)) return false;
    if ((byMerchant.get(merchant) ?? 0n) + amount > BigInt(config.perMerchantCap)) return false;
    if (amount > BigInt(config.approvalThreshold)) {
      const approved = await approve({ merchant, amount: price }).catch(() => false);
      if (!approved) return false;
    }
    // A concurrent payment may have been reserved while a human was deciding.
    if (total + amount > BigInt(config.budget)) return false;
    if ((byMerchant.get(merchant) ?? 0n) + amount > BigInt(config.perMerchantCap)) return false;
    return true;
  }

  return {
    /** Builds a payer per call from the guard, so each call knows what it reserved. */
    wrap(make: (onBeforePay: (price: string, merchant: string) => Promise<boolean>) => PayAndCall): PayAndCall {
      return async (args) => {
        let reserved: { merchant: string; amount: bigint; price: string } | undefined;
        const onBeforePay = async (price: string, merchant: string) => {
          if (!(await allowed(price, merchant))) return false;
          reserved = { merchant, amount: BigInt(price), price };
          reserve(merchant, reserved.amount);
          return true;
        };
        let result: Awaited<ReturnType<PayAndCall>>;
        try {
          result = await make(onBeforePay)(args);
        } catch (error) {
          if (reserved) release(reserved.merchant, reserved.amount);
          throw error;
        }
        if (reserved && result.paid && result.txId) {
          try {
            await audit({
              type: "agent_spend",
              payer,
              merchant: reserved.merchant,
              amount: reserved.price,
              txId: result.txId,
              ts: now(),
            });
          } catch (error) {
            onAuditError(error);
          }
        }
        return result;
      };
    },
    spent: () => ({ total, byMerchant: Object.fromEntries(byMerchant) }),
  };
}
