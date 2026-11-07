# Skeptique Arena: does the trust layer help a buyer agent?

`/arena` gives the same task to two buyer agents at the same time. Only one thing differs: what they know about the vendors.

| Same for both agents | Different |
|---|---|
| Model (Claude Haiku 5.5 or Sonnet 5.5, via `claude -p`, no tools) | **Without Skeptique:** price and popularity, i.e. what x402 discovery offers today |
| System prompt, including "can skip" or "must buy" | **With Skeptique:** the same, plus stake-weighted review scores |
| Parsed task (1–5 parts), budget, vendors, real x402 on Hedera testnet | **With Skeptique:** a spend policy (vendor reviewed, median ≥ 70) |

Tasks are word problems. Four are Web3, using HBAR/tinybar and ETH/gwei mixed with fiat (e.g. "21,000 gas at 30 gwei: fee in ETH?"). Four are everyday problems (e.g. "a 26.2-mile marathon and a 120 USD fee: km and EUR?"). Haiku parses free text into parts once, and both agents get the same parts.

## Fairness and correctness
- **Nothing leaks to either side.** Vendor names are hidden from both agents. Listings appear in a seeded random order, shuffled independently per category, and the mapping is the same for both agents and stored in the record. Over 4,000 seeds the good vendor lands first 50.4% of the time.
- **No LLM grading.** A deterministic oracle grades every part. It uses SI factors and C/F/K formulas, the documented crypto denominations (1 HBAR = 10^8 tinybar; 1 ETH = 10^9 gwei = 10^18 wei, compared relatively so tiny amounts are not rounded to 0), and currency to the cent against a fixed demo reference table. Tasks it cannot grade are refused before any money moves.
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

## Results (Hedera testnet, "must buy", 8 tasks, 19 parts)

The pack has 4 Web3 tasks (HBAR/tinybar and ETH/gwei, mixed with fiat) and 4 everyday word problems.

**Expected value.** The status-quo agent has no signal that separates vendors. It reliably takes option 1, and option order is random, so its pick is a coin flip per category. With the real vendors that gives an expected **12.25/19 parts correct (64.5%)**:
- 12 conversion parts the suite-gamer gets wrong: 12 × ½ = 6
- 2 parts on the public suite, where the gamer is right: 2 × 1 = 2
- 5 currency parts: 5 × (½ + ½ × 0.7) = 4.25

The Skeptique agent's policy blocks suite-gamer (median 40) and flaky-fx (median 67), so it is expected to get 19/19.

**Measured, live:**

| Batch | Without Skeptique | With Skeptique |
|---|---|---|
| 1 | 15/19 correct, 4 tinybars wasted | 19/19, 0 wasted |
| 2 | 10/19, 8 wasted (1 payment timed out unpaid) | 19/19, 0 wasted |
| **Total** | **25/38 (66%), 12 of 37 paid tinybars (32%) spent on wrong answers** | **38/38 (100%), 0 wasted** |

Batch hashes:
- `0xbd4295fab152d508d4cbcfa1037e23bda3a9299faa8e3c4aff955dcc771071e0`
- `0x61221603f587635ae8ed186d58dfb3c00ac6839ed86e777753706ce9977847fc`

**Example ("21,000 gas at 30 gwei: fee in ETH?"):**
- **Without Skeptique:** paid suite-gamer and was told the fee is **630000 ETH**: [0.0.9185802@1794014115.000823419](https://hashscan.io/testnet/transaction/0.0.9185802@1794014115.000823419)
- **With Skeptique:** paid unit-convert and got **0.00063 ETH**: [0.0.9185802@1794014112.716860391](https://hashscan.io/testnet/transaction/0.0.9185802@1794014112.716860391)
- **Where the right answer is defined:** [ethereum.org](https://ethereum.org/en/developers/docs/intro-to-ether/)

## "What if the agent makes things up?"
Each side card has a small **Where this came from** corner. In plain words it shows:
- **What the agent used:** price, other buyers and, for Skeptique, the review score.
- **Where to check it:** links to the listing, the raw data, the testers' results and the HashScan payment, plus the official page that defines the right answer.
- **A made-up check:** every number and field the agent quoted is matched against the exact data it was shown, excluding the fixed explanation text. Anything not found is flagged. It proves a number appears in its data, not which vendor that number belongs to.

The check is deliberately strict: a number the agent worked out itself, such as a sum, shows as "not directly in its data".

## Limits
- **Source links.** Answer sources link to NIST, the Hedera docs and ethereum.org. Currency answers link to the demo's fixed rate table, not live market rates.
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
