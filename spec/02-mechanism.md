# 02 Mechanism (frozen after ticket 06)

## 1. Actors
Seller (lists a service), Critic (staked, World-verified agent), Buyer agent (pays for calls), Relayer (mirrors results), Attestor (signs World vouchers).

## 2. Parameters (defaults, all configurable in `RoundConfig`)
| Name | Default | Meaning |
|---|---|---|
| `K_MIN` / `K_MAX` | 3 / 7 | critics that must reveal for a valid round / max slots |
| `S_MIN` | 5 HBAR | minimum critic stake |
| `COMMIT_SECS` / `REVEAL_SECS` | 600 / 300 (demo override 90 / 45) | phase windows |
| `TOLERANCE` | 10 | max score distance from median to count as honest |
| `SLASH_BPS` | 2000 | share of stake slashed from out-of-tolerance critics |
| `NOREVEAL_SLASH_BPS` | 1000 | slash for committing and not revealing |
| `MIN_LISTING_FEE` | 20 HBAR | funds the first round (K_MAX test-cost reimbursements plus rewards) |
| `WITHDRAW_COOLDOWN` | 300 s | critic must wait, and not be in an open round |

## 3. Round lifecycle
1. **Listing.** Seller calls `listService` with fee. Fee is locked in the service's bounty pool and is non-refundable. Round 1 opens (probation: service is hidden from rankings until it finalises).
2. **Commit.** Up to `K_MAX` registered critics commit `keccak256(abi.encode(score, salt, evidenceHash, critic))`. Each critic has paid x402 test calls to the service; the claimed cost is in the revealed evidence.
3. **Reveal.** Critics reveal `(score, salt, evidenceHash)`. Commitment must match.
4. **Finalise** (anyone, after reveal window). If reveals < `K_MIN`: round is void, no rewards, only non-revealers are slashed, bounty rolls to the next round. Otherwise:
   - `median` = stake-weighted median of revealed scores (ties resolve to the lower score).
   - A critic is **honest** if `|score - median| <= TOLERANCE`.
   - Honest critics: reimbursed their claimed test cost (capped at `cost_cap` per critic) and share the remaining bounty plus the slashed stake pro rata by stake.
   - Out-of-tolerance critics lose `SLASH_BPS` of stake; non-revealers lose `NOREVEAL_SLASH_BPS` and forfeit rewards. Slashed funds go to honest critics only (never to the seller).
5. **Claim.** Rewards are pull-based (`claim`).
6. Leftover bounty stays in the pool for re-review rounds. The seller can top up; the seller can never withdraw.

## 4. Score and what a critic does
`score = round(0.4 * suitePass + 0.6 * probePass)` where both are weighted pass rates 0..100.
- `suitePass`: the seller-published public test suite (hash fixed at listing).
- `probePass`: adversarial cases the critic generates itself (this is the "critical analysis"; it catches services that overfit the public suite). Probe cases and results go into the evidence.
Evidence also records latency p50/p95, x402 tx ids paid, error rate. Only the scalar score enters consensus in v1.

## 5. Ranking for buyers
`confidence = min(1, nReveals / 5) * decay(age)` where `decay = 0.5 ^ (ageDays / 7)` floored at 0.3.
`rank = median - 15 * (1 - confidence)`. New or stale services rank lower. All constants tunable; ranking lives in `apps/api` + `packages/shared` and is unit-tested (ticket 19).

## 6. Anti-gaming properties and honest limits
Defended: copying (commit-reveal), sybil critics per human (World nullifier), lazy critics (slashed if far from median), seller steering (fee locked, no critic choice, no early scores), suite overfitting (private probes), self-review (seller address cannot register as a critic).
**Not defended (say so in README):** a majority of stake colluding; a seller bribing real humans; all critics sharing one wrong belief (consensus is not truth); nondeterministic services can punish honest critics; seller-critic payment circularity can inflate usage numbers (we exclude critic test calls from popularity stats).

## 7. Invariants (property tests, tickets 17 and 22)
Conservation (sum of payouts + remaining = inputs), no seller withdrawal path, median monotonic in inputs, no critic paid without revealing, a critic with a used nullifier cannot register twice, finalise is idempotent-safe.
