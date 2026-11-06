#!/usr/bin/env node
// Conventional-commit check. Usage: `commit-msg.mjs <msg-file>` (git hook) or `commit-msg.mjs --range A..B` (CI).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
const CONVENTIONAL = new RegExp(`^(${TYPES.join("|")})(\\([\\w./,-]+\\))?!?: \\S`);
// Regular merges are required by the team workflow, so git's own merge/revert subjects pass.
const GIT_GENERATED = /^(Merge (branch|pull request|remote-tracking branch|commit) |Revert ")/;

/** @param {string} message @returns {{ ok: true } | { ok: false, reason: string }} */
export function checkCommitMessage(message) {
  const subject = message
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.startsWith("#"))
    ?.trim();
  if (!subject) return { ok: false, reason: "empty commit message" };
  if (CONVENTIONAL.test(subject) || GIT_GENERATED.test(subject)) return { ok: true };
  return {
    ok: false,
    reason: `"${subject}" is not a conventional commit: use <type>(<scope>)?: <summary>, type one of ${TYPES.join(", ")}`,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [flag, value] = process.argv.slice(2);
  const messages =
    flag === "--range"
      ? execFileSync("git", ["log", "--format=%B%x00", value], { encoding: "utf8" })
          .split("\0")
          .map((m) => m.trim())
          .filter(Boolean)
      : [readFileSync(flag, "utf8")];
  const failures = messages.map(checkCommitMessage).filter((r) => !r.ok);
  for (const failure of failures) console.error(`commit-msg: ${failure.reason}`);
  process.exit(failures.length > 0 ? 1 : 0);
}
