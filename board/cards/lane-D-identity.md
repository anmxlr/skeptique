# Lane D: identity and publishing (World, ENS, HCS)

## D-1 · World Agent Pass verification backend
- deps: S-03, T-01
- size: M
- tracks: World
- read: spec/notes/world.md, spec/03-interfaces.md (`/world/verify`), spec/04-compliance-checklist.md (World)
- do: `POST /world/verify` in `apps/api`: validate the Agent Pass result server-side (never trust the client), derive the nullifier, sign the voucher (nullifier, critic address, expiry, chainid) with the attestor key; return 403 with a reason for unverified, expired, cancelled, or duplicate cases; secrets only from env.
- done when: tests cover success, expired, cancelled, unverified, duplicate, and tampered client payload.

## D-2 · ENS setup script (ENSv2, Sepolia)
- deps: S-02, H-01
- size: M
- tracks: ENS
- read: spec/notes/ens.md, spec/03-interfaces.md (ENS records)
- do: script to create `svc.skeptique.eth` and `critic.skeptique.eth` registries, Permissioned Resolver, and roles: seller edits only `url/description` on their subname; the relayer address alone may write `skeptique.*` keys. Provide `createServiceSubname` and `createCriticSubname` helpers.
- done when: script run on Sepolia prints created names; a test proves a seller write to `skeptique.score` reverts and a relayer write succeeds.

## D-3 · ENS publisher (relayer)
- deps: D-2, T-01
- size: M
- tracks: ENS, Hedera
- read: spec/03-interfaces.md, spec/02-mechanism.md §5
- do: `apps/relayer` watches `RoundFinalized` and writes `skeptique.score`, `skeptique.confidence`, `skeptique.round`, `skeptique.hedera.tx`; updates critic honesty/slash counts; idempotent and restart-safe.
- done when: replaying fixtures against a Sepolia fork or live resolver results in correct records and re-running makes no duplicate writes.

## D-4 · HCS audit publisher
- deps: T-01
- size: S
- tracks: Hedera
- read: spec/03-interfaces.md (HCS messages), spec/notes/hedera-x402.md
- do: create/read the audit topic, publish `round_finalized`, `agent_spend`, `critic_slashed` messages, expose a helper used by relayer and buyer.
- done when: a script publishes 3 messages and reads them back from a mirror node.

## D-5 · ENS reader library
- deps: S-02, T-01
- size: S
- tracks: ENS
- read: spec/notes/ens.md
- do: resolve service/critic subnames and read `skeptique.*` text records through the resolver (no hard-coded values); used by web and buyer.
- done when: unit test with a mocked resolver and one live Sepolia read pass.
