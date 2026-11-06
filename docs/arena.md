# Skeptique Arena: does the trust layer help a buyer agent?

The arena gives one task to two buyer agents running at the same time. Only one thing differs between them: what they are told about the services.

| Same for both agents | Different |
|---|---|
| Model (Claude Haiku 5.5 via `claude -p`, no tools, `--safe-mode`) | **Without Skeptique:** listing metadata and popularity, i.e. what x402 discovery offers today |
| System prompt, including the buyer instruction (`may-refuse` or `must-buy`) | **With Skeptique:** the same, plus the stake-weighted median, confidence, rank and review rounds |
| Parsed task, budget, per-call cap, service pool | **With Skeptique:** a deterministic spend policy that must pass (reviewed, median ≥ 70) |
| Real x402 payments on Hedera testnet | |

## Fairness rules
- **No answer leaks to either side.** Service names are hidden from both agents. Listings are shown in a seeded random order with neutral option numbers, and the mapping is identical for both agents. An earlier version leaked the answer twice, first through names and then through the API's rank order; both were found in live runs and fixed.
- **No LLM grading.** A deterministic oracle grades every answer: SI unit arithmetic and a reference FX table. Tasks the oracle cannot grade are refused before any money moves.
- **The task pack is not cherry-picked.** It includes inputs from the public suite, where the suite-gamer is correct, and FX tasks, where blocking an unreviewed service can cost Skeptique an answer.
- **Every run is a record.** Each record holds the verbatim prompts, the raw model output, the seed and option mapping, payer and policy per side, provenance, and the tx ids. Its hash is a sha256 over RFC 8785 canonical JSON.

## Live results (2026-11-07, Hedera testnet, buyer `0.0.11345703`, seller `0.0.11334361`)
The ranking comes from the local market (`pnpm --filter @skeptique/arena live`). Those are real review rounds on a local chain: unit-convert finalised at 97 and suite-gamer at 40, while flaky-fx is listed but unreviewed. Every buyer purchase is a real x402 payment on Hedera testnet.

**Must buy** (the user needs an answer), task pack of 8. Batch hash `0x3fada461f8fec8924a7e7e445992472d63a16eb9dcf15f20a395470814b68e83`

| | Correct | Wrong | No answer | Tinybars spent | Wasted on wrong answers |
|---|---|---|---|---|---|
| Without Skeptique | 5 | 3 | 0 | 8 | 3 (37.5%) |
| With Skeptique | 6 | 0 | 2 | 6 | 0 |

**May refuse** (buying nothing allowed). Batch hash `0xc69ffb1bd9764b6f25753f8688ac29500b2bf408b79aea801d459985131d7124`

| | Correct | Wrong | No answer |
|---|---|---|---|
| Without Skeptique | 1 | 0 | 7 |
| With Skeptique | 6 | 0 | 2 |

How to read these:
- Without trust signals, a careful agent either guesses or buys nothing. Guessing wastes money on the suite-gamer whenever the task is off its memorised public suite. Buying nothing means the honest vendor loses the sale.
- The trade-off: Skeptique blocked the unreviewed FX service both times. That service is stale about 30% of the time; in the must-buy batch it happened to answer correctly, so blocking it cost two answers.
- These are single batches with one model. They show the mechanism, not a statistically powered result.

### Example: "Convert 3 metres to centimetres" (must buy)
Run hash `0xc9c24fcaf42538b72fe44ec1fcda79de4b0a2e90f007b49f5b06db827621b644`.

| Side | Picked | Got | Payment (mirror result `SUCCESS`) |
|---|---|---|---|
| Without Skeptique | suite-gamer | `{"result": 3, "unit": "cm"}` ✗ | [0.0.9185802@1794009007.959259622](https://hashscan.io/testnet/transaction/0.0.9185802@1794009007.959259622) |
| With Skeptique | unit-convert | `{"result": 300, "unit": "cm"}` ✓ | [0.0.9185802@1794009007.011761627](https://hashscan.io/testnet/transaction/0.0.9185802@1794009007.011761627) |

## Limits
- **Agreement is not ground truth.** Skeptique scores come from critic consensus. The arena measures whether those scores helped a buyer, against an oracle.
- **Local-market shortcuts:**
  - Critics call a free review instance of the same handler code. Critic x402 payments are shown separately in receipt 15.
  - Probes are fixed held-out cases.
  - The three critics per service run identical deterministic code.
  - The suite's judge case always fails, which costs the honest service about 3 points.
- **Popularity is zero** for every service in the local market, so the status-quo agent has no usage signal at all. On a real marketplace, popularity would add signal, and noise of its own.
- **Model choices vary from run to run.** Re-run the task pack rather than trusting one run.

See `apps/arena/README.md` to run it yourself.
