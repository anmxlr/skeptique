import { createHederaPayAndCall, createLocalPayAndCall, type PayAndCall } from "@skeptique/x402-client";

export type PaymentMode =
  | { mode: "hedera"; signer: { accountId: string; privateKey: string } }
  | { mode: "local"; signer: null };

/** Hedera mode needs the facilitator and the buyer account; anything less runs the free local mode. */
export function paymentModeFromEnv(env: Record<string, string | undefined> = process.env): PaymentMode {
  const { X402_FACILITATOR_URL, BUYER_ACCOUNT_ID, BUYER_PRIVATE_KEY } = env;
  if (X402_FACILITATOR_URL && BUYER_ACCOUNT_ID && BUYER_PRIVATE_KEY)
    return { mode: "hedera", signer: { accountId: BUYER_ACCOUNT_ID, privateKey: BUYER_PRIVATE_KEY } };
  return { mode: "local", signer: null };
}

export function payAndCallFor(mode: PaymentMode["mode"], priceFor: (url: string) => Promise<string>): PayAndCall {
  return mode === "hedera" ? createHederaPayAndCall() : createLocalPayAndCall({ priceFor });
}
