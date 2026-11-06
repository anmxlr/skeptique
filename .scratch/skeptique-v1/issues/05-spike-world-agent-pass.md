# 05: Spike: World ID Agent Pass

**Status:** ready-for-agent
**Size:** M
**Tracks:** World
**Blocked by:** 01
**Read:** prd.md §4.1 (World), spec/03-interfaces.md (`/world/verify`)

**What to build:** Use the `/research` skill to learn, from auth.world.org docs only, how an app asks a person to verify with the official World ID Agent Pass, how a backend validates the result without trusting the client, what the event's mocked proofs look like, and how to produce denied, expired and cancelled results. Prove it by validating one success and one denial on a server.

The note `spec/notes/world.md` must record:
- the request/response flow
- the server-side validation call, and which secrets are client-side vs server-side
- whether a stable per-human identifier is returned (nullifier or equivalent) and, if not, which returned value the nullifier is derived from (the per-human id decision required by spec/01)
- how each failure case is produced

Keep raw feedback notes (time to first success, friction, missing docs) in `WORLD_FEEDBACK.md` as you go, continuing 01's timer.

## Acceptance criteria
- [ ] The note covers every item above, each sourced to a World doc URL, with the per-human id decision stated.
- [ ] Raw feedback notes exist with timestamps.
- [ ] Done when: the spike script validates one proof and rejects one denied case, both on the server.

Receipt: `board/done/05.md`
