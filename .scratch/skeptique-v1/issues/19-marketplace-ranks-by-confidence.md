# 19: Marketplace ranks by confidence-adjusted score

**Status:** ready-for-agent
**Size:** S
**Tracks:** none
**Blocked by:** 14
**Read:** spec/02-mechanism.md §5, spec/03-interfaces.md (ServiceView)

**What to build:** Buyers and the marketplace see services in a trustworthy order. Rank, confidence and decay follow spec/02 §5 exactly, as a pure function in the shared package. The API returns services sorted by rank, a service in probation (no finalised round yet) is excluded from the ranking, and the marketplace shows a confidence bar and a probation badge.

## Acceptance criteria
- [ ] Unit tests: a new service ranks below an equally scored established one; a stale service decays but never below the floor; ordering is stable for ties.
- [ ] Done when: `pnpm --filter shared test -t "rank"` and `pnpm e2e -t "marketplace ranks services"` pass.

Receipt: `board/done/19.md`
