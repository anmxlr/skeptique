export type PayAndCallArgs = { url: string; body: unknown; maxPrice: string; signer: unknown };
export type PayAndCallResult = { response: unknown; txId: string | null; paid: boolean };
export type PayAndCall = (args: PayAndCallArgs) => Promise<PayAndCallResult>;

type LocalOptions = {
  priceFor: (url: string) => Promise<string>;
  onBeforePay?: (price: string, merchant: string) => Promise<boolean> | boolean;
  fetchImpl?: typeof fetch;
};

function amount(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid price');
  return BigInt(value);
}

// Local mode preserves the payment guard and interface but never sends a payment.
export function createLocalPayAndCall({ priceFor, onBeforePay, fetchImpl = fetch }: LocalOptions): PayAndCall {
  return async ({ url, body, maxPrice }) => {
    const price = await priceFor(url);
    if (amount(price) > amount(maxPrice)) throw new Error('Price exceeds maxPrice');
    if (onBeforePay && !(await onBeforePay(price, new URL(url).origin))) throw new Error('Payment denied');
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Service returned ${response.status}`);
    return { response: await response.json(), txId: null, paid: false };
  };
}
