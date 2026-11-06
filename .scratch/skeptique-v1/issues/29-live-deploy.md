# 29: Live deploy

**Status:** ready-for-agent
**Size:** M
**Tracks:** ENS
**Blocked by:** 27
**Read:** spec/04-compliance-checklist.md (ENS live demo), spec/01-architecture.md

**What to build:** Judges can open a public link and see the real marketplace. The web app and API are deployed to a public host with env configured (no secrets in the repo or client). The live marketplace reads scores through the ENS resolver and links transactions to HashScan.

## Acceptance criteria
- [ ] The public URL loads the marketplace with live data; the health route is green.
- [ ] A score shown on the live page matches a resolver read made at the same time.
- [ ] Done when: `pnpm test:live -t "live deploy"` passes against the public URL (health check plus one ENS-backed value).

Receipt: `board/done/29.md`
