# Skeptique Arena: does the trust layer help a buyer agent?

`/arena` gives the same task to two buyer agents at the same time. Only one thing differs: what they know about the vendors.

| Same for both agents | Different |
|---|---|
| Model (Claude Haiku 5.5 or Sonnet 5.5, via `claude -p`, no tools) | **Without Skeptique:** price and popularity, i.e. what x402 discovery offers today |
| System prompt, including "can skip" or "must buy" | **With Skeptique:** the same, plus stake-weighted review scores |
| Parsed task (1–5 parts), budget, vendors, real x402 on Hedera testnet | **With Skeptique:** a spend policy (vendor reviewed, median ≥ 70) |

Tasks are word problems mixing unit and currency conversion, for example "A runner did a 26.2-mile marathon and paid a 120 USD entry fee: km and EUR?". Haiku parses free text into parts once, and both agents get the same parts.

## Fairness and correctness
- **Nothing leaks to either side.** Vendor names are hidden from both agents. Listings appear in a seeded random order, shuffled independently per category, and the mapping is the same for both agents and stored in the record. Over 4,000 seeds the good vendor lands first 50.4% of the time.
- **No LLM grading.** A deterministic oracle grades every part: SI factors, C/F/K formulas, and currency to the cent against a reference table. Tasks it cannot grade are refused before any money moves.
- **Independent critics.** In the local market every vendor is reviewed by 3 critics, each with its own held-out probe set. The judge case is graded by the oracle, and medians are finalised on-chain by `RoundManager`:

  | Vendor | Median |
  |---|---|
  | unit-convert | 100 |
  | suite-gamer | 40 |
  | flaky-fx | 67 (stale about 30% of the time) |
  | fx-reference | 100 |

- **Verifiable records.** Every run is a record (sha256 over RFC 8785 canonical JSON) containing:
  - the verbatim prompts and raw model output
  - the seed and option mapping
  - payer, policy and model-key source per side
  - the tx ids
- **Your own keys.** You can bring your own Hedera testnet account and Anthropic key. They are kept in browser memory, sent only to your local arena server for that run, never stored, and redacted from errors.

## Results (Hedera testnet, "must buy", 8 tasks, 17 parts)

**Expected value.** The status-quo agent has no signal to separate vendors, so its pick is a coin flip per category (it reliably takes option 1, and option order is random).
- With the real vendors that gives an expected 11.6/17 parts correct (68%), and about 32% of its spend going to wrong answers.
- The Skeptique agent's policy blocks suite-gamer (40) and flaky-fx (67), so it is expected to get 17/17.

**Measured, live:** three live batches, 51 paid parts per side

| Batch (hash) | Without Skeptique | With Skeptique |
|---|---|---|
| 1 `0xb3e5…aa9b` | 16/17 correct, 1 tinybar wasted | 17/17, 0 wasted |
| 2 `0x11b8…5763` | 14/17, 3 wasted | 17/17, 0 wasted |
| 3 `0xbd85…a7d` | 8/17, 9 wasted | 17/17, 0 wasted |
| **Total** | **38/51 (75%), 13/51 tinybars wasted (25%)** | **51/51 (100%), 0 wasted** |

Full batch hashes:
- `0xb3e51809674ee3a652da27fe7f62bb996536259ea85ea979df0a1ec93123aa9b`
- `0x11b87ba99bba7a540ec7e1b7c50dafd42fc869fdcaf6039cfb9d361788445763`
- `0xbd856b16c142d9e09870ccc591f00acfad916395e1754cdf81ff7e10464b1a7d`

Each batch is one draw of the coin, which is why the expected value is the claim and the batches are evidence.

**Example settled payments (marathon task, mirror result `SUCCESS`):**
- **Without Skeptique:** paid suite-gamer and got `26.2 km` for 26.2 miles: [0.0.9185802@1794011192.046825403](https://hashscan.io/testnet/transaction/0.0.9185802@1794011192.046825403)
- **With Skeptique:** paid unit-convert and got `42.1648128 km`: [0.0.9185802@1794011193.573015381](https://hashscan.io/testnet/transaction/0.0.9185802@1794011193.573015381)

## Limits
- **Agreement is not ground truth.** The arena measures, against an oracle, whether review scores helped a buyer.
- **Local-market shortcuts:**
  - Critics call a free review instance of the same handler code. Critic x402 payments are shown separately in receipt 15.
  - Probes are fixed held-out sets.
  - The local quorum is K_MIN = 1.
- **flaky-fx noise.** Its randomness means a critic can be an outlier, and get slashed, for an honest result. This is the "nondeterministic services" limit from spec §6.
- **No popularity signal.** Popularity is 0 locally. On a real marketplace it adds some signal, and noise of its own.

## AI use
Built with Claude Code (Claude Opus 5.5 as lead, with parallel subagents for the UI, the backend, and two independent reviews against the Karpathy guidelines, including a maths audit; findings were applied). At runtime the agents and the task parser use Claude Haiku 5.5, or Sonnet 5.5 if the user picks it. No model grades answers.

Run it: see `apps/arena/README.md`.
