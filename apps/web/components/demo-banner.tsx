import Link from "next/link";

/** Shown on every page: the demo's consensus is staged because the team runs all critics. */
export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="Demo mode">
      <strong>Demo mode:</strong> the skeptique team runs the critic agents, so the consensus you see is staged.{" "}
      <Link href="/limits">See the honest limits</Link>
    </aside>
  );
}
