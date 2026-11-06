import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import ArenaPage from "../app/arena/page";
import AuditPage from "../app/audit/page";
import BuyerPage from "../app/buyer/page";
import CriticsPage from "../app/critics/page";
import LimitsPage from "../app/limits/page";
import MarketplacePage from "../app/page";
import SellPage from "../app/sell/page";
import { NAV_ITEMS } from "../lib/nav";

const pages: Record<string, ComponentType> = {
  "/": MarketplacePage,
  "/critics": CriticsPage,
  "/sell": SellPage,
  "/buyer": BuyerPage,
  "/arena": ArenaPage,
  "/audit": AuditPage,
  "/limits": LimitsPage,
};

it.each(NAV_ITEMS)("renders the $label page with its heading", ({ href, label }) => {
  const Page = pages[href];
  expect(renderToString(<Page />)).toContain(`<h1>${label}</h1>`);
});
