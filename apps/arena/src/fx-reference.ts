import type { TestSuite } from "@skeptique/shared";
import { defineService } from "../../services/common/server";
import { REFERENCE_FX } from "./oracle";

/** An honest FX vendor for the local marketplace: always the published reference rate. */
export function handleFxReference(input: unknown) {
  const { from, to, amount } = (input ?? {}) as { from?: unknown; to?: unknown; amount?: unknown };
  if (typeof from !== "string" || typeof to !== "string" || typeof amount !== "number" || !Number.isFinite(amount))
    throw new Error("Expected from, to, and finite amount");
  const rate = from === to ? 1 : REFERENCE_FX[`${from}:${to}`];
  if (rate === undefined) throw new Error(`Unsupported currency pair ${from}/${to}`);
  return { from, to, amount, rate, converted: Math.round(amount * rate * 100) / 100 };
}

const exact = (id: string, from: string, to: string, amount: number) => ({
  id,
  input: { from, to, amount },
  expect: { kind: "exact" as const, value: handleFxReference({ from, to, amount }) },
  weight: 1,
});

export const fxReferenceSuite: TestSuite = {
  version: 1,
  serviceName: "fx-reference",
  category: "currency-conversion",
  determinism: "none",
  cases: [
    exact("usd-eur", "USD", "EUR", 10),
    exact("usd-inr", "USD", "INR", 1),
    exact("gbp-usd", "GBP", "USD", 4),
    exact("same-currency", "EUR", "EUR", 5),
  ],
};

export const fxReference = defineService("fx-reference", fxReferenceSuite, handleFxReference);
