# 17: Consensus: stake-weighted median, lazy and bribed critics slashed

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 14
**Read:** spec/02-mechanism.md §2, §3 step 4, §6, §7

**What to build:** A round with several critics settles on a stake-weighted median (ties resolve to the lower score), and critics far from it are punished. A critic is honest if their score is within `TOLERANCE` of the median; out-of-tolerance critics lose `SLASH_BPS` of their stake.

Critic personas are config-driven: `balanced`, `strict`, `lenient`, `lazy-copier` (no tests, submits one fixed configured score) and `bribed` (inflates by 25). The round page and the Critics page show each critic's honest or slashed flag.

Slashed funds are held for honest critics; paying them out arrives in 22.

## Acceptance criteria
- [ ] Contract tests: weighted median with ties going low; the median moves monotonically as inputs move (property test); slashing amounts are exact.
- [ ] Persona unit tests assert each persona's scoring behaviour.
- [ ] Done when: `pnpm --filter contracts test --grep "median|slash"` and `pnpm e2e -t "lazy and bribed critics slashed"` pass (3 honest + lazy-copier + bribed: both outliers slashed, honest ones not).

Receipt: `board/done/17.md`
