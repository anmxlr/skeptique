# skeptic kanban board

60 cards, 9 lanes, 12 dependency waves. Cards live in `board/cards/lane-*.md`. A card is **done** when `board/done/<ID>.md` exists (its receipt). Nothing else tracks state, so parallel agents never conflict on a shared file.

```bash
node board/status.mjs          # ready / blocked / waves
node board/status.mjs --check  # fail on unknown deps, bad sizes, cycles
```

## How to run it AFK (orchestrator loop)
1. `node board/status.mjs` and take up to **4 ready agent cards** that touch different directories (check the `lane` column; never two writers in one lane at once unless the cards name different files).
2. For each: create a worktree `git worktree add ../wt-<ID> -b card/<ID>`, start a **fresh** agent session there with exactly this prompt:
   > Read AGENTS.md. Your card is `<ID>` in board/cards/. Follow AGENTS.md exactly. Stop when the card's "done when" passes and the receipt is written.
3. When a session reports done: check the receipt and that the "done when" command passes yourself, merge `card/<ID>` into `main` (regular merge, keep history), remove the worktree, rerun status, repeat.
4. A `*-SPLIT.md` or blocker note means: edit the card, do not push the agent on.
5. Human cards (`who: human`) are shown as `HUMAN` in status. **H-01 gates all testnet work and S-03; do it first.**

## Smart-zone discipline
Each card is S (<=45 min) or M (<=90 min), reads at most three spec sections, and builds against frozen interfaces plus fixtures/mocks, so every agent finishes inside the first ~40% of its context window and lanes never wait on each other's code. If a card keeps blowing the budget, split it; do not give the agent a bigger window.

## 30-hour plan (adjust as you go)
| Hours | Focus | Cards |
|---|---|---|
| 0-2 | Humans: H-01, start demo-call booth chats. Agents: T-00, S-01, S-02, then T-01 | wave 0-1 |
| 2-10 | Five lanes in parallel on contracts, services, critic, identity, api, web shell | waves 2-4 |
| 10-18 | Contracts finish, deploy, critic loop, buyer, web pages | waves 4-6 |
| 18-23 | Integration: local e2e, testnet e2e with HashScan evidence, drills | waves 7-9 |
| 23-28 | Polish, README, diagram, feedback docs, deploy, video | waves 9-10 |
| 28-30 | Buffer: P-7 submission checklist, resubmit fixes | wave 11 |

## Where it can go wrong
- **Spikes find the sponsor API differs from the spec** (e.g. Agent Pass has no stable per-human id, x402 facilitator only settles USDC). The spike notes win; patch `spec/03-interfaces.md` only with a human OK and a `spec/CHANGELOG.md` entry.
- **Five agents invent five versions of the same helper.** Shared code goes only in `packages/shared`, owned by T-01 and E-2.
- **Late integration surprises.** I-1 (local e2e) can start as soon as its deps merge; run it early even if partial.
