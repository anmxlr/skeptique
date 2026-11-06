# 08: Walking skeleton 1: a listed service shows on the marketplace

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 06, 07
**Read:** spec/03-interfaces.md (ServiceRegistry, API, Service contract, TestSuite, ServiceView), spec/02-mechanism.md §3 steps 1 and 6

**What to build:** The first thin cut through every layer, on the local chain. A seller lists one real demo service, unit-convert (a correct, deterministic unit-conversion API with a small public suite), and it appears on the marketplace.

- The listing fee must meet the minimum, is locked as the service's bounty, and the seller has no way to withdraw it; the seller can top up.
- The API indexes the listing and serves the service list, its detail and its public suite, refusing a suite that does not hash to the listed `specHash`.
- The marketplace page shows the service in probation, with its price and bounty.
- The seed script lists it; no product path hard-codes it.

## Acceptance criteria
- [ ] Contract tests: a fee below the minimum reverts; a top-up adds to the bounty; no call lets the seller withdraw.
- [ ] Emitted events validate against 06's schemas and match the fixtures' shapes.
- [ ] The suite route rejects a suite whose hash differs from `specHash`.
- [ ] The marketplace page covers empty, loading and error states.
- [ ] Done when: `pnpm --filter contracts test -- --grep "ServiceRegistry"` and `pnpm e2e -t "seller lists a service"` pass (the seed lists it, the API returns it with a matching hash, the page renders it).

Receipt: `board/done/08.md`
