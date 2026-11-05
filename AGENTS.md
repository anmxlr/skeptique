# AGENTS.md: rules for every agent working on skeptic

skeptic = an incentive layer that pays staked, human-backed critic agents to test and honestly rate agent-sold services, so buyer agents can pick good ones. Hackathon build (ETHGlobal Mumbai, from scratch, ~30h). Product context: `prd.md`.

## Work one card, nothing else
1. You were given one card ID (e.g. `A-3`). Find it in `board/cards/*.md`.
2. Read ONLY: this file, the card, and the spec sections the card's `read:` line lists. Do not read the rest of the repo "for context".
3. Work in a git worktree on branch `card/<ID>`. Commit small and often (conventional messages, e.g. `feat(contracts): commit-reveal`). Never squash, never force-push. ETHGlobal disqualifies repos with big single-commit dumps.
4. Finish when the card's `done when:` command(s) pass. Then write `board/done/<ID>.md` (what changed, command output tail, any spec deviation, AI-use note) and stop. Do not edit `board/BOARD.md` or other cards.

## Smart-zone rules (keep context small)
- Cards are sized S (<=45 min) or M (<=90 min). If your card is clearly bigger, stop and write `board/done/<ID>-SPLIT.md` proposing a split instead of pushing on.
- Prefer a fresh session per card. Stay in the first ~40% of your context window; if you are re-reading files or going in circles, stop and write a blocker note.
- Contract-first: build against `spec/03-interfaces.md` and `packages/shared`. Never depend on another lane's unmerged code; use the mocks/fixtures the card names.

## Hard rules
- Never invent sponsor APIs (Hedera x402, ENSv2, World ID Agent Pass). Read `spec/notes/*.md` written by spike cards `S-01..S-03`. If a note is missing, stop and report a blocker.
- No hard-coded demo values in product paths (ENS prize forbids it). Fixtures belong in tests and `scripts/seed`.
- No secrets in git. Use `.env` (gitignored) and `.env.example`.
- Any payment flow must work with no human approving, except the explicit approval-threshold feature.
- Public repo, open-source licence (MIT). Note AI use in your receipt; `AI_USAGE.md` is compiled from receipts.
- Do not add features, abstractions or comments beyond the card. Tests are the spec: write the failing test first when the card says so.

## Stack defaults
TypeScript monorepo (pnpm workspaces): `contracts/` (Hardhat + Solidity, Hedera EVM), `packages/shared`, `packages/x402-client`, `apps/api` (Fastify + SQLite), `apps/web` (Next.js), `apps/critic`, `apps/buyer`, `apps/services/*`, `apps/relayer`. Tests: Vitest; contracts: Hardhat tests. viem for chain access. LLM calls via env-configured provider.

## Agent skills

### Issue tracker

Local markdown: one file per ticket under `.scratch/<feature>/issues/NN-<slug>.md`; done = receipt in `board/done/`. See `spec/agents/issue-tracker.md`.

### Triage labels

Two labels only: `ready-for-agent` and `needs-human`. See `spec/agents/triage-labels.md`.

### Domain docs

Single-context, kept in `spec/` (`spec/GLOSSARY.md`, `spec/adr/`). See `spec/agents/domain.md`.
