# 36: Round keeper finalises rounds and opens re-review rounds

**Status:** ready-for-agent
**Size:** S
**Tracks:** Hedera
**Blocked by:** 25
**Read:** spec/02-mechanism.md §3 steps 4 and 6

**What to build:** Rounds close and restart without anyone calling the contract by hand. `pnpm --filter @skeptique/relayer keeper` (or a `keeper` entry point in whichever app the agent finds simplest) loads the deployment manifest and a funded caller key from env, then loops:
- It calls `finalize` on every round past `revealEnd` that is not finalised. Since ticket 25, too-few-reveal rounds finalise as void.
- For each service with bounty left and no open round, it calls `openRound`. It opens at most as many rounds at once as the critic pool can fill to `K_MIN` (registered critics with unlocked stake divided by `K_MIN`, at least 1), so with 3 critics and `K_MIN` 3 only one round is ever open at a time.

Every transaction is checked for a successful receipt. A revert such as `AlreadyFinalized` or `RoundAlreadyOpen` (someone else got there first) is logged and skipped; it never stops the loop.

## Acceptance criteria
- [ ] Tests on the local stack: a round past its reveal window is finalised once; a void round is finalised and its service reopened; with 3 critics and `K_MIN` 3, five listed services are reviewed one round at a time and none is left stuck.
- [ ] Done when: `pnpm e2e -t "keeper"` passes.

Receipt: `board/done/36.md`
