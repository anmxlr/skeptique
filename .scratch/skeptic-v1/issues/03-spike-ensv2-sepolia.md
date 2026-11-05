# 03: Spike: ENSv2 on Sepolia

**Status:** ready-for-agent
**Size:** M
**Tracks:** ENS
**Blocked by:** none (start reading now; the live write uses 01's Sepolia ETH and parent name, so pause there if 01 is not done)
**Read:** prd.md §4.1 (ENS), spec/03-interfaces.md (ENS records)

**What to build:** Use the `/research` skill to find out, from ENS's own ENSv2 docs and ENSIP-25/26 only, how to run skeptic's namespace on Sepolia: a parent name, subname registries for services and critics, a Permissioned Resolver, and Enhanced Access Control roles such that only one account (the relayer) may write `skeptic.*` text records and a seller may write only `url` and `description` on their own subname. Prove it by writing and reading one record.

The note `spec/notes/ens.md` must record:
- Sepolia contract addresses
- how to create the parent name and the subname registries
- how to deploy a Permissioned Resolver
- exact role names and calls for both permission rules above
- how to set and read a text record
- ENSIP-26 agent text-record key names, and whether spec/03's `skeptic.*` keys should map to them

## Acceptance criteria
- [ ] The note covers every item above, each sourced to an ENS doc URL.
- [ ] If spec/03's record names or role model are not possible in ENSv2, the note says so and proposes the smallest change (do not edit spec/03).
- [ ] Done when: the spike script prints a text record read back from a Sepolia resolver.

Receipt: `board/done/03.md`
