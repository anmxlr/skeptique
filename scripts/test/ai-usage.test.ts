import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileAiUsage, parseReceipt } from "../ai-usage.mjs";

const receipt = (nn: string, title: string, aiUse?: string) =>
  [
    `# ${nn}: ${title} (receipt)`,
    "",
    "## What changed",
    "Stuff.",
    ...(aiUse === undefined ? [] : ["", "## AI-use note", aiUse]),
    "",
  ].join("\n");

const ticket = (nn: string, title: string, tracks: string) =>
  `# ${nn}: ${title}\n\n**Status:** ready-for-agent\n**Size:** S\n**Tracks:** ${tracks}\n`;

describe("ai usage", () => {
  let root: string;
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skeptic-ai-usage-"));
    write("board/done/04.md", receipt("04", "Scaffold", "Scaffold written by an agent.\nHuman reviewed."));
    write("board/done/24.md", receipt("24", "Buyer", "Buyer written by an agent."));
    write("board/done/15.md", receipt("15", "x402 live", "x402 client written by an agent."));
    write("board/done/16.md", receipt("16", "World onboarding"));
    write("board/done/09-SPLIT.md", "# split proposal\n");
    write(".scratch/skeptic-v1/issues/04-scaffold.md", ticket("04", "Scaffold", "none"));
    write(".scratch/skeptic-v1/issues/15-x402.md", ticket("15", "x402", "Hedera"));
    write(".scratch/skeptic-v1/issues/16-world.md", ticket("16", "World", "World"));
    write(".scratch/skeptic-v1/issues/24-buyer.md", ticket("24", "Buyer", "Hedera"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("parses a receipt's ticket, title and AI-use note", () => {
    expect(parseReceipt("04.md", receipt("04", "Scaffold", "Written by an agent.\n"))).toEqual({
      ticket: "04",
      title: "Scaffold",
      aiUse: "Written by an agent.",
    });
    expect(parseReceipt("16.md", receipt("16", "World")).aiUse).toBeNull();
    expect(parseReceipt("16.md", receipt("16", "World", "   ")).aiUse).toBeNull();
  });

  it("includes every receipt with an AI-use note, grouped by area, and flags receipts missing one", () => {
    const { markdown, missing } = compileAiUsage(root);
    expect(missing).toEqual(["16"]);
    expect(markdown).toContain("Scaffold written by an agent.\nHuman reviewed.");
    expect(markdown).toContain("x402 client written by an agent.");
    const core = markdown.indexOf("## Core");
    const hedera = markdown.indexOf("## Hedera");
    expect(core).toBeGreaterThan(-1);
    expect(hedera).toBeGreaterThan(core);
    expect(markdown.indexOf("### 15: x402 live")).toBeGreaterThan(hedera);
    expect(markdown.indexOf("### 24: Buyer")).toBeGreaterThan(markdown.indexOf("### 15: x402 live"));
    expect(markdown).toMatch(/## Receipts missing an AI-use note\n\n- 16: World onboarding/);
    expect(markdown).not.toContain("split proposal");
  });

  it("writes AI_USAGE.md from the command line and warns about missing notes", () => {
    const script = fileURLToPath(new URL("../ai-usage.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("16");
    expect(readFileSync(join(root, "AI_USAGE.md"), "utf8")).toBe(compileAiUsage(root).markdown);
  });
});
