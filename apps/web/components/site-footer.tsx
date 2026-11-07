import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          {/* biome-ignore lint/performance/noImgElement: tiny static logo, no optimisation needed */}
          <img src="/brand/logo.png" alt="" width={24} height={24} className="brand-mark" />
          <p>Don’t trust. Use Skeptique.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="footer-links">
            <li>
              <Link href="/limits">Limits</Link>
            </li>
            <li>
              <Link href="/audit">Audit</Link>
            </li>
            <li>
              <a href="https://github.com/anmxlr/skeptique" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
