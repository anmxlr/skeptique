# 28: Demo seed, drills and rehearsal

**Status:** ready-for-agent
**Size:** S
**Tracks:** none
**Blocked by:** 27
**Read:** spec/05-demo-script.md (target 4:00)

**What to build:** The demo can be reset and rehearsed on demand.
- **Seed:** a re-runnable seed builds demo state: five services, critics including lazy-copier and bribed, score history, and popularity counts that favour the suite-gamer. All of it lives in the seed, not product code.
- **Windows:** short demo round windows (spec/02 §2 demo override).
- **Drills:** one command runs every failure drill the slices built: lazy and bribed slashed, void round, each World denial, a service outage mid-round.
- **Rehearsal:** a timed dry run of the script, with each beat retimed to fit 4:00 and the timings recorded.

## Acceptance criteria
- [ ] Running the seed twice produces the same state.
- [ ] Every drill asserts its outcome.
- [ ] The dry run finishes under 4:00; any slow beat is noted with a fix or a pre-recorded fallback.
- [ ] Done when: `pnpm seed && pnpm seed && pnpm drills` passes.

Receipt: `board/done/28.md`
