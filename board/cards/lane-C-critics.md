# Lane C: critic agent (`apps/critic`)

## C-1 · Suite runner and scoring
- deps: T-01, B-8
- size: M
- read: spec/03-interfaces.md (TestSuite, Evidence), spec/02-mechanism.md §4
- do: fetch a suite, verify hash equals `specHash`, run cases through `payAndCall`, evaluate `exact/schema/regex` locally, compute weighted `suitePass`, collect latency and tx ids. Use a mocked x402 client in tests.
- done when: unit tests pass against a local fake service.

## C-2 · Probe generator and LLM judge
- deps: T-01
- size: M
- read: spec/02-mechanism.md §4, spec/03-interfaces.md (TestCase)
- do: given a service description and the public suite, generate adversarial probe cases (edge cases and inputs unlike the public ones); `judge` evaluator for `kind:'judge'` rubrics with a fixed-temperature prompt. LLM provider is env-configured; add a deterministic stub for tests.
- done when: tests pass with the stub; a recorded-fixture test shows probes differ from suite inputs.

## C-3 · Evidence builder and store client
- deps: C-1, C-2
- size: S
- read: spec/03-interfaces.md (Evidence, API)
- do: assemble `Evidence`, compute hash, `POST /evidence`, `score = round(0.7*suitePass + 0.3*probePass)`.
- done when: tests pass against a mock API.

## C-4 · Commit-reveal chain client and state machine
- deps: T-01
- size: M
- read: spec/03-interfaces.md (RoundManager), spec/02-mechanism.md §3
- do: persistent per-round state (salt, score, evidence hash) so a crash between commit and reveal can resume; commit, reveal, claim via viem. Use event fixtures for tests.
- done when: restart-between-phases test passes; commitment hash matches the contract's formula (cross-check with the A-3 test vector in `packages/shared`).

## C-5 · Critic agent loop
- deps: C-3, C-4
- size: M
- read: spec/02-mechanism.md §3,§6
- do: discover open rounds, check stake and World registration, run suite and probes, commit, wait, reveal, claim; respects a per-critic spend cap; structured logs for the UI.
- done when: local end-to-end test against hardhat plus fake service: critic completes one round and claims.

## C-6 · Critic personas
- deps: C-5
- size: S
- read: spec/05-demo-script.md
- do: config-driven personas: `strict`, `lenient`, `balanced`, `lazy-copier` (no probes, copies a fixed score), `bribed` (inflates by +25). Used for the slashing demo.
- done when: persona unit tests assert their score behaviour; lazy and bribed fall outside tolerance in the I-1 scenario.
