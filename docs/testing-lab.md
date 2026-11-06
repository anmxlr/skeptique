# Testing lab: early evaluation workbench

The goal is to make the existing evaluation engine visible and usable before building a company-facing testing product. A useful first experiment is whether private probes distinguish a working service from one that memorizes the public benchmark.

## Run locally

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
# Terminal 1
pnpm lab:api

# Terminal 2
pnpm lab:web
```

Open http://127.0.0.1:3100/lab. Both processes bind to loopback. Ports 4318 and 3100 must be free. Stop either process with Ctrl+C. The web proxy is disabled unless `SKEPTIQUE_LAB_ENABLED=1`; the `lab:web` command sets it for this preview.

For a compiled preview without file watching, build with `pnpm --filter @skeptique/web build`, then use `pnpm lab:preview` instead of `pnpm lab:web`. Keep `pnpm lab:api` running in the other terminal.

1. Keep Unit converter and Suite gamer selected; run the baseline.
2. Both should pass all 12 public conversion checks. The unit converter should score 100 overall, the suite gamer 40, because its 11 probe checks fail.
3. Select the suite gamer's result, enable Failed only and expand a probe. Inspect input, expected result and actual output.
4. Export the run's JSON, including evidence and its canonical SHA-256 digest.
5. Try a budget of two calls: the evaluation stops before a third request. A partial run has an error, not a complete score.
6. Try the outage and slow-response drills. They intentionally cause HTTP 503 responses or exceed the 80 ms fixture call timeout. Reset to baseline before assessing normal quality.
7. Add CSV cleaner to explore parsing and Unicode failures. Its score measures a different task from conversion; scores across categories are not interchangeable.
8. Open What we have built for a recap of existing components and remaining work.

## What actually runs

- The existing converter, memorized-answer service and CSV-cleaning implementation, exposed through a loopback Fastify server.
- `runCriticSuite`, `runProbeEvaluation` and `attachProbeEvidence` from the existing critic package. They validate suites, isolate expectation evaluation in workers, enforce timeouts and compute the 40% public / 60% probe score.
- Twelve shared exact conversion cases for a fair converter/gamer comparison. These come from the suite-gamer public fixture. CSV uses its existing public suite, with the empty-output judge replaced by an exact empty-string assertion.
- Eleven recorded conversion probes and four explicit CSV fixtures. These are public source-code fixtures, not confidential or newly generated tests. The lab is under `scripts/demo` deliberately.
- Real HTTP requests to the local handlers. No request is an x402 payment. The shared budget counts attempted HTTP calls, including failed ones; it does not represent a stablecoin spend limit.
- Measured HTTP call latency (including JSON response parsing); evaluator startup and comparison overhead appear in total run duration. These local measurements do not predict production latency.
- At most one evaluation at a time and the last 20 reports in memory. There is no durable evidence database. Export results to keep them across restarts.

An evidence hash detects changes to the exported evidence; it does not establish truth, independence or onchain publication. Timings vary between runs, so hashes do too. Round 0 and the critic address in this lab are fixture identifiers, not chain records. Feedback is a simple rule-based suggestion for investigation, not an LLM diagnosis.

## Deliberate boundaries

The lab does not run commit/reveal, staking, slashing, rewards, World onboarding, ENS publication or live Hedera settlement. Existing UI flows and contract suites remain separate. It does not accept arbitrary customer URLs or uploaded agent code, and it is not a security boundary for untrusted code execution. There are no customer accounts, billing, model calls or RL model updates.

## Verification

```sh
pnpm lab:test
pnpm --filter @skeptique/web exec vitest run
pnpm --filter @skeptique/scripts exec tsc --noEmit
pnpm --filter @skeptique/web exec tsc --noEmit
```

Browser checks use real local service runs, inspect a failed probe, download evidence, enforce the budget, inject an outage, check mobile overflow and run axe accessibility checks. The browser config can start both servers, or reuse an already-running preview outside CI. It is separate from the existing mocked web suite.

## Next iterations

1. Validate the report with a potential company user: does it identify a reproducible failure they care enough to fix?
2. Add version-tagged runs and regression comparisons, then durable storage.
3. Introduce controlled external service onboarding with authentication, egress limits, isolation and explicit test contracts before accepting untrusted code or endpoints.
4. Add task-specific adversarial scenarios for purchasing agents: budget violations, malicious responses and failed-payment recovery. Keep objective task checks separate from subjective judges.
5. Connect finalized review evidence to the existing contract and sponsor flows after rewards and failed-round recovery work.
6. Explore RL-compatible episodes and rewards only after useful evaluation tasks exist. Keep training cases separate from independently managed evaluation cases. Companies pay for evaluation and feedback, never for favorable public scores.

AI assistance: OpenAI Codex implemented this early preview and its checks. This document does not mark any outstanding ticket complete.
