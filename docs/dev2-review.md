# Dev 2 review and local verification

Reviewed tickets 06, 11, 13, 14, 17, 18, 19, 28 and 31 with three parallel reviewers, using `karpathy-guidelines`. Fixes remain in one draft PR per ticket. Dependency updates use normal merges; main is unchanged.

## Confirmed defects fixed

| Area | Fix and regression coverage |
| --- | --- |
| Shared hashing and evidence | Reject values that JSON would drop or change; preserve validated raw service outputs; expose ranking and consensus through the package entrypoint. |
| Critic/client | Preserve original service inputs; keep critic classification internal; stop on payment-policy denial; bound stalled quotes, HTTP calls, judging and total review time; validate identity and expectations before spending. |
| Local evaluation | Compile and evaluate seller-supplied regex/schema checks in one worker per suite. A catastrophic pattern is terminated instead of blocking the critic's event loop. Async schemas are rejected before service calls. |
| Evidence publication | Publish schema-validated evidence and require the returned hash to equal its canonical SHA-256 digest. |
| Service implementations | Reject inherited unit names and overflow; handle random seed zero and nonfinite configuration; cancel stalled extraction; require real configured service origins; replace public expectations that no successful handler response could satisfy. |
| Probe scoring | Reject duplicate probes and malformed expectations before calls; stop on failed generation/judging; retain raw output; exclude judging time from service latency; normalize large weights; round only the final combined score. |
| Round state | Persist until a successful receipt; recover after a reveal mined before restart; reject another critic's saved state; serialize same-round operations and file writes; reject invalid IDs and inputs before saving. |
| Consensus | Require registered critic status; compare actual local-chain medians with an independent reference and test monotonicity; reject invalid persona numbers. |
| Seed/drills | Give rounds unique global IDs; use collision-resistant temporary files; assert exact fixture identities, median and slash amounts; require funded void-round fixtures. Failure-drill timing is explicitly separate from full demo rehearsal. |
| Documentation | Correct actor and payment-flow diagrams, disclose event fake identity proofs, disclose relayer trust, and list actual review dependencies. |

Service suite expectations were also exercised against the handlers: unit conversion 100%, JSON extraction 100% with a deterministic extractor fixture, CSV cleaning 75%, and flaky FX 75% with its default deterministic seed / 100% with staleness disabled. CSV and FX are intentionally imperfect demo services.

## Local verification environment

The disposable workspace is `/private/tmp/skeptique-review-harness`. Its application, package, contract and script sources point to the assembled `card/28` worktree. Package configuration and dependency links remain local because ticket 04 owns the committed workspace. This environment uses Node 22.23.2 on an M1 Mac.

The application tests use real local HTTP servers, a memory evidence store, recorded probe cases and an explicit deterministic judge. Contract tests use Hardhat and a test-only critic registry. These validate local code behavior; they do not establish Hedera payments, official World verification, ENS writes, HCS messages, stake custody or reward delivery.

Final combined checks passed **105 Vitest tests across 24 files** (10.28 seconds), **10 Hardhat tests**, and application and contract TypeScript checks. The Hardhat suite includes 24 generated rounds with 3–7 critics and unequal stakes; all medians match the reference. Vitest includes 1,000 generated monotonicity cases. Two successive seed commands and all four fixture failure drills also passed. GitHub currently has no automated checks attached to these PRs; these are local results.

### HTTP reviews and local-chain settlement

`scripts/demo/dev2-flow.test.ts` starts real HTTP services and the evidence/ranking API. Three local critic identities each review both the good converter and the suite-gamer, using recorded private probes and a deterministic judge. Both services pass 100% of their public cases. Private probes score the good converter at 100% and the gamer at 0%, yielding final scores of **100 and 40**. The API stores and retrieves all six hashed evidence documents. Ranking selects the good converter despite the gamer's higher synthetic popularity; the buyer receives `300 cm` for `3 m`. Changed suite hashes and denied payment policies prevent service calls; an offline service produces explicit failures without fabricated payment evidence. The successful HTTP flow took 4.425 seconds in this run.

