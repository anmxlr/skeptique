# Ticket 19: ranking and event-read choices

The frozen mechanism remains `confidence = min(1, nReveals/5) * max(0.3, 0.5^(ageDays/7))`, then `rank = median - 15*(1-confidence)`. This is a count/age heuristic, **not** a calibrated statistical probability or confidence interval. Unreviewed services remain visible in probation and cannot enter the buyer's ranked choices.

Sources read during implementation:

- [Evan Miller, How Not To Sort By Average Rating](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html): raw averages hide sample-size uncertainty. Its Wilson bound assumes binary outcomes; our 0–100 weighted review scores and frozen formula do not justify importing that estimator. Kept the specified penalty and tested equal medians with different reveal counts.
- [viem contract-event documentation](https://viem.sh/docs/contract/getContractEvents), verified from [the upstream source](https://github.com/wevm/viem/blob/main/site/pages/docs/contract/getContractEvents.md): address/event scoping, bounded block ranges and strict decoding. Reused the existing viem dependency, shared contract ABI, and one pinned latest block for the finalization scan. No indexer dependency added.

Efficiency checks are behavioral, not invented throughput numbers: one finalization-log query for all services, one block lookup per distinct finalization block, and no repeated block lookup for two services finalized in the same block. Unit tests assert these RPC counts and that a second request sees a newly finalized round. The live source reconstructs history per request; scanning from genesis is appropriate only for this hackathon-sized deployment. A deployment-block start and persistent, reorg-aware event index are later scaling work, not an in-memory cache that can silently serve stale rankings.

The acceptance test deploys the real registries and RoundManager, registers five real local critics, finalizes two score-80 rounds with three versus five reveals, and verifies API ordering plus rendered confidence/probation states. It uses existing fixtures instead of implementing a second contract stack.
