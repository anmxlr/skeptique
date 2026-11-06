# 13: Five demo services on the marketplace

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 08
**Read:** spec/03-interfaces.md (Service contract, TestSuite), spec/02-mechanism.md §4

**What to build:** The marketplace offers a realistic spread of quality, so the mechanism has something to tell apart. Three services join unit-convert:
- **csv-clean**: mediocre; right on common cases, subtly wrong on quoted newlines and unicode.
- **json-extract**: good; extracts requested fields from messy text via the env-configured LLM, with schema-validated output.
- **flaky-fx**: intermittent; stale or erroring on a configurable fraction of calls (default 30%), seeded so it is reproducible.

Each service, unit-convert included, gets a public suite of at least 12 mixed-kind cases with its `specHash` computed, plus a held-out probe seed file used only by tests. The seed lists all of them. The suite-gamer arrives in 18.

## Acceptance criteria
- [ ] unit-convert passes at least 95% of its suite; json-extract at least 85% (LLM stubbed in tests); csv-clean between 60% and 80%.
- [ ] flaky-fx's error or stale rate over 200 seeded calls falls between 25% and 35%.
- [ ] Every suite validates against the TestSuite schema and hashes to its stored `specHash`.
- [ ] Done when: `pnpm -r --filter "./apps/services/*" test` and `pnpm e2e -t "five services listed"` pass.

Receipt: `board/done/13.md`
