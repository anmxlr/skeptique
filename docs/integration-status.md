# Integration status and follow-up workflow

The user authorized merging tickets 06, 11, 13, 14, 17, 18, 19, 28 and 31 as a shared development baseline on 2026-11-06. This changes the earlier draft-only merge plan. Merging does not mark outstanding ticket acceptance criteria complete, authorize production deployment or establish live sponsor integration.

## What is assembled

- Ticket 04's pnpm workspace, existing API/web shells and CI are retained.
- Shared schemas/hashing/consensus/ranking are exported through `@skeptic/shared`.
- Actual package dependencies are declared; the committed lockfile replaces the disposable review harness for workspace checks.
- Real service implementations replace scaffold package-name placeholders. Local HTTP tests cover evidence publication, adversarial testing and buyer selection.
- Hardhat retains its viem support and adds ethers support for the reviewed contract tests. Local settlement consumes the HTTP run's evidence; no remote deployment is performed.
- Local fixture adapters remain in tests and demo scripts. They are not installed as production sponsor implementations.

## Remaining ownership boundaries

| Area | Required follow-up |
| --- | --- |
| Service registry / RoundManager | Confirm real service existence and a funded review bounty before opening rounds. |
| Critic registry / RoundManager | Agree the `slashStake` interface, authorization, custody and transfer semantics with Dev 1. Lock stake across concurrent rounds; current snapshots do not prevent reuse. |
| Settlement lifecycle | Integrate owning tickets for non-reveal penalties, void finalization, reimbursement, rewards and claims. Mock registry counters do not prove financial transfers. |
| Critic runtime | Wire the suite runner, private probes, evidence publisher and round agent into orchestration; configure real inference and total budgets against the remaining commit window. |
| API / web | Wire actual indexer data, persistent evidence storage and rendered evidence/round views. Local ranking snapshots and memory storage are explicit test adapters. |
| Sponsor integrations / ticket 27 | Supply real Hedera x402/HashScan, ENSv2 resolver and HCS evidence plus unattended buyer payment. Disclose fake World event identities. |
| Demo / acceptance | Run exact owning-ticket acceptance commands and the full integrated rehearsal; local fixture drills are insufficient for those gates. Obtain Dev 1 review before live financial use. |

## Updating after the merge

1. Sync a clean checkout of `main` using `gh repo sync`.
2. Create a new follow-up branch/worktree from current `main`, one integration concern per PR. A merged PR cannot receive new review changes; its preserved branch/history remains available for reference.
3. If a teammate already has an older feature branch, merge current `main` into it with a normal merge. Resolve overlapping files against the public shared types and agreed interfaces, retaining their implementation and the regression coverage. Do not squash or force-push shared history.
4. Replace the relevant adapter at its integration boundary and add a meaningful regression using the real dependency. Keep offline unit fixtures usable; put network-dependent checks in the live test suite.
5. Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm -r build`, `pnpm -r test` and `pnpm e2e`. If dependencies change, update manifests and the lockfile together, then rerun the frozen install. Run contract/seed/drill/live checks appropriate to the touched boundary.
6. Record actual evidence and limitations in the PR. Add completion receipts only after the owning ticket's acceptance criteria pass.

Future work can use normal merges and follow-up PRs. Conflicts and interface changes remain possible; this workflow preserves history and makes them reviewable rather than promising conflict-free integration.

## Final verification

Verified from a fresh detached worktree at code commit `02870a7`, with no disposable harness links and no sponsor credentials:

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed using committed manifests/lockfile. |
| `pnpm lint` | Passed; 103 existing nonblocking warnings, primarily explicit-any and non-null assertions in tests. No rules disabled. |
| `pnpm -r build` | Passed all packages, Next.js production build, Solidity compilation and contract/application TypeScript checks. |
| `pnpm -r test` | 123 Vitest tests and 11 Hardhat tests passed. |
| `pnpm e2e` | Four real-local-HTTP review-flow tests passed, producing six hashed review documents. |
| `pnpm settle:local` | Independently verified those six documents; two three-critic local-chain rounds finalized at medians 100 and 40. Persisted reveal recovery passed. |
| Two `pnpm seed` runs and `pnpm drills` | Passed; four fixture failure drills. Full integrated rehearsal remains pending. |
| `node scripts/commit-msg.mjs --range main..HEAD` | Passed; genuine merge commits preserve their history while ordinary commits remain checked. A regression confirms malformed ordinary commits still fail. |

The existing GitHub CI workflow now also runs the HTTP flow, consumes its evidence in local settlement, and runs repeatable seeding/fixture drills. It requires no sponsor secrets. CI additionally checks frozen installation, commit messages, lint, build and unit/contract tests on Linux/Node 20; local verification used macOS/Node 22. No live sponsor-network test is represented as passing.

The remaining merge changes after `02870a7` are documentation and this CI wiring. PRs are merged with normal merge commits from the top of the stack into their parents, then into `main`; branches are retained and no history is rewritten. Follow-up commits belong in new PRs. The earlier [review record](dev2-review.md) retains the pre-workspace defect findings and CPU measurements.
