# 07: Local stack harness and web shell

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 04
**Read:** spec/01-architecture.md (components), spec/05-demo-script.md

**What to build:** The test seam every slice's end-to-end test uses. One call boots an in-process local chain, deploys whatever contracts the contracts package exports for deployment (none yet), starts the API against that chain and any listed demo services, then tears everything down. It is wired to the root `pnpm e2e` command.

Also the web app's shell: layout, navigation (Marketplace, Critics, Sell, Buyer, Audit) with empty placeholder pages, light and dark themes, responsive, and a typed API client the pages will use.

## Acceptance criteria
- [ ] An e2e test boots the stack, hits the API health route, and tears down with no leftover processes or ports.
- [ ] The web shell renders every nav page at 375px and 1280px.
- [ ] Done when: `pnpm e2e -t "harness boots"` and `pnpm --filter web test` pass.

Receipt: `board/done/07.md`
