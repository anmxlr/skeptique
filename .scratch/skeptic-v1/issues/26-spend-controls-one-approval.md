# 26: Spend controls and one over-threshold approval

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 23, 24
**Read:** prd.md §4.1 (Hedera extra points), spec/03-interfaces.md (x402 client hooks, HCS messages)

**What to build:** The buyer agent spends on its own, but within limits its owner sets on the Buyer page: a total budget, a per-merchant cap and a merchant allowlist, all enforced through `onBeforePay`. A payment above the approval threshold is the one place a human is asked. It waits in a pending queue (an API route) until someone approves or denies it in the UI, and is never paid otherwise. Every payment the buyer makes posts an `agent_spend` message to the audit topic with 23's helper, and the Audit page shows it.

## Acceptance criteria
- [ ] Tests: over budget is denied; over the per-merchant cap is denied; a merchant not on the allowlist is denied; below the threshold pays with no prompt.
- [ ] Above the threshold: approve pays, deny never pays, and an unanswered request never pays.
- [ ] Each payment emits exactly one `agent_spend` message (mocked HCS client).
- [ ] Done when: `pnpm --filter buyer test -t "spend"` and `pnpm e2e -t "over-threshold approval"` pass.

Receipt: `board/done/26.md`
