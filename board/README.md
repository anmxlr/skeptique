# skeptic board

34 tickets, 12 dependency waves. Tickets are tracer-bullet vertical slices: each cuts through every layer it needs (contract, api, app, web, tests) and is verifiable on its own. They live in `.scratch/skeptic-v1/issues/NN-<slug>.md`, one file per ticket. A ticket is **done** when `board/done/NN.md` exists (its receipt). Nothing else tracks state, so parallel agents never conflict on a shared file.

The old lane cards in `board/cards/` are kept for history only; the orchestrator no longer reads them.

```bash
node board/status.mjs          # ready / blocked / waves
node board/status.mjs --check  # fail on unknown blockers, bad sizes, cycles
```

## How to run it AFK (orchestrator loop)
1. `node board/status.mjs` and take up to **4 ready agent tickets** that don't edit the same files. Known overlaps that must run one after another even when both are ready: 17, 22 and 25 all change the round contract's finalise logic; 12, 20 and 23 all add relayer handlers.
2. For each: create a worktree `git worktree add ../wt-<NN> -b card/<NN>`, start a **fresh** agent session there with exactly this prompt:
   > Read AGENTS.md. Your ticket is `<NN>` in .scratch/skeptic-v1/issues/. Follow AGENTS.md exactly. Stop when the ticket's "done when" passes and the receipt is written.
3. When a session reports done: check the receipt and that the "done when" command passes yourself, merge `card/<NN>` into `main` (regular merge, keep history), remove the worktree, rerun status, repeat.
4. A `*-SPLIT.md` or blocker note means: edit the ticket, do not push the agent on.
5. Human tickets (`Status: needs-human`) show as `HUMAN` in status; suggest `/wizard` for each. **Ticket 01 gates the World spike (05) and every live test; do it first.** Spikes 02 and 03 start immediately but pause at their live step until 01 is done.

## Smart-zone discipline
Each ticket is S (<=45 min) or M (<=90 min), names the spec sections it reads, and builds against the frozen shared package (06), the local stack harness (07) and local x402 mode, so every agent finishes inside the first ~40% of its context window and slices never wait on each other's unmerged code. If a ticket keeps blowing the budget, split it by thinning the behaviour, not by layer; do not give the agent a bigger window.

## 30-hour plan (adjust as you go)
| Hours | Focus | Tickets |
|---|---|---|
| 0-3 | Human: 01. Agents: scaffold 04, spikes 02 and 03, then shared package 06, harness 07, World spike 05 | waves 0-1 |
| 3-8 | Walking skeleton: 08, then 09-13 in parallel, then one full local round 14; real x402 15; World onboarding 16 | waves 2-4 |
| 8-14 | Thicken: consensus 17, probes 18, ranking 19, ENS scores 20, testnet deploy 21, feedback docs 32 | wave 5 |
| 14-19 | Rewards 22, HCS log 23, buyer 24, then void round 25 and spend controls 26 | waves 6-7 |
| 19-24 | Testnet end to end 27, polish 30, then seed/drills 28, live deploy 29, README 31 | waves 8-9 |
| 24-30 | Human: video 33, submission 34 (deadline Sat 7 Nov 09:00 IST). Buffer for fixes | waves 10-11 |

## Where it can go wrong
- **Spikes find the sponsor API differs from the spec** (e.g. Agent Pass has no stable per-human id, x402 facilitator only settles USDC). The spike notes win; patch `spec/03-interfaces.md` only with a human OK and a `spec/CHANGELOG.md` entry.
- **Agents invent several versions of the same helper.** Shared types and pure functions go only in `packages/shared` (created by 06, extended by the slice that needs a function, e.g. ranking in 19).
- **Late integration surprises.** Every slice has its own end-to-end test on the local stack; the live-network check (27) is the only big-bang step, so run 15, 20, 21 and 23's live tests as soon as each merges.
