# 32: WORLD_FEEDBACK and AI_USAGE

**Status:** ready-for-agent
**Size:** S
**Tracks:** World
**Blocked by:** 16
**Read:** spec/04-compliance-checklist.md (World, ETHGlobal general), AGENTS.md (hard rules)

**What to build:** The two disclosures sponsors and ETHGlobal ask for.
- **World debrief:** turn the raw World notes from 05 and 16 into the debrief, with time to first success, friction encountered, missing capability or docs, and the one improvement with the greatest impact.
- **AI-use compiler:** a script builds `AI_USAGE.md` from the receipts' AI-use notes, grouped by area. It can be re-run at submission time, and 34 runs it last.

## Acceptance criteria
- [ ] The debrief has all four required items, with real times.
- [ ] The compiler includes every receipt that has an AI-use note and flags receipts missing one.
- [ ] Done when: `pnpm --filter scripts test -t "ai usage"` passes against sample receipts and the debrief is committed.

Receipt: `board/done/32.md`
