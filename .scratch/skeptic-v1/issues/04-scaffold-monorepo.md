# 04: Scaffold the monorepo

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** none (can start immediately)
**Read:** AGENTS.md (stack defaults, hard rules)

**What to build:** A pnpm workspace with an empty, green shell for every package named in AGENTS.md's stack defaults (contracts, shared, x402-client, api, web, critic, buyer, services, relayer), so every later ticket adds code to an existing package instead of creating one. Includes a root TypeScript config, Vitest in each TS package, Hardhat in contracts, lint and format, the MIT licence, a README stub, `.env.example` listing every variable the specs mention (commented, no values), an env check script, a CI workflow running lint and tests, and a commit-message check for conventional commits.

It also fixes the shared commands every ticket's "done when" uses: a per-package `test`, a root `e2e` (wired up by 07), and a root `test:live` that runs only tests needing real sponsor networks and skips cleanly when their keys are absent.

## Acceptance criteria
- [ ] Each package has one trivial passing test.
- [ ] The env check fails, naming the missing variables, when `.env` lacks any key from `.env.example`.
- [ ] A non-conventional commit message is rejected by the check.
- [ ] Done when: `pnpm install && pnpm -r build && pnpm -r test` passes on the skeleton.

Receipt: `board/done/04.md`
