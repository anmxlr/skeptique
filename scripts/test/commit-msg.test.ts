import { describe, expect, it } from "vitest";
import { checkCommitMessage } from "../commit-msg.mjs";

describe("commit message check", () => {
  it("checks ordinary commits while preserving custom merge history", () => {
    const directory = mkdtempSync(join(tmpdir(), "skeptique-commit-check-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
    const commit = (name: string, message: string) => {
      writeFileSync(join(directory, name), name);
      git("add", name);
      git("commit", "-m", message);
    };
    const script = fileURLToPath(new URL("../commit-msg.mjs", import.meta.url));
    const check = () =>
      spawnSync(process.execPath, [script, "--range", "main~1..HEAD"], { cwd: directory, encoding: "utf8" });
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Local Test");
      git("config", "user.email", "test@example.invalid");
      commit("initial", "chore: initial");
      git("checkout", "-b", "feature");
      commit("feature", "feat: feature");
      git("checkout", "main");
      commit("other", "chore: other");
      git("merge", "--no-ff", "feature", "-m", "merge: preserve reviewed history");
      expect(check().status).toBe(0);
      commit("invalid", "added stuff");
      const invalid = check();
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain("added stuff");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([
    "feat(contracts): commit-reveal",
    "fix: handle empty suite",
    "docs(board): publish tickets\n\nbody\n\nCo-Authored-By: someone",
    "feat(api)!: change verify body",
    "Merge branch 'card/04'",
  ])("accepts %j", (message) => {
    expect(checkCommitMessage(message)).toEqual({ ok: true });
  });

  it.each(["added stuff", "Feat: capitalised type", "feat:missing space", "wip(api): thing", ""])(
    "rejects %j",
    (message) => {
      expect(checkCommitMessage(message).ok).toBe(false);
    },
  );

  it("ignores git comment lines", () => {
    expect(checkCommitMessage("# Please enter the commit message\nchore: tidy")).toEqual({ ok: true });
  });
});

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
