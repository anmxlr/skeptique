import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnsNameView } from "../components/ens-name";
import { createEnsResolve } from "../lib/ens";

const NAME = "unit-convert.svc.skeptique.eth";

describe("ENS name", () => {
  it("reads the resolver and records for the name it is given, through the client", async () => {
    const asked: string[] = [];
    const resolve = createEnsResolve({
      getEnsResolver: async ({ name }) => (
        asked.push(`resolver:${name}`), "0x00000000000000000000000000000000000000d1"
      ),
      getEnsText: async ({ name, key }) => (
        asked.push(`text:${name}:${key}`), key === "url" ? "https://svc.test" : null
      ),
    });
    expect(await resolve(NAME)).toEqual({
      resolver: "0x00000000000000000000000000000000000000d1",
      url: "https://svc.test",
      description: null,
    });
    expect(asked).toEqual([`resolver:${NAME}`, `text:${NAME}:url`, `text:${NAME}:description`]);
  });

  it("has no records when the name has no resolver", async () => {
    const resolve = createEnsResolve({ getEnsResolver: (async () => null) as never, getEnsText: async () => null });
    expect(await resolve(NAME)).toBeNull();
  });

  it("only says resolved once the resolver answered", () => {
    expect(renderToString(<EnsNameView name={NAME} state={{ status: "resolving" }} />)).not.toContain(
      "resolved on ENS",
    );
    expect(renderToString(<EnsNameView name={NAME} state={{ status: "unresolved" }} />)).toContain("not on ENS yet");
    const html = renderToString(
      <EnsNameView
        name={NAME}
        state={{ status: "resolved", records: { resolver: "0xd1", url: "https://svc.test", description: null } }}
      />,
    );
    expect(html).toContain(NAME);
    expect(html).toContain("resolved on ENS");
    expect(html).toContain("https://svc.test");
  });

  it("shows a resolution failure", () => {
    const html = renderToString(<EnsNameView name={NAME} state={{ status: "error", message: "rpc down" }} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("rpc down");
  });
});
