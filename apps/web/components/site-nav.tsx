"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "../lib/nav";

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="nav-list">
        {NAV_ITEMS.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className="nav-link" aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
