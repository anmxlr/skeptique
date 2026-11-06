import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBanner } from "../components/demo-banner";
import { SiteNav } from "../components/site-nav";
import { ThemeToggle } from "../components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "skeptique", template: "%s · skeptique" },
  description: "Staked, human-backed critics rate agent services so buyer agents can pick good ones.",
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
          <Link href="/" className="brand">
            skeptique
          </Link>
          <SiteNav />
          <ThemeToggle />
        </header>
        <DemoBanner />
        {/* tabIndex lets the skip link move keyboard focus here, so the next Tab starts inside the content. */}
        <main id="main" className="page" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
