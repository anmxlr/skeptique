# 24: Buyer agent picks by score and pays with no human approving

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 18, 19
**Read:** spec/03-interfaces.md (x402 client, ServiceView), spec/02-mechanism.md §5, spec/05-demo-script.md (opening and buyer beats)

**What to build:** The payoff for buyers. Given a task and a category, the skeptique buyer agent lists candidates, ranks them by 19's rank, explains its pick in plain language, pays through `payAndCall` with no human prompt, and returns the result with its tx id.

A popularity-only buyer ranks by paid-call counts instead. Services report paid calls to the API, and calls tagged as critic calls are excluded. With seeded popularity favouring the suite-gamer, it picks the gamer.

The Buyer page runs both side by side, showing choices, explanations, results and HashScan links when a tx id exists.

## Acceptance criteria
- [ ] Critic-tagged calls never count toward popularity.
- [ ] No step of the default payment path waits for a human.
- [ ] Done when: `pnpm --filter buyer test` and `pnpm e2e -t "buyer picks by score"` pass (the skeptique buyer picks the good service, the popularity buyer picks the gamer).

Receipt: `board/done/24.md`
