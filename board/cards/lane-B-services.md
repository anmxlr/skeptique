# Lane B: demo services and x402 (`apps/services/*`, `packages/x402-client`)

## B-1 · x402 paywall service template (Hedera)
- deps: T-01, S-01
- size: M
- tracks: Hedera
- read: spec/notes/hedera-x402.md, spec/03-interfaces.md (Service contract)
- do: reusable Fastify template: `POST /call` paywalled per `pricePerCall`, `GET /suite.json`, `GET /health`, configurable facilitator, logs settled tx ids. Calls from critics are tagged (header `x-skeptic-role: critic`) so popularity stats can exclude them.
- done when: integration test pays on testnet and returns the response plus tx id.

## B-2 · Service: unit-convert (good, deterministic)
- deps: B-1
- size: S
- read: spec/03-interfaces.md (TestSuite)
- do: unit conversion API (length/mass/temp/currency-free) with correct handling of edge cases.
- done when: `pnpm --filter svc-unit-convert test` passes against its own suite (>= 95% pass).

## B-3 · Service: json-extract (good, LLM-based)
- deps: B-1
- size: S
- read: spec/03-interfaces.md
- do: extracts requested fields from messy text via an LLM; schema-validated output.
- done when: its suite passes >= 85%.

## B-4 · Service: csv-clean (mediocre)
- deps: B-1
- size: S
- read: spec/03-interfaces.md
- do: CSV normaliser that is right on common cases and subtly wrong on quoted newlines and unicode.
- done when: suite pass rate lands between 60% and 80% (assert in test).

## B-5 · Service: suite-gamer (overfits the public suite)
- deps: B-1
- size: S
- read: spec/03-interfaces.md, spec/02-mechanism.md §4
- do: category-compatible service that hard-codes answers to the public suite inputs and returns plausible wrong answers otherwise. This is the service the popularity baseline will wrongly prefer.
- done when: public suite pass >= 95%, a held-out probe set pass <= 30% (assert in test).

## B-6 · Service: flaky-fx (intermittent)
- deps: B-1
- size: S
- read: spec/03-interfaces.md
- do: returns stale or erroring responses on a configurable fraction of calls (default 30%), seeded for reproducibility.
- done when: test asserts error/stale rate within 25-35% over 200 seeded calls.

## B-7 · Public test suites and probe seeds for all five services
- deps: B-2, B-3, B-4, B-5, B-6
- size: M
- read: spec/03-interfaces.md (TestSuite), spec/02-mechanism.md §4
- do: author `suite.json` for each service (>= 12 cases, mixed kinds), plus a held-out probe seed file used only by tests; compute and store specHash.
- done when: schema validation and hash tests pass; B-5 held-out assertion still holds.

## B-8 · x402 client library with spend hooks
- deps: T-01, S-01
- size: M
- tracks: Hedera
- read: spec/notes/hedera-x402.md, spec/03-interfaces.md (x402 client)
- do: `payAndCall` with `onBeforePay` hook, max price guard, retry policy, returns tx id; mockable signer for tests.
- done when: unit tests (hook deny prevents payment, max price enforced) and one testnet integration test pass.
