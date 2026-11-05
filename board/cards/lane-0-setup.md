# Lane 0: setup and spikes

## H-01 · HUMAN: accounts, keys, funding
- deps: none
- size: M
- who: human
- read: spec/01-architecture.md
- do: create 6 Hedera testnet ECDSA accounts (deployer, attestor, relayer, seller, buyer, critics pool) and fund via faucet; get Sepolia ETH; reserve `skeptic.eth` (or a name the ENS spike says works) on Sepolia ENSv2; register an app in the World Agent Pass portal (auth.world.org/portal); get an LLM API key; create the public GitHub repo `skeptic` (MIT); fill `.env` from `.env.example`. Start a timer for the World integration debrief at first touch.
- done when: `.env` has every key in `.env.example`, `pnpm env:check` (from T-00) is green.

## S-01 · Spike: Hedera x402
- deps: none
- size: M
- read: prd.md section 4.1 (Hedera)
- do: read docs.hedera.com/solutions/ai/x402 (how-it-works, pay-with-x402, merchant-integration, facilitators, exact-scheme). Run the official example end to end on testnet. Write `spec/notes/hedera-x402.md`: exact npm packages and versions, facilitator URL and which asset it settles (HBAR vs HTS/USDC), env vars, a 20-line working paywall and client snippet, how the tx id is returned, HashScan URL pattern, EVM JSON-RPC URL and chain id for contracts.
- done when: note exists and contains a transcript of one settled testnet payment with its tx id.

## S-02 · Spike: ENSv2 on Sepolia
- deps: none
- size: M
- read: prd.md section 4.1 (ENS)
- do: read docs.ens.domains/ensv2 (overview, permissioned-registry, permissioned-resolver, enhanced-access-control, contract-developers tutorial) and ENSIP-25/26. Write `spec/notes/ens.md`: Sepolia contract addresses, how to create a parent name and subname registry, how to deploy a Permissioned Resolver, the exact role names and how to grant "only this account may write records matching skeptic.*" and "seller may write only url/description", how to set and read a text record, agent text-record key names. Prove it with a script that writes and reads one record.
- done when: note exists and the script prints the record read back from a Sepolia resolver.

## S-03 · Spike: World ID Agent Pass
- deps: H-01
- size: M
- read: prd.md section 4.1 (World)
- do: read auth.world.org/docs. Write `spec/notes/world.md`: the verification request/response flow, how a backend validates a result, what the mocked proofs look like, whether a stable per-human identifier is returned (nullifier or equivalent), how to produce denied/expired cases. Record time-to-first-success and friction as you go in `WORLD_FEEDBACK.md` (raw notes).
- done when: a script obtains and server-side validates one proof and one denied case; note records the per-human id decision.

## T-00 · Scaffold monorepo
- deps: none
- size: S
- read: AGENTS.md (stack defaults)
- do: pnpm workspaces with the directory layout, root tsconfig, Vitest, eslint/prettier, MIT LICENSE, `.env.example` (every var the specs mention), `pnpm env:check` script, README stub, `.gitignore`.
- done when: `pnpm install && pnpm -r build && pnpm -r test` pass on the empty skeleton.

## T-01 · Shared package: types, schemas, ABI stubs, ranking constants
- deps: T-00
- size: M
- read: spec/03-interfaces.md, spec/02-mechanism.md §2,§4,§5
- do: implement all zod schemas and TS types, `canonicalHash(TestSuite)`, parameters from `RoundConfig`, empty ABI placeholder files, and hand-written event fixtures for every contract event in spec/03 under `packages/shared/fixtures/events/` (so other lanes can mock the chain immediately; A-6 later checks them against the real contracts). Freeze: tag `spec-frozen`.
- done when: `pnpm --filter shared test` passes, including hash determinism and fixture-schema tests.

## T-02 · Git hygiene and AI usage log
- deps: T-00
- size: S
- read: AGENTS.md
- do: commit-msg convention check, `scripts/compile-ai-usage.mjs` that builds `AI_USAGE.md` from `board/done/*.md`, a CI workflow running lint/test.
- done when: script runs against sample receipts and CI config validates.
