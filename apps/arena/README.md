# @skeptique/arena

Two buyer agents get the same task and the same budget. A task has 1-5 parts (unit or currency conversions, often a word problem split by the parser), and each agent picks at most one paid x402 service per part, in a single model call:

- **baseline** sees what today's x402 discovery shows: category, price and popularity (paid calls by other buyers).
- **skeptique** sees the same listing plus Skeptique's stake-backed review evidence (median score, confidence, rounds), and its purchase must pass a deterministic spend policy (minimum median, at least one finalised review round) before any money moves.

Both pay real x402 payments on Hedera testnet, one per part, in order; the spend policy's budget is checked against what earlier parts already committed. A deterministic oracle grades each part, and every run produces a sha256-hashed record (`version: 3`) over RFC 8785 canonical JSON.

## Fairness rules

- **Same everything except the evidence.** Both agents use the same model (Claude Haiku by default, via `claude -p`, safe mode, no tools), the same system prompt, the same structured task (parsed once and shared), the same budget and per-call cap. Their prompts differ only in the evidence fields and the field legend (this is covered by a test).
- **Names hidden from both sides.** Services appear as `Service #k`. Option numbers are a fresh random permutation per category for every run, shared by both sides, so list order and "lowest number" carry no signal. The seed and the `options` mapping (`category`, `option`, `serviceId`) are in the record.
- **No LLM grading.** The model only chooses. Each part is graded by `src/oracle.ts`: SI unit factors, the documented HBAR/ETH denominations (graded relatively) and a fixed FX reference table. Each verdict links to its source. A task with any part the oracle cannot grade is refused before either side runs.
- **Headline metric:** parts delivered *and* correct (`correctParts` / `totalParts`), shown next to wasted tinybars (paid for parts graded wrong). A run is `correct` when every part is, `partial` when some are; a refusal or a policy block counts as "no answer", never as a win.
- **Task pack** (`src/tasks.ts`): 8 multi-part preset tasks (19 parts): 4 Web3 (HBAR/tinybar, ETH/gwei, fiat), then 4 everyday. `suite-mix` puts two parts on unit-convert's public suite, where the suite-gamer is right. Presets carry their structured task and never go through the parser.

## Run

```sh
pnpm --filter @skeptique/arena live
```

This starts a reviewed local marketplace (`src/local-market.ts`) and the arena on `http://127.0.0.1:4320`. `apps/arena/.env` must hold:

- `X402_FACILITATOR_URL`, `SELLER_ACCOUNT_ID`, `BUYER_ACCOUNT_ID`, `BUYER_PRIVATE_KEY` (required)
- `ARENA_BASELINE_ACCOUNT_ID` / `ARENA_BASELINE_PRIVATE_KEY`: optional separate wallet for the baseline. Without it, both sides share the buyer wallet and their payments are serialised.
- `ARENA_BUDGET_TINYBARS` (default 100000000, per side per run, across all parts) and `ARENA_MIN_MEDIAN` (default 70): optional.
- `FLAKY_FX_SEED` (default 1306) and `FLAKY_FX_RATE` (default 0.3): flaky-fx's seeded stale-answer generator. With the defaults the local market finalises unit-convert 100, suite-gamer 40, flaky-fx 67, fx-reference 100.

The arena refuses to start if a buyer account equals the seller account or if any listed endpoint does not answer HTTP 402 without payment. `pnpm --filter @skeptique/arena start` with `API_URL` runs it against an existing Skeptique API instead.

## API

Requests must use Host `127.0.0.1:<port>` or `localhost:<port>` (any other host gets 403). CORS allows `WEB_ORIGIN` (default `http://localhost:3000`). Runs and batches share one lock: while either is in progress, `POST /runs` and `POST /batches` return 409.

| Route | |
| --- | --- |
| `GET /health` | model, `models` (allowed per-run models), `acceptsUserCredentials`, network, busy flag, paywall probe results, buyer accounts, provenance |
| `GET /tasks` | the fixed task pack (`id`, `prompt`, `why`, `group`: web3 or general) |
| `POST /runs` `{ "prompt": "...", "mode"?, "credentials"? }` | 202 `{ runId }`; 400 for a prompt outside 3-300 chars or invalid credentials |
| `GET /runs/:id` | `{ type: "run-finished", record, hash }`, or `{ type: "pending" }` |
| `GET /runs/:id/events` | SSE: `run-started`, per side `decided` → one `part` per part → `graded`, then `run-finished` or `run-failed` |
| `POST /batches` `{ "mode"?, "credentials"? }` | 202 `{ batchId }`; runs every task-pack task in order, each as a normal run |
| `GET /batches/:id/events` | SSE: `batch-started`, one `batch-task` per task (run id, run hash, per-side summary), then `batch-finished` (scoreboard, run hashes, batch hash) or `batch-failed` |

SSE streams replay every event so far and close after the terminal event. The batch hash is sha256 over canonical JSON of `{ scoreboard, runHashes }`, and each run hash can be checked against `GET /runs/:id`. The scoreboard counts run outcomes per side plus `correctParts` and `totalParts`.

### User credentials

`credentials` is optional: `{ hederaAccountId: "0.0.x", hederaPrivateKey: "<hex, 0x optional>", anthropicApiKey?: string, model?: "claude-haiku-5-5" | "claude-sonnet-5-5" }` (model defaults to Haiku). With it, both sides pay from that account (payments serialised), the account must differ from the seller (else 400), and the model runs with `ANTHROPIC_API_KEY` set to the given key in the CLI's env (otherwise the server's CLI login). Keys are never stored, logged or echoed: the record keeps only the payer account id, `model` and `credentialSource: "user" | "server"`, and error text is scrubbed of the keys.

## Disclosed shortcuts (local marketplace)

The local marketplace runs the production review path (listing on ServiceRegistry, staked critics, public suite plus held-out probes, commit, reveal, stake-weighted median), with these shortcuts:

- Critics call a free review instance of each service (same handler code). Critic x402 payments are shown separately on Hedera; paying about 100 critic calls per demo would make it slow.
- Probes are fixed held-out cases, not LLM-generated, so the scores are reproducible. Each service's 3 critics get different thirds of a 9-probe pool for its category, so their scores can differ (with the defaults: suite-gamer 40/40/60, flaky-fx 70/47/67). Judge cases are graded by the arena oracle, not a model.
- All four listed services are reviewed. fx-reference (`src/fx-reference.ts`) is an honest FX vendor defined in this app, listed with the same `listService` call as `scripts/demo/list-services.ts`.

Buyer calls go to the listed endpoints, which require real x402 payment on Hedera testnet.
