import type { Metadata } from "next";
import { Arena } from "../../components/arena";

export const metadata: Metadata = { title: "Arena" };

const LIMITS = [
  "Agreement among critics is not ground truth: the review score is what staked critics agreed on.",
  "Both agents' choices are model judgments and can vary from run to run.",
  "Service names are hidden from both agents.",
  "Local-market shortcuts: critics call a free review instance, probes are fixed held-out cases, and flaky-fx is unreviewed.",
];

export default function ArenaPage() {
  return (
    <>
      <h1>Arena</h1>
      <p>
        One task goes to two identical buyer agents; only one sees Skeptique&apos;s stake-backed reviews and passes a
        spend policy, both pay real x402 on Hedera testnet, and a deterministic oracle grades their answers.
      </p>
      <Arena />
      <section className="arena-panel" aria-labelledby="arena-limits">
        <h2 id="arena-limits">Honest limits</h2>
        <ul className="limits-list">
          {LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
