import type { Metadata } from "next";

export const metadata: Metadata = { title: "Buyer" };

export default function BuyerPage() {
  return (
    <>
      <h1>Buyer</h1>
      <p>Buyer agents pick services by score and pay via x402, within spend limits.</p>
    </>
  );
}
