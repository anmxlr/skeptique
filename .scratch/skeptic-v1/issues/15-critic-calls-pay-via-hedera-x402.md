# 15: Critic test calls pay via Hedera x402

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 01, 02, 11
**Read:** spec/notes/hedera-x402.md, spec/03-interfaces.md (Service contract, x402 client, Evidence)

**What to build:** Critics pay for every test call with real x402 payments that settle on Hedera testnet. Each demo service's call route is paywalled at its listed price through the facilitator named in spec/notes/hedera-x402.md, and logs settled tx ids. `payAndCall` gains a Hedera mode behind the interface 11 built: it pays without any human prompt, returns the tx id, and refuses anything above `maxPrice`. Evidence records the tx ids, and the service page links each one to HashScan using the note's URL pattern.

Use only the packages and calls in the note. If something needed is missing, stop and write a blocker.

## Acceptance criteria
- [ ] A denying `onBeforePay` hook prevents any payment.
- [ ] A price above `maxPrice` is refused before paying.
- [ ] Local mode still works, so the local e2e tests stay green without keys.
- [ ] HashScan links are built from tx ids, never typed in.
- [ ] Done when: `pnpm --filter x402-client test` and `pnpm test:live -t "critic pays via x402"` (one real settled payment, tx id printed) pass.

Receipt: `board/done/15.md`
