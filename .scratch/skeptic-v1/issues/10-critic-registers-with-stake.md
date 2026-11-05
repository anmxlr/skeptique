# 10: Critic registers with a stake

**Status:** ready-for-agent
**Size:** M
**Tracks:** World (voucher check only; no Agent Pass call)
**Blocked by:** 08
**Read:** spec/03-interfaces.md (CriticRegistry, API critics routes), spec/02-mechanism.md §2, §6

**What to build:** A critic agent registers by staking at least the minimum with an attestor-signed voucher over (human nullifier, critic address, expiry, chain id), and appears on the Critics page with its stake. The contract enforces one critic per nullifier and rejects expired vouchers, bad signatures, stakes below the minimum, and any address that is a seller. The API indexes registrations and serves the critics list and detail.

In this ticket only the seed signs vouchers (attestor key from env). Ticket 16 makes the API issue them after World verification.

## Acceptance criteria
- [ ] Contract tests cover a valid registration and each revert named in spec/03: duplicate nullifier, expired voucher, bad signature, seller cannot critique, stake too low.
- [ ] Emitted events validate against 06's schemas.
- [ ] Done when: `pnpm --filter contracts test --grep "CriticRegistry"` and `pnpm e2e -t "critic registers"` pass.

Receipt: `board/done/10.md`
