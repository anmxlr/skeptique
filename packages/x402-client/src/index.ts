// criticCall is internal accounting metadata; disclosing it to sellers enables selective service quality.
export type PayAndCallArgs = {
  url: string;
  body: unknown;
  maxPrice: string;
  signer: unknown;
  signal?: AbortSignal;
  criticCall?: boolean;
};
export type PayAndCallResult = { response: unknown; txId: string | null; paid: boolean };
export type PayAndCall = (args: PayAndCallArgs) => Promise<PayAndCallResult>;

type LocalOptions = {
  priceFor: (url: string) => Promise<string>;
  onBeforePay?: (price: string, merchant: string) => Promise<boolean> | boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class PaymentPolicyError extends Error {
  readonly code = "PAYMENT_POLICY_DENIED";
}

function amount(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new PaymentPolicyError("Invalid price");
  return BigInt(value);
}

// Local mode preserves the payment guard and interface but never sends a payment.
export function createLocalPayAndCall({
  priceFor,
  onBeforePay,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}: LocalOptions): PayAndCall {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
    throw new Error("Invalid timeoutMs");
  return async ({ url, body, maxPrice, signal: callerSignal }) => {
    const controller = new AbortController();
    const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
    signal.throwIfAborted();
    const timer = setTimeout(() => controller.abort(new Error("Payment request timed out")), timeoutMs);
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const request = async (): Promise<PayAndCallResult> => {
        const price = await priceFor(url);
        signal.throwIfAborted();
        if (amount(price) > amount(maxPrice)) throw new PaymentPolicyError("Price exceeds maxPrice");
        if (onBeforePay) {
          let allowed: boolean;
          try {
            allowed = await onBeforePay(price, new URL(url).origin);
          } catch (cause) {
            throw new PaymentPolicyError("Payment policy check failed", { cause });
          }
          if (!allowed) throw new PaymentPolicyError("Payment denied");
        }
        signal.throwIfAborted();
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
        if (!response.ok) throw new Error(`Service returned ${response.status}`);
        return { response: await response.json(), txId: null, paid: false };
      };
      return await Promise.race([request(), aborted]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  };
}

export type HederaSigner = { accountId: string; privateKey: string };
const HBAR = "0.0.0";
const NETWORK = "hedera:testnet";

function hederaSigner(value: unknown): HederaSigner {
  const s = value as Partial<HederaSigner> | null;
  if (
    !s ||
    typeof s.accountId !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(s.accountId) ||
    typeof s.privateKey !== "string" ||
    !s.privateKey
  )
    throw new PaymentPolicyError("signer must be { accountId: '0.0.x', privateKey }");
  return { accountId: s.accountId, privateKey: s.privateKey };
}

/** The settled tx id from a PAYMENT-RESPONSE header; null for a free response or a failed settlement. */
export function settledTxId(headers: Headers): string | null {
  const header = headers.get("payment-response");
  if (!header) return null;
  try {
    const settled = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      success?: boolean;
      transaction?: string;
      transactionId?: string;
    };
    return settled.success === true ? (settled.transaction ?? settled.transactionId ?? null) : null;
  } catch {
    return null;
  }
}

type HederaOptions = {
  onBeforePay?: (price: string, merchant: string) => Promise<boolean> | boolean;
  fetchImpl?: typeof fetch;
};

// Hedera mode: x402 v2 `exact` payments in HBAR (tinybars) on hedera:testnet. The client signs, the
// facilitator pays fees and settles; no human prompt. maxPrice and onBeforePay run before any signing.
export function createHederaPayAndCall({ onBeforePay, fetchImpl = fetch }: HederaOptions = {}): PayAndCall {
  return async ({ url, body, maxPrice, signer, signal }) => {
    const cap = amount(maxPrice);
    const { accountId, privateKey } = hederaSigner(signer);
    const [{ x402Client, wrapFetchWithPayment }, { createClientHederaSigner, PrivateKey }, { ExactHederaScheme }] =
      await Promise.all([import("@x402/fetch"), import("@x402/hedera"), import("@x402/hedera/exact/client")]);
    let denied: PaymentPolicyError | undefined;
    const client = x402Client.fromConfig({
      schemes: [
        {
          network: NETWORK,
          client: new ExactHederaScheme(
            createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(privateKey), { network: NETWORK }),
          ),
        },
      ],
      spendControls: { allowedAssets: [{ network: NETWORK, asset: HBAR, maxAmountPerPayment: cap.toString() }] },
    });
    client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
      if (r.asset !== HBAR || r.network !== NETWORK) {
        denied = new PaymentPolicyError("Only HBAR on hedera:testnet is payable");
      } else if (amount(r.amount) > cap) {
        denied = new PaymentPolicyError("Price exceeds maxPrice");
      } else if (onBeforePay) {
        try {
          if (!(await onBeforePay(r.amount, r.payTo))) denied = new PaymentPolicyError("Payment denied");
        } catch (cause) {
          denied = new PaymentPolicyError("Payment policy check failed", { cause });
        }
      }
      if (denied) return { abort: true, reason: denied.message };
    });
    const paidFetch = wrapFetchWithPayment(fetchImpl, client);
    let response: Response;
    try {
      response = await paidFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (!denied && error instanceof Error && error.message.includes("maxAmountPerPayment"))
        throw new PaymentPolicyError("Price exceeds maxPrice", { cause: error });
      throw denied ?? error;
    }
    if (denied) throw denied;
    if (!response.ok) throw new Error(`Service returned ${response.status}`);
    const txId = settledTxId(response.headers);
    return { response: await response.json(), txId, paid: txId !== null };
  };
}
