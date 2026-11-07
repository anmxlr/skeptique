import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBanner } from "../components/demo-banner";
import { SiteFooter } from "../components/site-footer";
import { SiteNav } from "../components/site-nav";
import { ThemeToggle } from "../components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "skeptique", template: "%s · skeptique" },
  description: "Staked, human-backed critics rate agent services so buyer agents can pick good ones.",
  openGraph: { images: ["/brand/cover.webp"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              {/* biome-ignore lint/performance/noImgElement: tiny static logo, no optimisation needed */}
              <img src="/brand/logo.png" alt="" width={28} height={28} className="brand-mark" />
              <span>skeptique</span>
            </Link>
            <SiteNav />
            <ThemeToggle />
          </div>
        </header>
        <DemoBanner />
        {/* tabIndex lets the skip link move keyboard focus here, so the next Tab starts inside the content. */}
        <main id="main" className="page" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
