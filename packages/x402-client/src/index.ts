export type PayAndCallArgs = { url: string; body: unknown; maxPrice: string; signer: unknown; signal?: AbortSignal; criticCall?: boolean };
export type PayAndCallResult = { response: unknown; txId: string | null; paid: boolean };
export type PayAndCall = (args: PayAndCallArgs) => Promise<PayAndCallResult>;

type LocalOptions = {
  priceFor: (url: string) => Promise<string>;
  onBeforePay?: (price: string, merchant: string) => Promise<boolean> | boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class PaymentPolicyError extends Error {
  readonly code = 'PAYMENT_POLICY_DENIED';
}

function amount(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new PaymentPolicyError('Invalid price');
  return BigInt(value);
}

// Local mode preserves the payment guard and interface but never sends a payment.
export function createLocalPayAndCall({ priceFor, onBeforePay, fetchImpl = fetch, timeoutMs = 15_000 }: LocalOptions): PayAndCall {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error('Invalid timeoutMs');
  return async ({ url, body, maxPrice, signal: callerSignal, criticCall }) => {
    const controller = new AbortController();
    const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
    signal.throwIfAborted();
    const timer = setTimeout(() => controller.abort(new Error('Payment request timed out')), timeoutMs);
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      });
      const request = async (): Promise<PayAndCallResult> => {
        const price = await priceFor(url);
        signal.throwIfAborted();
        if (amount(price) > amount(maxPrice)) throw new PaymentPolicyError('Price exceeds maxPrice');
        if (onBeforePay) {
          let allowed: boolean;
          try { allowed = await onBeforePay(price, new URL(url).origin); }
          catch (cause) { throw new PaymentPolicyError('Payment policy check failed', { cause }); }
          if (!allowed) throw new PaymentPolicyError('Payment denied');
        }
        signal.throwIfAborted();
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(criticCall ? { 'x-skeptic-call-role': 'critic' } : {}) },
          body: JSON.stringify(body),
          signal,
        });
        if (!response.ok) throw new Error(`Service returned ${response.status}`);
        return { response: await response.json(), txId: null, paid: false };
      };
      return await Promise.race([request(), aborted]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  };
}
