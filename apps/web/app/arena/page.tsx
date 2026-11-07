import type { Metadata } from "next";
import Link from "next/link";
import { Arena } from "../../components/arena";

export const metadata: Metadata = { title: "Arena" };

const LIMITS = [
  "Critic agreement is not ground truth: a review score is what staked critics agreed on.",
  "The agents' choices are model judgments and can vary from run to run.",
  "Local-market shortcuts: critics call a free review instance, probes are fixed held-out cases, and flaky-fx is unreviewed.",
];

export default function ArenaPage() {
  return (
    <>
      <h1>Arena</h1>
      <Arena />
      <details className="arena-details arena-limits">
        <summary>Honest limits</summary>
        <ul className="limits-list">
          {LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p>
          <Link href="/limits">All limits</Link>
        </p>
      </details>
    </>
  );
}
