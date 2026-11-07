import type { Metadata } from "next";
import { BuyerRuns } from "../../components/buyer-runs";
import { SpendControls } from "../../components/spend-controls";

export const metadata: Metadata = { title: "Buyer" };

export default function BuyerPage() {
  return (
    <>
      <h1>Buyer</h1>
      <p>
        Two buyer agents get the same task. One picks by critic score, the other by popularity. Both pay through x402
        with no human approving.
      </p>
      <BuyerRuns />
      <SpendControls />
    </>
  );
}
