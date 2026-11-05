# 25: Void round when too few critics reveal

**Status:** ready-for-agent
**Size:** S
**Tracks:** none
**Blocked by:** 22
**Read:** spec/02-mechanism.md §2, §3 step 4

**What to build:** A round where fewer than `K_MIN` critics reveal does not publish a score. Finalisation marks it void: no rewards are paid, only the critics who committed and did not reveal lose `NOREVEAL_SLASH_BPS` of stake, and the bounty rolls over to the next round. The service page shows the void round, and the marketplace keeps the previous score.

Thinned in planning (2026-11-06): the slot cap, withdrawal cooldown and repeat-finalise safety from the old A-3/A-4 scope are out unless time allows.

## Acceptance criteria
- [ ] Contract tests: void when reveals are below `K_MIN`; non-revealers slashed by exactly the no-reveal rate; the bounty is unchanged apart from slashed stake; finalising a void round again changes nothing.
- [ ] Done when: `pnpm --filter contracts test --grep "void"` and `pnpm e2e -t "void round"` pass.

Receipt: `board/done/25.md`