`scripts/demo/settle-local-review.ts` consumes that run's evidence. Before submitting transactions it independently recomputes canonical hashes, checks critic identities and raw outputs, and recomputes all six scores. It then deploys the real RoundManager with a mock registry on in-process Hardhat, commits and reveals through the actual round-agent adapters, recreates each agent from persisted state, and finalizes two three-critic rounds. The 21 successful local transactions produce medians **100 and 40**. They are local EVM transactions, not Hedera payment or sponsor evidence.

Commands used in the disposable harness (whose package scripts/configuration are local scaffolding):

```sh
DEV2_EVIDENCE_PATH=/private/tmp/skeptique-local-flow.json pnpm test -- scripts/demo/dev2-flow.test.ts
pnpm typecheck
DEV2_EVIDENCE_PATH=/private/tmp/skeptique-local-flow.json DEV2_SETTLEMENT_PATH=/private/tmp/skeptique-local-settlement.json pnpm settle:local
pnpm test:contracts
pnpm seed
pnpm seed
pnpm drills
```

The test invocation above ran the full 105-test suite. Both output artifacts explicitly declare `LOCAL_ONLY` and `sponsorNetworkEvidence: false`. The HTTP and settlement phases share verified evidence; ranking uses an explicit local snapshot rather than a production chain indexer. Three fixture identities using the same recorded oracle do not establish independent reviewers or live model accuracy. Mock stake counters do not establish custody, slashing transfers or rewards. This staged check is not the full sponsor-integrated demo rehearsal.

## Efficiency measurements

These are CPU measurements in the local review environment while other reviewers were running. They exclude live inference, network settlement and remote API latency. Hashing/ranking used five warmups and 50 samples; worker measurements used three warmups and 20 samples. No timing thresholds are used as flaky unit assertions.

| Operation | Median | p95 |
| --- | ---: | ---: |
| Hash a 10-case suite | 0.245 ms | 3.598 ms |
| Hash a 100-case suite | 1.118 ms | 2.002 ms |
| Hash a 1,000-case suite | 7.187 ms | 12.910 ms |
| Rank 1,000 services | 1.319 ms | 2.007 ms |
| Rank 10,000 services | 20.608 ms | 31.067 ms |
| Start worker and precompile suite | 117.597 ms | 148.942 ms |
| Evaluate ten cases in that worker | 3.272 ms | 4.440 ms |

Suite and probe evaluators accept per-operation `timeoutMs` and a total `budgetMs`. Integration code must set the total budget from the remaining commit window, leaving time to publish evidence and confirm the commit. A budget expiry aborts evaluation rather than returning a partial score. Judge/generation failures also abort. Service call failures remain explicit failed cases.

The local client performs no payment and reports `paid: false`, `txId: null`. Its `criticCall` argument is internal accounting metadata and is not sent to merchants. The production indexer must attribute critic traffic using the real authenticated payment identity; an untrusted request flag is insufficient.

## Remaining integration gates

- Ticket 04's workspace is still needed for the clean-clone install/build/e2e acceptance commands.
- The real service registry must check service existence and funded bounty before opening a round.
- The real critic registry needs agreed stake locking, authorized slashing and fund-transfer semantics. A stake snapshot can currently be reused in simultaneous rounds; a mock's accounting is not proof that real slashed funds reach the right recipient.
- Non-reveal slashing, void-round finalization, reimbursements, rewards and claims require their owning tickets. The void and World drills remain fixture adapters.
- The API needs its real indexer and persistent evidence store, and the web application needs its integration.
- Ticket 27 must supply real Hedera x402, ENS resolver, HCS and unattended-buyer evidence. The event's World mock identities do not establish real-human uniqueness.
- Full demo rehearsal must time every actual script beat; the failure-drill timer cannot satisfy that criterion.
- Dev 1 must review contract changes. All PRs remain drafts and no completion receipts are added prematurely.

AI use: Codex and delegated coding/review agents assisted with diagnosis, regression tests, implementation, local validation and these notes. No live model request or sponsor-network transaction was required for this review.
