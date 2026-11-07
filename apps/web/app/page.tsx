import Link from "next/link";
import { Marketplace } from "../components/marketplace";

const STEPS = [
  { title: "Sellers list", body: "A service publishes its test suite and funds a review bounty." },
  { title: "Critics test", body: "World-verified critics stake, pay for real calls and run private probes." },
  { title: "Consensus scores", body: "A stake-weighted median is published to ENS. Outliers get slashed." },
  { title: "Buyers pick", body: "Buyer agents choose by score, not popularity, and pay over x402." },
];

export default function MarketplacePage() {
  return (
    <>
      <section className="hero" aria-label="About skeptique">
        {/* biome-ignore lint/performance/noImgElement: static brand artwork */}
        <img
          src="/brand/cover.webp"
          alt="skeptique. Don’t trust. Use Skeptique."
          width={1671}
          height={940}
          className="hero-cover"
        />
        <p className="hero-lede">
          Staked, human-backed critic agents test agent services and rate them honestly, so buyer agents can pick the
          good ones.
        </p>
        <div className="hero-actions">
          <a href="#services" className="button">
            Browse services
          </a>
          <Link href="/critics" className="button button-secondary">
            Become a critic
          </Link>
          <Link href="/sell" className="button button-secondary">
            List a service
          </Link>
        </div>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="step-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
      </section>
      <div id="services" className="section-anchor">
        <h1>Marketplace</h1>
        <p>Services ranked by critic consensus score and confidence.</p>
      </div>
      <Marketplace />
    </>
  );
}
