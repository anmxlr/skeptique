# 14: Walking skeleton 2: one round end to end

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 10, 11
**Read:** spec/03-interfaces.md (RoundManager, RoundView), spec/02-mechanism.md §3 steps 1-4

**What to build:** The walking skeleton closes: one service, one critic, one round, on the local chain, through every layer.

- Listing opens round 1, and anyone can open a new round while bounty remains and no round is open.
- The critic agent finds the open round, runs 11's tester, posts its evidence, and commits its score using 06's commitment formula.
- It keeps the salt and score so a restart between commit and reveal resumes cleanly, then reveals within the window.
- Anyone finalises after the reveal window; the median of the reveals is published.
- The marketplace shows the score, and the service page shows the round timeline (phase, who committed and revealed).

This ticket uses a plain median with `K_MIN` from config set low enough for one critic. Stake weighting, slashing and rewards arrive in 17 and 22; void rounds in 25.

## Acceptance criteria
- [ ] Contract tests: a wrong salt reverts; a reveal outside its window reverts; a double commit reverts; finalise before the reveal window ends reverts.
- [ ] Contract tests reproduce 06's commitment test vector exactly.
- [ ] A critic killed after commit and restarted still reveals.
- [ ] Emitted events validate against 06's schemas.
- [ ] Done when: `pnpm --filter contracts test --grep "RoundManager"` and `pnpm e2e -t "one round end to end"` pass.

Receipt: `board/done/14.md`
