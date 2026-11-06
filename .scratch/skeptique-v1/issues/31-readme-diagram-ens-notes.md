# 31: README, architecture diagram and ENS notes

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera, ENS, World
**Blocked by:** 27
**Read:** spec/04-compliance-checklist.md, prd.md §4.1, spec/02-mechanism.md §6

**What to build:** A judge or a stranger can understand, run and verify skeptique from the repo alone. The README covers:
- setup from a fresh clone
- an architecture diagram (source committed and rendered)
- the payment flow, with the Hedera tx id of a real settled payment from 27's evidence
- how each sponsor is used, and why ENSv2 is central rather than cosmetic
- the relayer trust compromise (spec/01 default 2)
- honest limits (spec/02 §6)
- disclosure of third-party libraries
- how skeptique relates to ERC-8004 and HCS-14 reputation

A short ENS showcase note lists each ENSv2 feature used and where.

## Acceptance criteria
- [ ] Every Hedera and ENS line of spec/04 that names the README is satisfied, with a link to the evidence.
- [ ] Done when: a fresh-clone check (`pnpm install && pnpm -r build && pnpm e2e`, following only the README) passes.

Receipt: `board/done/31.md`
