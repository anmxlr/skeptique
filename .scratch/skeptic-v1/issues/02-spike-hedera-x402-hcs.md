# 02: Spike: Hedera x402 and HCS

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** none (start reading now; the live payment step uses 01's funded keys, so pause there if 01 is not done)
**Read:** prd.md §4.1 (Hedera), spec/01-architecture.md (chains and ids)

**What to build:** Use the `/research` skill to find out, from Hedera's own docs and official examples only, how an x402-paywalled endpoint settles on Hedera testnet and how an HCS topic is written and read. Then prove it by settling one real payment and posting one real HCS message. Every later Hedera ticket builds from this note instead of guessing.

The note `spec/notes/hedera-x402.md` must record:
- exact npm packages and versions
- which facilitator (official, a listed one, or self-run) and its URL
- which asset it settles (HBAR, or an HTS token such as USDC)
- env vars
- a short working paywall snippet and client snippet
- how the settled tx id is returned, and the HashScan URL pattern
- the Hedera EVM JSON-RPC URL and chain id
- how HBAR value is denominated inside a Solidity contract on Hedera versus what a JSON-RPC client sends, so stake and fee constants are set in the right unit
- creating an HCS topic, submitting a message, and reading it back from the mirror node

## Acceptance criteria
- [ ] The note covers every item above, each sourced to a Hedera doc or official repo URL.
- [ ] The note contains a transcript of one settled testnet x402 payment with its tx id and HashScan link.
- [ ] The note contains one HCS message posted and read back from the mirror node.
- [ ] Where the docs disagree with spec/03, the note says so and proposes the smallest spec change (do not edit spec/03).
- [ ] Done when: the spike script (plain node; the scaffold may not exist yet) prints a settled tx id and the read-back HCS message.

Receipt: `board/done/02.md`
