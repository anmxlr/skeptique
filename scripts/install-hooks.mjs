// Points git at .githooks so the commit-msg check runs locally. No-op outside a git checkout.
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
} catch {
  // not a git checkout (e.g. a deploy tarball): nothing to install
}
