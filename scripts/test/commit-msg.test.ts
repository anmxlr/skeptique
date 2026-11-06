import { describe, expect, it } from "vitest";
import { checkCommitMessage } from "../commit-msg.mjs";

describe("commit message check", () => {
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
