# @skeptique/arena

Two buyer agents get the same task and the same budget and each picks at most one paid x402 service:

- **baseline** sees what today's x402 discovery shows: category, price and popularity (paid calls by other buyers).
- **skeptique** sees the same listing plus Skeptique's stake-backed review evidence (median score, confidence, rounds), and its purchase must pass a deterministic spend policy (minimum median, at least one finalised review round) before any money moves.

Both pay real x402 payments on Hedera testnet. A deterministic oracle grades the answers, and every run produces a sha256-hashed record over RFC 8785 canonical JSON.

## Fairness rules

- **Same everything except the evidence.** Both agents use the same model (Claude Haiku via `claude -p`, safe mode, no tools), the same system prompt, the same structured task, the same budget and per-call cap. Their prompts differ only in the evidence fields and the field legend (this is covered by a test).
- **Names hidden from both sides.** Services appear as `Service #k`. Option numbers are a fresh random permutation for every run, shared by both sides, so list order and "lowest number" carry no signal. The seed and the `options` mapping are in the record.
- **No LLM grading.** The model only chooses. Answers are graded by `src/oracle.ts`: SI unit factors and a published FX reference table. Tasks the oracle cannot grade are refused before either side runs.
- **Headline metric:** answers delivered *and* correct, shown next to wasted tinybars. A refusal or a policy block counts as "no answer", never as a win.

## Run

```sh
pnpm --filter @skeptique/arena live
```

This starts a reviewed local marketplace (`src/local-market.ts`) and the arena on `http://127.0.0.1:4320`. `apps/arena/.env` must hold:

- `X402_FACILITATOR_URL`, `SELLER_ACCOUNT_ID`, `BUYER_ACCOUNT_ID`, `BUYER_PRIVATE_KEY` (required)
- `ARENA_BASELINE_ACCOUNT_ID` / `ARENA_BASELINE_PRIVATE_KEY`: optional separate wallet for the baseline. Without it, both sides share the buyer wallet and their payments are serialised.
- `ARENA_BUDGET_TINYBARS` (default 100000000) and `ARENA_MIN_MEDIAN` (default 70): optional.

The arena refuses to start if a buyer account equals the seller account or if any listed endpoint does not answer HTTP 402 without payment. `pnpm --filter @skeptique/arena start` with `API_URL` runs it against an existing Skeptique API instead.

## API

Requests must use Host `127.0.0.1:<port>` or `localhost:<port>` (any other host gets 403). CORS allows `WEB_ORIGIN` (default `http://localhost:3000`). Runs and batches share one lock: while either is in progress, `POST /runs` and `POST /batches` return 409.

| Route | |
| --- | --- |
| `GET /health` | model, network, busy flag, paywall probe results, buyer accounts, provenance |
| `GET /tasks` | the fixed task pack (`id`, `prompt`, `why`) |
| `POST /runs` `{ "prompt": "..." }` | 202 `{ runId }`; 400 for a prompt outside 3-300 chars |
| `GET /runs/:id` | `{ type: "run-finished", record, hash }`, or `{ type: "pending" }` |
| `GET /runs/:id/events` | SSE: `run-started`, per side `decided` → `policy` → `paid` → `graded`, then `run-finished` or `run-failed` |
| `POST /batches` | 202 `{ batchId }`; runs every task-pack task in order, each as a normal run |
| `GET /batches/:id/events` | SSE: `batch-started`, one `batch-task` per task (run id, run hash, per-side summary), then `batch-finished` (scoreboard, run hashes, batch hash) or `batch-failed` |

SSE streams replay every event so far and close after the terminal event. The batch hash is sha256 over canonical JSON of `{ scoreboard, runHashes }`, and each run hash can be checked against `GET /runs/:id`.

## Disclosed shortcuts (local marketplace)

The local marketplace runs the production review path (listing on ServiceRegistry, staked critics, public suite plus held-out probes, commit, reveal, stake-weighted median), with these shortcuts:

- Critics call a free review instance of each service (same handler code). Critic x402 payments are shown separately on Hedera; paying about 100 critic calls per demo would make it slow.
- Probes are fixed held-out cases, not LLM-generated, so the scores are reproducible.
- The probe judge always answers "fail", which costs the honest service about 3 points of median.
- The 3 critics per service run identical deterministic code, so their scores agree by construction.
- flaky-fx is listed but never reviewed, so it stays unrated.

Buyer calls go to the listed endpoints, which require real x402 payment on Hedera testnet.
