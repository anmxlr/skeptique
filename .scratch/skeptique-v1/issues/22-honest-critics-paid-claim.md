# 22: Honest critics are paid and claim

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 17, 25
**Read:** spec/02-mechanism.md §3 steps 4-6, §7

**What to build:** Honesty pays. On finalisation, honest critics are reimbursed their claimed test cost (capped per critic) and share the remaining bounty plus all slashed stake, pro rata by stake. Slashed funds never go to the seller, and nothing goes to a critic who did not reveal. Rewards accrue and are pulled with `claim`. The critic dashboard shows stake, honest rounds, slashes and pending rewards, with a claim button.

## Acceptance criteria
- [ ] Property tests for spec/02 §7: conservation (payouts plus remaining equals inputs), no seller withdrawal path, no critic paid without revealing.
- [ ] Claiming twice pays once.
- [ ] Done when: `pnpm --filter contracts test --grep "reward|claim|invariant"` and `pnpm e2e -t "honest critics paid"` pass (honest critics claim, and the dashboard shows the balances drop to zero after the claim).

Receipt: `board/done/22.md`
