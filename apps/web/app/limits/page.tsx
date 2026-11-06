import type { Metadata } from "next";

export const metadata: Metadata = { title: "Limits" };

// spec/02 §6, plus the one limit that only applies to this demo.
const NOT_DEFENDED = [
  {
    title: "Staged consensus in this demo",
    detail:
      "The team runs every critic agent here, so the scores show how the mechanism works, not independent judgement.",
  },
  {
    title: "A majority of stake colluding",
    detail: "If most staked critics agree to lie, the median follows them.",
  },
  {
    title: "A seller bribing real humans",
    detail: "World ID proves a critic is a unique human, not that the human is honest.",
  },
  {
    title: "Critics sharing one wrong belief",
    detail: "The score is what critics agree on; consensus is not truth.",
  },
  {
    title: "Nondeterministic services",
    detail: "Nondeterministic services can punish honest critics whose results differ from the median by chance.",
  },
  {
    title: "Seller-critic payment circularity",
    detail:
      "Paid test calls can inflate usage numbers. We exclude critic test calls from popularity, but ranking does not depend on popularity anyway.",
  },
];

const DEFENDED = [
  { title: "Copying", detail: "Commit-reveal: critics commit to a score before anyone reveals." },
  { title: "Sybil critics", detail: "One critic per human, enforced by the World ID nullifier." },
  { title: "Lazy critics", detail: "Critics far from the median lose part of their stake." },
  { title: "Seller steering", detail: "The fee is locked, sellers cannot choose critics and no score is shown early." },
  { title: "Suite overfitting", detail: "Critics add private probes beyond the public test suite." },
  { title: "Self-review", detail: "A seller's address cannot register as a critic." },
];

function LimitList({ items }: { items: readonly { title: string; detail: string }[] }) {
  return (
    <ul className="limits-list">
      {items.map(({ title, detail }) => (
        <li key={title}>
          <strong>{title}.</strong> {detail}
        </li>
      ))}
    </ul>
  );
}

export default function LimitsPage() {
  return (
    <>
      <h1>Limits</h1>
      <p>What skeptique does not protect against, stated plainly, and what it does.</p>
      <h2>Not defended</h2>
      <LimitList items={NOT_DEFENDED} />
      <h2>Defended</h2>
      <LimitList items={DEFENDED} />
    </>
  );
}
