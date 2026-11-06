# 37: Demo services run standalone, report paid calls, buyer pays on Hedera

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 13, 15, 24
**Read:** spec/03-interfaces.md (Service contract, x402 client, API `POST /calls`); spec/notes/hedera-x402.md

**What to build:** The pieces the buyer demo needs outside the test harness.
- Each of the five services gets a `start` script that serves it with the existing `startService` and `paywallFromEnv`. Host and port come from env, defaulting to `0.0.0.0` and `PORT`, so they can be deployed.
- After a settled x402 payment, the paywall's `onSettled` posts `POST /calls { serviceId, payer }` to `API_URL`. The payer comes from the settlement and the service id from env. Today it only logs, so on a real run every `popularityCalls` is 0 and the popularity buyer picks the lowest id. If the report fails, the service logs it and still answers the buyer.
- The buyer CLI uses `createHederaPayAndCall` with the buyer account from env when the x402 env is present, and local mode otherwise.

## Acceptance criteria
- [ ] Test: one settled payment on a service causes exactly one `POST /calls` with that service's id and the payer; a failed report doesn't fail the paid call.
- [ ] Test: the buyer CLI chooses Hedera mode when the x402 env is set and local mode when it isn't.
- [ ] Done when: `pnpm --filter @skeptique/services test -t "reports paid calls"` and `pnpm --filter @skeptique/buyer test -t "hedera mode"` pass.

Receipt: `board/done/37.md`
