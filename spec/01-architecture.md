# 01 Architecture

## Components
```
 Seller ──lists service + pays fee──► [Hedera EVM] ServiceRegistry / CriticRegistry / RoundManager
 Critic agent (World-ID-backed) ──stake, commit, reveal, claim──►        │ events
   │  pays per test call via x402 (Hedera)                                ▼
   ▼                                                                 apps/api  (indexer + REST + SSE)
 Service endpoint (x402 paywalled, settles on Hedera)                    │            │
                                                                        ▼            ▼
 apps/relayer: on RoundFinalized ──► ENS (Sepolia): score text records   apps/web   apps/buyer
                              └────► HCS topic: audit log (rounds, spend)       (picks by score, pays via x402)
 apps/api /world/verify ◄── World ID Agent Pass ── critic onboarding (voucher signed by attestor key)
```

## Defaults chosen (veto any of these before building)
1. **Money on Hedera.** x402 payments, listing fees, stakes, bounty pool and rewards all live on Hedera testnet. Mechanism contracts are Solidity on Hedera EVM and use native HBAR for stake/bounty. The asset x402 settles in is decided by spike `S-01` (prefer HBAR if the facilitator supports it, otherwise USDC via HTS).
2. **ENS on Sepolia as the public name and score layer.** A Hedera contract cannot write to Sepolia, so `apps/relayer` holds the score-writer role and mirrors each finalised round, with the Hedera transaction ID in a text record so anyone can verify against Hedera. This is a known trust compromise; state it in the README.
3. **One shared attestor key** (held by `apps/api`) signs World-verified critic vouchers; the contract enforces one critic per human nullifier.
4. **Evidence off-chain, hash on-chain.** Critic evidence JSON is stored by `apps/api`; its hash is committed on-chain and posted to HCS.
5. **Services are team-built demos** (5 of them) so test suites are deterministic and the demo is controllable.

## Chains and ids to confirm in spikes
Hedera testnet EVM JSON-RPC and chain id, the x402 facilitator URL and supported asset (`S-01`); ENSv2 Sepolia contract addresses and role names (`S-02`); Agent Pass verification endpoints and whether it returns a stable per-human identifier (`S-03`). If Agent Pass has no stable per-human id, fallback is to derive the nullifier from whatever per-human value it does return; record the choice in `spec/notes/world.md`.

## Parallel lanes
0 setup/spikes, A contracts, B services and x402, C critic agent, D identity (World, ENS, HCS), E api/indexer/buyer, F web, I integration, P polish and submission. Lanes only touch their own directories, plus read-only use of `packages/shared`.
