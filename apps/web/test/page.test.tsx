import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "../app/page";

it("renders the home page", () => {
  expect(renderToString(<Home />)).toContain("skeptic");
});
