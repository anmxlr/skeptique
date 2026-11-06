# 06: Frozen shared package

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 04
**Read:** spec/03-interfaces.md (Shared types, Contracts events), spec/02-mechanism.md §2, §3 step 2, §4

**What to build:** The one place every lane takes its types from, so parallel slices agree on shapes without waiting for each other. It holds:
- every shared type in spec/03 as a validated schema plus its TS type
- a canonical suite hash (the `specHash` of a TestSuite)
- RoundConfig with the spec/02 §2 defaults, configurable at deploy
- the commitment hash from spec/02 §3 step 2, with a fixed test vector the contract tests will reuse
- a hand-written fixture for every contract event in spec/03, valid against the schemas

Tag `spec-frozen` when merged. Do not add ranking, ENS or x402 code here; those arrive with the slices that use them.

## Acceptance criteria
- [ ] The same suite with keys in a different order hashes identically; any change to a case changes the hash.
- [ ] Every event fixture validates against its schema; an invalid one is rejected.
- [ ] The commitment test vector is documented next to its inputs.
- [ ] Done when: `pnpm --filter shared test` passes.

Receipt: `board/done/06.md`
