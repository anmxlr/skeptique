import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sell" };

export default function SellPage() {
  return (
    <>
      <h1>Sell</h1>
      <p>List a service and fund its bounty pool with the listing fee.</p>
    </>
  );
}
