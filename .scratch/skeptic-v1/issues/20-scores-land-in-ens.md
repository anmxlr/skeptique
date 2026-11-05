# 20: Scores land in ENS; the UI reads the resolver

**Status:** ready-for-agent
**Size:** M
**Tracks:** ENS
**Blocked by:** 12, 14
**Read:** spec/notes/ens.md, spec/03-interfaces.md (ENS records), spec/02-mechanism.md §5

**What to build:** Each finalised score becomes public in ENS, written only by the role-limited relayer.

- On round finalisation the relayer writes `skeptic.score`, `skeptic.confidence`, `skeptic.round` and `skeptic.hedera.tx` on the service subname, using ENSIP-26 key names where spec/notes/ens.md says to.
- When a critic registers, the relayer creates its critic subname and keeps its stake, honest-round and slash records current.
- Writes are idempotent and safe to restart.
- The marketplace and service page read the score through the resolver, and show the resolver query they used, so nothing on screen is hard-coded.

## Acceptance criteria
- [ ] Replaying the same finalisation twice makes no second write.
- [ ] The UI renders the value from the resolver even when the API returns a different (stale) value.
- [ ] Done when: `pnpm --filter relayer test -t "scores"` and `pnpm test:live -t "score written to ENS"` (Sepolia read-back) pass.

Receipt: `board/done/20.md`
