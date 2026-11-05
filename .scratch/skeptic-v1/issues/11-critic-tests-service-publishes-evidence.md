# 11: Critic tests a service and publishes evidence

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 08
**Read:** spec/03-interfaces.md (TestSuite, Evidence, x402 client, API evidence routes), spec/02-mechanism.md §4

**What to build:** A critic agent fetches a listed service's public suite, refuses it if the hash does not match `specHash`, calls the service once per case through `payAndCall`, and checks `exact`, `schema` and `regex` cases locally. That gives a weighted `suitePass`, plus latency p50/p95 and an error rate. The critic posts the evidence to the API, which validates it and returns its hash, and the service page shows the evidence. Critic calls are tagged as critic calls so popularity can exclude them later.

`payAndCall` has the spec/03 shape, the `onBeforePay` hook and a max-price guard, but runs in local mode here: no payment and no tx id. Real Hedera settlement arrives in 15 behind the same interface.

## Acceptance criteria
- [ ] A suite with a mismatched hash is refused before any call.
- [ ] The weighted pass rate is correct for mixed passes, failures and weights.
- [ ] The API rejects evidence that fails the schema; stored evidence is fetchable by its hash.
- [ ] A denying `onBeforePay` hook stops the call.
- [ ] Done when: `pnpm --filter critic test` and `pnpm e2e -t "critic publishes evidence"` pass.

Receipt: `board/done/11.md`
