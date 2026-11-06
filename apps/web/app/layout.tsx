import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "../components/site-nav";
import { ThemeToggle } from "../components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "skeptic", template: "%s · skeptic" },
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
            skeptic
          </Link>
          <SiteNav />
          <ThemeToggle />
        </header>
        <main id="main" className="page">
          {children}
        </main>
      </body>
    </html>
  );
}
