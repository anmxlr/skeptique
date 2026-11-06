# 16: World Agent Pass critic onboarding, with denied paths

**Status:** ready-for-agent
**Size:** M
**Tracks:** World
**Blocked by:** 05, 10
**Read:** spec/notes/world.md, spec/03-interfaces.md (`/world/verify`, CriticRegistry), spec/04-compliance-checklist.md (World)

**What to build:** A real person verifies with the official World ID Agent Pass before their critic agent may register, which is the protected action. The full journey runs on the Critics page:
1. The person starts verification.
2. They complete it.
3. The API validates the result on the server per spec/notes/world.md, derives the nullifier, and signs a voucher with the attestor key from env.
4. The critic stakes and registers with that voucher.

Every unsuccessful path is shown clearly and the registration never happens: unverified, expired, cancelled, a second critic from the same human, and a tampered client payload. Each gets a 403 with a reason. The client response is never treated as authorisation, and no secret reaches the browser.

## Acceptance criteria
- [ ] API tests cover success, expired, cancelled, unverified, duplicate human and tampered payload.
- [ ] On every failure, no registration transaction is sent (asserted in the e2e).
- [ ] A test fails if any server secret appears in the built client bundle.
- [ ] Done when: `pnpm --filter api test -t "world verify"` and `pnpm e2e -t "world onboarding"` pass (mocked proofs as the event provides).

Receipt: `board/done/16.md`
