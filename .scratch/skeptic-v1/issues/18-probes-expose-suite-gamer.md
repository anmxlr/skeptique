# 18: Probes expose the suite-gamer

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 14
**Read:** spec/02-mechanism.md §4 (score weights changed 2026-11-06, see spec/CHANGELOG.md), spec/03-interfaces.md (TestCase, Evidence)

**What to build:** A service that overfits its public suite can no longer score well.

- **suite-gamer service:** shares a category with a good service, hard-codes answers to its public suite inputs, and returns plausible wrong answers otherwise.
- **Probes:** from the service description and public suite, critics generate their own adversarial probe cases (edge cases and inputs unlike the public ones) with the env-configured LLM, and run them.
- **Judging:** cases of kind `judge` are scored by an LLM judge at fixed temperature.
- **Score:** `round(0.4 * suitePass + 0.6 * probePass)`, recorded with the probes in the evidence.
- **UI:** the service page splits suite and probe results.

Tests use a deterministic LLM stub.

## Acceptance criteria
- [ ] The suite-gamer passes at least 95% of its public suite and at most 30% of a held-out probe set.
- [ ] A recorded-fixture test shows generated probes differ from the public suite inputs.
- [ ] Done when: `pnpm --filter critic test -t "probes"` and `pnpm e2e -t "suite-gamer exposed"` pass (the gamer's round median is at least 25 points below the good service's).

Receipt: `board/done/18.md`
