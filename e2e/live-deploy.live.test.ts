import { describe, expect, it } from "vitest";
import { createSepoliaScoreReader, readEnsScore } from "../packages/shared/src/ens";

/*
 * Ticket 29 acceptance against the public deploy. Needs SKQ_PUBLIC_URL (the public web origin, which
 * proxies the API under /skq-api). The ENS check also needs SEPOLIA_RPC_URL and ENS_SCORE_TEST_NAME
 * (a service subname whose score the relayer has published, e.g. unit-convert.svc.skeptique.eth).
 */
const site = process.env.SKQ_PUBLIC_URL?.replace(/\/+$/, "");
const parentName = process.env.ENS_PARENT_NAME?.trim() || "skeptique.eth";
// ngrok's free tier serves a browser warning page unless this header is present.
const headers = { "ngrok-skip-browser-warning": "1" };

describe.skipIf(!site)("live deploy", () => {
  it("live deploy: marketplace page and API health are green on the public URL", async () => {
    const health = await fetch(`${site}/skq-api/health`, { headers });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, chainId: 296 });
    const page = await fetch(`${site}/`, { headers });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("skeptique");
  });

  const ensName = process.env.ENS_SCORE_TEST_NAME;
  const sepolia = process.env.SEPOLIA_RPC_URL;
  it.skipIf(!ensName || !sepolia)("live deploy: a score served publicly matches a resolver read made now", async () => {
    const snapshot = await readEnsScore(createSepoliaScoreReader(sepolia as string), {
      name: ensName as string,
      parentName,
    });
    expect(snapshot).not.toBeNull();
    const services = (await (await fetch(`${site}/skq-api/services`, { headers })).json()) as {
      ensName: string;
      median: number | null;
    }[];
    const listed = services.find((s) => s.ensName === ensName);
    expect(listed?.median).toBe(snapshot?.score);
  });
});
