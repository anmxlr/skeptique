# 35: Critic runs unattended: watch, review, commit, reveal

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 14, 15, 18
**Read:** spec/02-mechanism.md §3 steps 2-3, §4; spec/03-interfaces.md (x402 client, API); spec/notes/hedera-x402.md

**What to build:** A long-running critic process, so a round gets reviewed with no human driving it. `pnpm --filter @skeptique/critic start` loads the deployment manifest and one critic key from env, then loops:
- It finds rounds in their commit phase (`RoundOpened` from the manifest's deployment block) that it has not committed to, and skips them while its stake is locked in another round.
- It runs the existing `runServiceReview` against the listed endpoint, with Hedera x402 payments (`createHederaPayAndCall`) and the OpenAI-compatible probe model from env, inside a per-round budget and a deadline that ends before `commitEnd`.
- It publishes the evidence to the API, then commits through `createRoundAgent` with its file state store.
- After `commitEnd` it reveals from saved state, including after a restart.

The existing pieces (`runner`, `probes`, `review`, `round-agent`, `round-chain`) stay as they are. This ticket only adds the loop and the entry point. A review that fails or runs out of time is logged and skipped; it never crashes the loop. A failed reveal is retried until `revealEnd`.

## Acceptance criteria
- [ ] Unit tests with a fake chain and a fake clock: commits once per round; skips while the stake is locked; reveals after a restart; a review that throws or misses its deadline leaves the loop running and makes no commit.
- [ ] No contract address, key or service URL is hard-coded; all come from the manifest, env and chain.
- [ ] Done when: `pnpm --filter @skeptique/critic test -t "daemon"` and `pnpm e2e -t "critic daemon reviews a round"` pass. In the e2e, the harness lists one service, three daemon processes commit and reveal on their own, and the test only advances time and finalises.

Receipt: `board/done/35.md`
